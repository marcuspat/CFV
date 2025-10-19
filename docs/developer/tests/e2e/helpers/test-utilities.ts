import { Page, expect, BrowserContext } from '@playwright/test';
import path from 'path';

/**
 * Performance monitoring utilities for E2E tests
 */
export class PerformanceMonitor {
  constructor(private page: Page) {}

  /**
   * Start monitoring performance metrics
   */
  async startMonitoring() {
    await this.page.evaluate(() => {
      (window as any).performanceMetrics = {
        frames: 0,
        startTime: performance.now(),
        lastFrameTime: performance.now(),
        fps: 0,
        memory: 0,
      };

      // FPS monitoring
      const measureFPS = () => {
        const now = performance.now();
        const metrics = (window as any).performanceMetrics;

        metrics.frames++;

        if (now - metrics.lastFrameTime >= 1000) {
          metrics.fps = Math.round(metrics.frames * 1000 / (now - metrics.startTime));
          metrics.frames = 0;
          metrics.startTime = now;
        }

        metrics.lastFrameTime = now;
        requestAnimationFrame(measureFPS);
      };

      requestAnimationFrame(measureFPS);

      // Memory monitoring
      if ('memory' in performance) {
        setInterval(() => {
          const memory = (performance as any).memory;
          metrics.memory = Math.round(memory.usedJSHeapSize / 1024 / 1024);
        }, 500);
      }
    });
  }

  /**
   * Get current performance metrics
   */
  async getMetrics() {
    return await this.page.evaluate(() => {
      const metrics = (window as any).performanceMetrics || {};
      return {
        fps: metrics.fps || 0,
        memory: metrics.memory || 0,
        timestamp: Date.now(),
      };
    });
  }

  /**
   * Wait for FPS to stabilize above threshold
   */
  async waitForStableFPS(minFPS: number = 120, timeoutMs: number = 10000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const metrics = await this.getMetrics();
      if (metrics.fps >= minFPS) {
        return metrics;
      }
      await this.page.waitForTimeout(100);
    }

    throw new Error(`FPS did not stabilize above ${minFPS} within ${timeoutMs}ms`);
  }

  /**
   * Validate performance against baseline
   */
  async validatePerformance(baseline: { fps: number; memory: number; loadTime?: number }) {
    const metrics = await this.getMetrics();

    const validation = {
      fps: {
        current: metrics.fps,
        target: baseline.fps,
        passed: metrics.fps >= baseline.fps * 0.8, // Allow 20% tolerance
      },
      memory: {
        current: metrics.memory,
        target: baseline.memory,
        passed: metrics.memory <= baseline.memory,
      },
    };

    console.log(`PERFORMANCE: ${JSON.stringify(validation)}`);

    if (!validation.fps.passed) {
      console.warn(`⚠️ FPS below target: ${validation.fps.current}/${validation.fps.target}`);
    }

    if (!validation.memory.passed) {
      console.warn(`⚠️ Memory above target: ${validation.memory.current}MB/${validation.memory.target}MB`);
    }

    return validation;
  }
}

/**
 * Cognitive Visualization Testing Utilities
 */
export class CognitiveVisualizationUtils {
  constructor(private page: Page) {}

  /**
   * Wait for WebGL context to be ready
   */
  async waitForWebGLContext() {
    await this.page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
    }, { timeout: 30000 });
  }

  /**
   * Wait for 3D scene to be loaded and interactive
   */
  async waitForSceneReady() {
    await this.page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 30000 });
    await this.waitForWebGLContext();

    // Wait for nodes to be rendered
    await this.page.waitForFunction(() => {
      const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
      return nodes.length > 0;
    }, { timeout: 15000 });
  }

  /**
   * Get information about cognitive nodes in the scene
   */
  async getCognitiveNodes() {
    return await this.page.evaluate(() => {
      const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
      return Array.from(nodes).map(node => ({
        id: node.getAttribute('data-node-id'),
        type: node.getAttribute('data-node-type'),
        position: {
          x: parseFloat(node.getAttribute('data-x') || '0'),
          y: parseFloat(node.getAttribute('data-y') || '0'),
          z: parseFloat(node.getAttribute('data-z') || '0'),
        },
        confidence: parseFloat(node.getAttribute('data-confidence') || '0'),
      }));
    });
  }

  /**
   * Get information about cognitive edges in the scene
   */
  async getCognitiveEdges() {
    return await this.page.evaluate(() => {
      const edges = document.querySelectorAll('[data-testid="cognitive-edge"]');
      return Array.from(edges).map(edge => ({
        id: edge.getAttribute('data-edge-id'),
        source: edge.getAttribute('data-source'),
        target: edge.getAttribute('data-target'),
        strength: parseFloat(edge.getAttribute('data-strength') || '0'),
      }));
    });
  }

  /**
   * Interact with a cognitive node
   */
  async clickNode(nodeId: string) {
    await this.page.click(`[data-node-id="${nodeId}"]`);

    // Wait for interaction response
    await this.page.waitForTimeout(100);
  }

  /**
   * Hover over a cognitive node
   */
  async hoverNode(nodeId: string) {
    await this.page.hover(`[data-node-id="${nodeId}"]`);
    await this.page.waitForTimeout(50);
  }

  /**
   * Test 3D camera controls
   */
  async testCameraControls() {
    const canvas = await this.page.locator('canvas').first();

    // Test orbit rotation
    await canvas.hover();
    await this.page.mouse.down();
    await this.page.mouse.move(100, 0);
    await this.page.mouse.up();
    await this.page.waitForTimeout(100);

    // Test zoom
    await this.page.mouse.wheel(0, -100);
    await this.page.waitForTimeout(100);

    // Test pan
    await this.page.keyboard.down('Shift');
    await canvas.hover();
    await this.page.mouse.down();
    await this.page.mouse.move(50, 0);
    await this.page.mouse.up();
    await this.page.keyboard.up('Shift');
    await this.page.waitForTimeout(100);
  }

  /**
   * Test cognitive dimension filtering
   */
  async testDimensionFiltering(dimension: string) {
    await this.page.click(`[data-testid="filter-${dimension}"]`);
    await this.page.waitForTimeout(500);

    const visibleNodes = await this.page.evaluate((dim) => {
      const nodes = document.querySelectorAll(`[data-node-type*="${dim}"]`);
      return Array.from(nodes).filter(node => {
        const style = window.getComputedStyle(node);
        return style.display !== 'none' && style.opacity !== '0';
      }).length;
    }, dimension);

    return visibleNodes;
  }

  /**
   * Test temporal playback controls
   */
  async testTemporalControls() {
    // Test play/pause
    await this.page.click('[data-testid="play-pause-button"]');
    await this.page.waitForTimeout(200);

    // Test timeline scrubbing
    const timeline = await this.page.locator('[data-testid="timeline-slider"]');
    await timeline.click({ position: { x: 0.5, y: 0 } });
    await this.page.waitForTimeout(100);

    // Test speed control
    await this.page.click('[data-testid="speed-control"]');
    await this.page.waitForTimeout(100);
  }

  /**
   * Test export functionality
   */
  async testExport(format: 'json' | 'png' | 'svg') {
    await this.page.click(`[data-testid="export-${format}"]`);

    // Wait for download
    const downloadPromise = this.page.waitForEvent('download');
    const download = await downloadPromise;

    const fileName = download.suggestedFilename();
    expect(fileName).toMatch(new RegExp(`\\.${format}$`));

    return download;
  }

  /**
   * Take a screenshot of the visualization
   */
  async takeScreenshot(name: string) {
    await this.page.waitForTimeout(1000); // Wait for rendering to settle

    await this.page.screenshot({
      path: path.join(process.cwd(), 'test-results', 'screenshots', `${name}.png`),
      fullPage: false,
      animations: 'disabled',
    });
  }

  /**
   * Validate cognitive graph structure
   */
  async validateGraphStructure(expectedNodes: number, expectedEdges: number) {
    const nodes = await this.getCognitiveNodes();
    const edges = await this.getCognitiveEdges();

    expect(nodes.length).toBeGreaterThanOrEqual(expectedNodes);
    expect(edges.length).toBeGreaterThanOrEqual(expectedEdges);

    // Validate node properties
    nodes.forEach(node => {
      expect(node.id).toBeDefined();
      expect(node.type).toBeDefined();
      expect(node.confidence).toBeGreaterThanOrEqual(0);
      expect(node.confidence).toBeLessThanOrEqual(1);
    });

    // Validate edge properties
    edges.forEach(edge => {
      expect(edge.id).toBeDefined();
      expect(edge.source).toBeDefined();
      expect(edge.target).toBeDefined();
      expect(edge.strength).toBeGreaterThanOrEqual(0);
      expect(edge.strength).toBeLessThanOrEqual(1);
    });

    return { nodes, edges };
  }
}

/**
 * Mobile testing utilities
 */
export class MobileTestingUtils {
  constructor(private page: Page) {}

  /**
   * Test touch interactions on mobile devices
   */
  async testTouchInteractions() {
    // Test tap on node
    await this.page.tap('[data-testid="cognitive-node"]');
    await this.page.waitForTimeout(100);

    // Test pinch to zoom
    await this.page.touchscreen.tap(100, 100);
    await this.page.waitForTimeout(100);

    // Test swipe gestures
    await this.page.touchscreen.swipe(100, 100, 200, 100);
    await this.page.waitForTimeout(100);
  }

  /**
   * Test responsive layout
   */
  async testResponsiveLayout() {
    // Test portrait orientation
    await this.page.setViewportSize({ width: 375, height: 667 });
    await this.page.waitForTimeout(500);

    const portraitElements = await this.page.locator('[data-testid="mobile-controls"]').count();
    expect(portraitElements).toBeGreaterThan(0);

    // Test landscape orientation
    await this.page.setViewportSize({ width: 667, height: 375 });
    await this.page.waitForTimeout(500);

    const landscapeElements = await this.page.locator('[data-testid="landscape-layout"]').count();
    expect(landscapeElements).toBeGreaterThan(0);
  }
}

/**
 * Setup testing utilities
 */
export async function setupTestUtils(page: Page) {
  const performanceMonitor = new PerformanceMonitor(page);
  const cognitiveUtils = new CognitiveVisualizationUtils(page);
  const mobileUtils = new MobileTestingUtils(page);

  // Start performance monitoring
  await performanceMonitor.startMonitoring();

  return {
    performanceMonitor,
    cognitiveUtils,
    mobileUtils,
  };
}