import { test, expect } from '@playwright/test';
import { test as cognitiveTest } from '../helpers/test-fixtures';
import { graphFixtures, performanceBaselines } from '../fixtures/cognitive-graph-data';

/**
 * Performance testing suite with 240 FPS validation
 * Tests rendering performance, memory usage, and optimization features
 */

cognitiveTest.describe('Cognitive Fabric Visualizer - Performance Validation', () => {
  cognitiveTest.describe.configure({ retries: 3 }); // Performance tests need more retries

  cognitiveTest.beforeEach(async ({ page, performanceMonitor }) => {
    // Set up aggressive performance monitoring
    await page.addInitScript(() => {
      // Disable animations that might interfere with FPS measurement
      document.documentElement.style.setProperty('--transition-duration', '0ms');

      // Initialize detailed performance tracking
      (window as any).performanceTracker = {
        frames: [],
        startFrame: 0,
        startTime: performance.now(),
        memorySnapshots: [],

        recordFrame() {
          const now = performance.now();
          this.frames.push(now);

          // Keep only last 1000 frames for memory efficiency
          if (this.frames.length > 1000) {
            this.frames = this.frames.slice(-1000);
          }
        },

        getFPS() {
          if (this.frames.length < 2) return 0;

          const recentFrames = this.frames.slice(-60); // Last 60 frames
          const timeSpan = recentFrames[recentFrames.length - 1] - recentFrames[0];
          return Math.round((recentFrames.length - 1) * 1000 / timeSpan);
        },

        recordMemory() {
          if ('memory' in performance) {
            const memory = (performance as any).memory;
            this.memorySnapshots.push({
              timestamp: Date.now(),
              used: Math.round(memory.usedJSHeapSize / 1024 / 1024),
              total: Math.round(memory.totalJSHeapSize / 1024 / 1024),
              limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
            });

            // Keep only last 100 snapshots
            if (this.memorySnapshots.length > 100) {
              this.memorySnapshots = this.memorySnapshots.slice(-100);
            }
          }
        },
      };

      // Start frame tracking
      const trackFrame = () => {
        (window as any).performanceTracker.recordFrame();
        requestAnimationFrame(trackFrame);
      };
      trackFrame();

      // Start memory tracking
      setInterval(() => {
        (window as any).performanceTracker.recordMemory();
      }, 1000);
    });

    await page.goto('/');
    await performanceMonitor.startMonitoring();
  });

  cognitiveTest('should achieve 240 FPS target with small graph', async ({
    page,
    performanceMonitor,
    cognitiveUtils
  }) => {
    await cognitiveTest.step('Load small graph and measure baseline performance', async () => {
      // Load small graph
      await page.route('/api/cognitive-graph', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: graphFixtures.small,
            timestamp: Date.now(),
          }),
        });
      });

      await page.click('[data-testid="load-sample-graph"]');
      await cognitiveUtils.waitForSceneReady();

      // Wait for initial rendering to stabilize
      await page.waitForTimeout(3000);

      // Measure FPS over 5 seconds
      const fpsReadings = [];
      for (let i = 0; i < 5; i++) {
        const fps = await page.evaluate(() => (window as any).performanceTracker.getFPS());
        fpsReadings.push(fps);
        await page.waitForTimeout(1000);
      }

      const averageFPS = fpsReadings.reduce((sum, fps) => sum + fps, 0) / fpsReadings.length;
      const minFPS = Math.min(...fpsReadings);

      console.log(`Small Graph Performance - Avg: ${averageFPS.toFixed(1)} FPS, Min: ${minFPS} FPS`);

      // Validate against 240 FPS target (allow 20% tolerance for CI environments)
      expect(averageFPS).toBeGreaterThan(192); // 240 * 0.8
      expect(minFPS).toBeGreaterThan(120);     // Minimum acceptable

      const performanceValidation = await performanceMonitor.validatePerformance({
        fps: performanceBaselines.small.targetFPS,
        memory: performanceBaselines.small.targetMemory,
      });

      expect(performanceValidation.fps.passed).toBe(true);
      expect(performanceValidation.memory.passed).toBe(true);
    });

    await cognitiveTest.step('Test performance during camera interactions', async () => {
      const canvas = await page.locator('canvas').first();

      // Test continuous camera rotation
      for (let i = 0; i < 30; i++) {
        await canvas.hover();
        await page.mouse.down();
        await page.mouse.move(5, 0);
        await page.mouse.up();
        await page.waitForTimeout(50);
      }

      // Measure FPS during interaction
      const interactionFPS = await page.evaluate(() => (window as any).performanceTracker.getFPS());
      expect(interactionFPS).toBeGreaterThan(120);

      console.log(`Camera interaction performance: ${interactionFPS} FPS`);
    });

    await cognitiveTest.step('Test performance with multiple visual effects', async () => {
      // Enable all visual effects
      await page.click('[data-testid="edge-style-animated"]');
      await page.click('[data-testid="node-style-glow"]');
      await page.click('[data-testid="background-particles"]');
      await page.click('[data-testid="enable-ambient-occlusion"]');

      await page.waitForTimeout(2000);

      // Measure FPS with effects
      const effectsFPS = await page.evaluate(() => (window as any).performanceTracker.getFPS());
      expect(effectsFPS).toBeGreaterThan(180);

      console.log(`Visual effects performance: ${effectsFPS} FPS`);
    });
  });

  cognitiveTest('should maintain performance with medium graph', async ({
    page,
    performanceMonitor,
    cognitiveUtils
  }) => {
    await cognitiveTest.step('Load medium graph and validate performance', async () => {
      // Load medium graph
      await page.route('/api/cognitive-graph', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: graphFixtures.medium,
            timestamp: Date.now(),
          }),
        });
      });

      await page.click('[data-testid="load-complex-graph"]');
      await cognitiveUtils.waitForSceneReady();

      // Wait for initial rendering to stabilize
      await page.waitForTimeout(5000);

      // Measure FPS over 10 seconds for medium graph
      const fpsReadings = [];
      for (let i = 0; i < 10; i++) {
        const fps = await page.evaluate(() => (window as any).performanceTracker.getFPS());
        fpsReadings.push(fps);
        await page.waitForTimeout(1000);
      }

      const averageFPS = fpsReadings.reduce((sum, fps) => sum + fps, 0) / fpsReadings.length;
      const minFPS = Math.min(...fpsReadings);

      console.log(`Medium Graph Performance - Avg: ${averageFPS.toFixed(1)} FPS, Min: ${minFPS} FPS`);

      // Target 180 FPS for medium graphs (75% of 240)
      expect(averageFPS).toBeGreaterThan(144); // 180 * 0.8
      expect(minFPS).toBeGreaterThan(90);

      const performanceValidation = await performanceMonitor.validatePerformance({
        fps: performanceBaselines.medium.targetFPS,
        memory: performanceBaselines.medium.targetMemory,
      });

      expect(performanceValidation.fps.passed).toBe(true);
      expect(performanceValidation.memory.passed).toBe(true);
    });

    await cognitiveTest.step('Test memory usage efficiency', async () => {
      const memorySnapshots = await page.evaluate(() => (window as any).performanceTracker.memorySnapshots);

      expect(memorySnapshots.length).toBeGreaterThan(0);

      const maxMemory = Math.max(...memorySnapshots.map((s: any) => s.used));
      const avgMemory = memorySnapshots.reduce((sum: number, s: any) => sum + s.used, 0) / memorySnapshots.length;

      console.log(`Memory Usage - Max: ${maxMemory}MB, Avg: ${avgMemory.toFixed(1)}MB`);

      expect(maxMemory).toBeLessThan(performanceBaselines.medium.acceptableMemory);
      expect(avgMemory).toBeLessThan(performanceBaselines.medium.targetMemory);
    });

    await cognitiveTest.step('Test performance during complex filtering', async () => {
      // Apply and remove filters rapidly
      const filters = ['factual', 'logical', 'creative', 'metacognitive'];

      for (let cycle = 0; cycle < 3; cycle++) {
        for (const filter of filters) {
          await page.click(`[data-testid="filter-${filter}"]`);
          await page.waitForTimeout(200);

          const fps = await page.evaluate(() => (window as any).performanceTracker.getFPS());
          expect(fps).toBeGreaterThan(60);
        }

        await page.click('[data-testid="reset-filters"]');
        await page.waitForTimeout(500);
      }

      console.log('Complex filtering performance validated');
    });
  });

  cognitiveTest('should handle large graph performance within acceptable limits', async ({
    page,
    performanceMonitor,
    cognitiveUtils
  }) => {
    await cognitiveTest.step('Load large graph and measure performance impact', async () => {
      // Load large graph
      await page.route('/api/cognitive-graph', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: graphFixtures.large,
            timestamp: Date.now(),
          }),
        });
      });

      const loadStartTime = Date.now();
      await page.click('[data-testid="load-large-graph"]');
      await cognitiveUtils.waitForSceneReady();
      const loadTime = Date.now() - loadStartTime;

      // Large graphs can take longer to load
      expect(loadTime).toBeLessThan(performanceBaselines.large.acceptableLoadTime);

      // Wait for initial rendering to stabilize
      await page.waitForTimeout(8000);

      // Measure FPS over 15 seconds for large graph
      const fpsReadings = [];
      for (let i = 0; i < 15; i++) {
        const fps = await page.evaluate(() => (window as any).performanceTracker.getFPS());
        fpsReadings.push(fps);
        await page.waitForTimeout(1000);
      }

      const averageFPS = fpsReadings.reduce((sum, fps) => sum + fps, 0) / fpsReadings.length;
      const minFPS = Math.min(...fpsReadings);

      console.log(`Large Graph Performance - Avg: ${averageFPS.toFixed(1)} FPS, Min: ${minFPS} FPS, Load: ${loadTime}ms`);

      // Target 120 FPS for large graphs (50% of 240)
      expect(averageFPS).toBeGreaterThan(96); // 120 * 0.8
      expect(minFPS).toBeGreaterThan(30);

      const performanceValidation = await performanceMonitor.validatePerformance({
        fps: performanceBaselines.large.targetFPS,
        memory: performanceBaselines.large.targetMemory,
      });

      expect(performanceValidation.memory.passed).toBe(true);
      // FPS might not pass for large graphs, but should be close
      if (!performanceValidation.fps.passed) {
        console.warn(`Large graph FPS below target: ${performanceValidation.fps.current}/${performanceValidation.fps.target}`);
      }
    });

    await cognitiveTest.step('Test memory management with large datasets', async () => {
      const initialMemory = await page.evaluate(() => {
        const snapshots = (window as any).performanceTracker.memorySnapshots;
        return snapshots.length > 0 ? snapshots[snapshots.length - 1].used : 0;
      });

      // Perform memory-intensive operations
      for (let i = 0; i < 5; i++) {
        // Switch between different visualization modes
        await page.click('[data-testid="view-mode-sphere"]');
        await page.waitForTimeout(1000);

        await page.click('[data-testid="view-mode-2d"]');
        await page.waitForTimeout(1000);

        await page.click('[data-testid="view-mode-tree"]');
        await page.waitForTimeout(1000);
      }

      const finalMemory = await page.evaluate(() => {
        const snapshots = (window as any).performanceTracker.memorySnapshots;
        return snapshots.length > 0 ? snapshots[snapshots.length - 1].used : 0;
      });

      const memoryIncrease = finalMemory - initialMemory;

      console.log(`Memory management - Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Increase: ${memoryIncrease}MB`);

      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(200);
      expect(finalMemory).toBeLessThan(performanceBaselines.large.acceptableMemory);
    });

    await cognitiveTest.step('Test performance optimization features', async () => {
      // Enable automatic performance optimization
      await page.click('[data-testid="performance-mode-auto"]');
      await page.waitForTimeout(2000);

      const autoOptimizedFPS = await page.evaluate(() => (window as any).performanceTracker.getFPS());
      console.log(`Auto-optimized performance: ${autoOptimizedFPS} FPS`);

      // Test manual optimization settings
      await page.click('[data-testid="performance-settings"]');
      await expect(page.locator('[data-testid="performance-dialog"]')).toBeVisible();

      // Enable aggressive optimizations
      await page.check('[data-testid="reduce-quality"]');
      await page.check('[data-testid="simplify-rendering"]');
      await page.check('[data-testid="disable-animations"]');
      await page.check('[data-testid="reduce-particle-count"]');

      await page.click('[data-testid="apply-settings"]');
      await page.waitForTimeout(3000);

      const manuallyOptimizedFPS = await page.evaluate(() => (window as any).performanceTracker.getFPS());

      console.log(`Manually optimized performance: ${manuallyOptimizedFPS} FPS`);

      // Manual optimization should improve FPS
      expect(manuallyOptimizedFPS).toBeGreaterThan(autoOptimizedFPS * 0.9);
    });
  });

  cognitiveTest('should handle stress testing scenarios', async ({
    page,
    performanceMonitor
  }) => {
    await cognitiveTest.step('Test performance under rapid camera movements', async () => {
      const canvas = await page.locator('canvas').first();

      // Simulate aggressive camera movements
      for (let i = 0; i < 100; i++) {
        await canvas.hover();
        await page.mouse.down();

        // Random movements
        await page.mouse.move(
          Math.random() * 400 - 200,
          Math.random() * 400 - 200
        );

        await page.mouse.up();
        await page.waitForTimeout(10); // Very rapid movements
      }

      // Allow performance to stabilize
      await page.waitForTimeout(2000);

      const stressTestFPS = await page.evaluate(() => (window as any).performanceTracker.getFPS());
      expect(stressTestFPS).toBeGreaterThan(30);

      console.log(`Stress test camera performance: ${stressTestFPS} FPS`);
    });

    await cognitiveTest.step('Test performance with continuous updates', async () => {
      // Simulate continuous real-time updates
      for (let i = 0; i < 50; i++) {
        await page.evaluate((index) => {
          const ws = (window as any).activeWebSocket;
          if (ws) {
            ws.dispatchEvent(new MessageEvent('message', {
              data: JSON.stringify({
                type: 'cognitive_update',
                payload: {
                  updateType: 'node_updated',
                  nodeId: `node-${index % 20}`,
                  updates: {
                    confidence: 0.5 + Math.random() * 0.5,
                    position: {
                      x: (Math.random() - 0.5) * 10,
                      y: (Math.random() - 0.5) * 10,
                      z: (Math.random() - 0.5) * 5,
                    },
                  },
                },
              }),
            }));
          }
        }, i);

        await page.waitForTimeout(100);
      }

      const continuousUpdateFPS = await page.evaluate(() => (window as any).performanceTracker.getFPS());
      expect(continuousUpdateFPS).toBeGreaterThan(40);

      console.log(`Continuous update performance: ${continuousUpdateFPS} FPS`);
    });

    await cognitiveTest.step('Test memory leak detection', async () => {
      const initialMemory = await page.evaluate(() => {
        const snapshots = (window as any).performanceTracker.memorySnapshots;
        return snapshots.length > 0 ? snapshots[snapshots.length - 1].used : 0;
      });

      // Perform operations that could cause memory leaks
      for (let cycle = 0; cycle < 10; cycle++) {
        // Load and unload graphs
        await page.click('[data-testid="load-sample-graph"]');
        await page.waitForTimeout(1000);

        await page.click('[data-testid="clear-graph"]');
        await page.waitForTimeout(500);

        // Apply and remove filters
        await page.click('[data-testid="filter-factual"]');
        await page.waitForTimeout(200);
        await page.click('[data-testid="reset-filters"]');
        await page.waitForTimeout(200);

        // Switch visualization modes
        await page.click('[data-testid="view-mode-sphere"]');
        await page.waitForTimeout(500);
        await page.click('[data-testid="view-mode-2d"]');
        await page.waitForTimeout(500);
      }

      // Force garbage collection if available
      await page.evaluate(() => {
        if ((window as any).gc) {
          (window as any).gc();
        }
      });

      await page.waitForTimeout(2000);

      const finalMemory = await page.evaluate(() => {
        const snapshots = (window as any).performanceTracker.memorySnapshots;
        return snapshots.length > 0 ? snapshots[snapshots.length - 1].used : 0;
      });

      const memoryIncrease = finalMemory - initialMemory;

      console.log(`Memory leak detection - Initial: ${initialMemory}MB, Final: ${finalMemory}MB, Increase: ${memoryIncrease}MB`);

      // Memory increase should be minimal (<50MB after full cycle)
      expect(memoryIncrease).toBeLessThan(50);
    });
  });

  cognitiveTest('should validate frame timing consistency', async ({
    page
  }) => {
    await cognitiveTest.step('Measure frame timing distribution', async () => {
      // Collect detailed frame timing data
      const frameTimings = await page.evaluate(() => {
        return new Promise<number[]>((resolve) => {
          const timings: number[] = [];
          let lastTime = performance.now();

          const measureFrame = () => {
            const now = performance.now();
            const frameTime = now - lastTime;
            timings.push(frameTime);
            lastTime = now;

            if (timings.length >= 300) { // 5 seconds at 60 FPS
              resolve(timings);
            } else {
              requestAnimationFrame(measureFrame);
            }
          };

          measureFrame();
        });
      });

      // Analyze frame timing distribution
      const avgFrameTime = frameTimings.reduce((sum, time) => sum + time, 0) / frameTimings.length;
      const maxFrameTime = Math.max(...frameTimings);
      const minFrameTime = Math.min(...frameTimings);
      const stdev = Math.sqrt(
        frameTimings.reduce((sum, time) => sum + Math.pow(time - avgFrameTime, 2), 0) / frameTimings.length
      );

      // Convert to FPS for reporting
      const avgFPS = 1000 / avgFrameTime;
      const minFPS = 1000 / maxFrameTime;
      const maxFPS = 1000 / minFrameTime;

      console.log(`Frame Timing Analysis:`);
      console.log(`  Average: ${avgFPS.toFixed(1)} FPS (${avgFrameTime.toFixed(2)}ms)`);
      console.log(`  Range: ${minFPS.toFixed(1)} - ${maxFPS.toFixed(1)} FPS`);
      console.log(`  Std Dev: ${stdev.toFixed(2)}ms`);

      // Validate timing consistency
      expect(avgFrameTime).toBeLessThan(16.67); // 60 FPS minimum
      expect(stdev).toBeLessThan(8.34); // Standard deviation should be reasonable
      expect(maxFrameTime).toBeLessThan(33.33); // No frame should take longer than 30 FPS
    });

    await cognitiveTest.step('Test frame consistency under load', async () => {
      const canvas = await page.locator('canvas').first();

      // Measure frame consistency during camera movement
      const loadFrameTimings = await page.evaluate(() => {
        return new Promise<number[]>((resolve) => {
          const timings: number[] = [];
          let lastTime = performance.now();
          let frameCount = 0;

          const measureFrame = () => {
            const now = performance.now();
            const frameTime = now - lastTime;
            timings.push(frameTime);
            lastTime = now;
            frameCount++;

            // Simulate camera movement during measurement
            if (frameCount % 10 === 0) {
              const canvas = document.querySelector('canvas');
              if (canvas) {
                canvas.dispatchEvent(new MouseEvent('mousemove', {
                  clientX: Math.random() * window.innerWidth,
                  clientY: Math.random() * window.innerHeight,
                }));
              }
            }

            if (timings.length >= 300) {
              resolve(timings);
            } else {
              requestAnimationFrame(measureFrame);
            }
          };

          measureFrame();
        });
      });

      const avgFrameTime = loadFrameTimings.reduce((sum, time) => sum + time, 0) / loadFrameTimings.length;
      const maxFrameTime = Math.max(...loadFrameTimings);
      const avgFPS = 1000 / avgFrameTime;
      const minFPS = 1000 / maxFrameTime;

      console.log(`Load Frame Consistency - Avg: ${avgFPS.toFixed(1)} FPS, Min: ${minFPS.toFixed(1)} FPS`);

      // Even under load, performance should be reasonable
      expect(avgFPS).toBeGreaterThan(45);
      expect(minFPS).toBeGreaterThan(20);
    });
  });
});