import { test, expect } from '@playwright/test';
import { test as cognitiveTest } from '../helpers/test-fixtures';
import { graphFixtures, mockConversation, performanceBaselines } from '../fixtures/cognitive-graph-data';

/**
 * Complete user workflow E2E tests
 * Tests the entire user journey from conversation input to visualization interaction
 */

cognitiveTest.describe('Cognitive Fabric Visualizer - Complete User Workflows', () => {
  cognitiveTest.beforeEach(async ({ page }) => {
    // Set up comprehensive test environment
    await page.goto('/');

    // Mock API responses
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

    await page.route('/api/conversation/analyze', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            analysis: {
              sentiment: 'positive',
              complexity: 'medium',
              topics: ['machine learning', 'algorithms'],
              cognitiveLoad: 0.65,
            },
            suggestions: ['Provide more specific examples'],
            confidence: 0.87,
          },
          timestamp: Date.now(),
        }),
      });
    });
  });

  cognitiveTest('should complete full conversation analysis workflow', async ({
    page,
    performanceMonitor,
    cognitiveUtils
  }) => {
    await cognitiveTest.step('Start conversation analysis', async () => {
      // Start performance monitoring
      await performanceMonitor.startMonitoring();

      // Navigate to conversation input
      await page.click('[data-testid="conversation-input-button"]');
      await expect(page.locator('[data-testid="conversation-editor"]')).toBeVisible();

      // Input sample conversation
      await page.fill('[data-testid="conversation-textarea"]', mockConversation.messages.map(m => m.text).join('\n'));

      // Start analysis
      await page.click('[data-testid="analyze-conversation-button"]');

      // Wait for analysis to complete
      await expect(page.locator('[data-testid="analysis-complete"]')).toBeVisible({ timeout: 15000 });
    });

    await cognitiveTest.step('Validate cognitive graph generation', async () => {
      // Wait for graph to be generated and displayed
      await cognitiveUtils.waitForSceneReady();

      // Validate graph structure
      const { nodes, edges } = await cognitiveUtils.validateGraphStructure(5, 4);

      // Validate node properties
      expect(nodes[0]).toHaveProperty('type');
      expect(nodes[0]).toHaveProperty('confidence');
      expect(nodes[0].confidence).toBeGreaterThan(0);
      expect(nodes[0].confidence).toBeLessThanOrEqual(1);

      console.log(`✅ Generated cognitive graph with ${nodes.length} nodes and ${edges.length} edges`);
    });

    await cognitiveTest.step('Test interactive exploration', async () => {
      // Test node interaction
      const firstNode = await cognitiveUtils.getCognitiveNodes();
      if (firstNode.length > 0) {
        await cognitiveUtils.clickNode(firstNode[0].id);

        // Check for node details panel
        await expect(page.locator('[data-testid="node-details-panel"]')).toBeVisible({ timeout: 5000 });

        const nodeDetails = await page.locator('[data-testid="node-details-panel"]').textContent();
        expect(nodeDetails).toContain(firstNode[0].type.replace('_', ' ').toUpperCase());
      }

      // Test camera controls
      await cognitiveUtils.testCameraControls();

      // Test dimension filtering
      const factualNodes = await cognitiveUtils.testDimensionFiltering('factual');
      expect(factualNodes).toBeGreaterThan(0);

      console.log('✅ Interactive exploration features working correctly');
    });

    await cognitiveTest.step('Validate performance metrics', async () => {
      // Wait for performance to stabilize
      const metrics = await performanceMonitor.waitForStableFPS(120, 10000);

      // Validate performance against baseline
      const validation = await performanceMonitor.validatePerformance({
        fps: performanceBaselines.small.targetFPS,
        memory: performanceBaselines.small.targetMemory,
      });

      expect(validation.fps.passed).toBe(true);
      expect(validation.memory.passed).toBe(true);

      console.log(`✅ Performance validated: ${metrics.fps} FPS, ${metrics.memory}MB memory`);
    });

    await cognitiveTest.step('Test export functionality', async () => {
      // Test JSON export
      const jsonDownload = await cognitiveUtils.testExport('json');
      expect(jsonDownload.suggestedFilename()).toMatch(/\.json$/);

      // Test PNG export
      const pngDownload = await cognitiveUtils.testExport('png');
      expect(pngDownload.suggestedFilename()).toMatch(/\.png$/);

      // Test SVG export
      const svgDownload = await cognitiveUtils.testExport('svg');
      expect(svgDownload.suggestedFilename()).toMatch(/\.svg$/);

      console.log('✅ All export formats working correctly');
    });
  });

  cognitiveTest('should handle real-time cognitive updates workflow', async ({
    page,
    performanceMonitor,
    cognitiveUtils
  }) => {
    await cognitiveTest.step('Initialize real-time monitoring', async () => {
      // Start with initial graph
      await page.click('[data-testid="load-sample-graph"]');
      await cognitiveUtils.waitForSceneReady();

      // Enable real-time mode
      await page.click('[data-testid="enable-realtime-button"]');
      await expect(page.locator('[data-testid="realtime-indicator"]')).toBeVisible();
    });

    await cognitiveTest.step('Simulate real-time cognitive updates', async () => {
      // Mock WebSocket messages for real-time updates
      await page.evaluate(() => {
        const mockWebSocket = new EventTarget();

        // Simulate cognitive update
        setTimeout(() => {
          mockWebSocket.dispatchEvent(new MessageEvent('message', {
            data: JSON.stringify({
              type: 'cognitive_update',
              payload: {
                updateType: 'node_added',
                node: {
                  id: 'node-realtime-001',
                  type: 'creative_synthesis',
                  content: 'New insight generated in real-time',
                  confidence: 0.82,
                },
              },
            }),
          }));
        }, 1000);

        (window as any).mockWebSocket = mockWebSocket;
      });

      // Wait for real-time update to be processed
      await page.waitForTimeout(2000);

      // Verify new node was added
      const updatedNodes = await cognitiveUtils.getCognitiveNodes();
      const realTimeNode = updatedNodes.find(node => node.id.includes('realtime'));
      expect(realTimeNode).toBeDefined();

      console.log('✅ Real-time cognitive update processed successfully');
    });

    await cognitiveTest.step('Test performance during real-time updates', async () => {
      const initialMetrics = await performanceMonitor.getMetrics();

      // Simulate multiple rapid updates
      for (let i = 0; i < 5; i++) {
        await page.evaluate((index) => {
          const mockWebSocket = (window as any).mockWebSocket;
          if (mockWebSocket) {
            mockWebSocket.dispatchEvent(new MessageEvent('message', {
              data: JSON.stringify({
                type: 'cognitive_update',
                payload: {
                  updateType: 'node_updated',
                  nodeId: `node-${index}`,
                  update: { confidence: Math.random() },
                },
              }),
            }));
          }
        }, i);

        await page.waitForTimeout(200);
      }

      // Check performance after updates
      const finalMetrics = await performanceMonitor.getMetrics();

      // Performance should not degrade significantly
      expect(finalMetrics.fps).toBeGreaterThan(initialMetrics.fps * 0.8);
      expect(finalMetrics.memory).toBeLessThan(initialMetrics.memory + 50);

      console.log(`✅ Performance maintained during real-time updates: ${finalMetrics.fps} FPS`);
    });
  });

  cognitiveTest('should complete advanced analysis workflow with filtering', async ({
    page,
    cognitiveUtils
  }) => {
    await cognitiveTest.step('Load complex conversation for analysis', async () => {
      // Load larger graph for advanced testing
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

      const nodes = await cognitiveUtils.getCognitiveNodes();
      expect(nodes.length).toBeGreaterThan(20);

      console.log(`✅ Loaded complex graph with ${nodes.length} nodes`);
    });

    await cognitiveTest.step('Test cognitive dimension filtering', async () => {
      // Test each dimension filter
      const dimensions = ['factual', 'logical', 'creative', 'metacognitive'];

      for (const dimension of dimensions) {
        await page.click(`[data-testid="filter-${dimension}"]`);
        await page.waitForTimeout(500);

        // Check that filter is applied
        const filterStatus = await page.locator(`[data-testid="filter-${dimension}-status"]`).textContent();
        expect(filterStatus).toContain('active');

        // Count visible nodes for this dimension
        const visibleNodes = await page.evaluate((dim) => {
          const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
          return Array.from(nodes).filter(node => {
            const style = window.getComputedStyle(node);
            return style.display !== 'none' && style.opacity !== '0';
          }).length;
        }, dimension);

        expect(visibleNodes).toBeGreaterThan(0);

        console.log(`✅ ${dimension} filter: ${visibleNodes} nodes visible`);
      }

      // Reset filters
      await page.click('[data-testid="reset-filters"]');
      await page.waitForTimeout(500);
    });

    await cognitiveTest.step('Test temporal analysis workflow', async () => {
      // Enable temporal view
      await page.click('[data-testid="enable-temporal-view"]');
      await expect(page.locator('[data-testid="timeline-controls"]')).toBeVisible();

      // Test timeline scrubbing
      await cognitiveUtils.testTemporalControls();

      // Test playback controls
      await page.click('[data-testid="play-pause-button"]');
      await page.waitForTimeout(1000);

      // Check that animation is playing
      const isPlaying = await page.locator('[data-testid="playback-status"]').textContent();
      expect(isPlaying).toContain('playing');

      // Test speed controls
      await page.click('[data-testid="speed-control"]');
      await page.waitForTimeout(500);

      console.log('✅ Temporal analysis features working correctly');
    });

    await cognitiveTest.step('Test comprehensive export workflow', async () => {
      // Test advanced export options
      await page.click('[data-testid="export-options-button"]');
      await expect(page.locator('[data-testid="export-dialog"]')).toBeVisible();

      // Test custom export settings
      await page.check('[data-testid="include-metadata"]');
      await page.check('[data-testid="include-timestamps"]');
      await page.selectOption('[data-testid="export-format"]', 'json');

      // Export with custom settings
      await page.click('[data-testid="export-custom-button"]');

      // Wait for export completion
      await expect(page.locator('[data-testid="export-complete"]')).toBeVisible({ timeout: 10000 });

      // Verify export quality indicators
      const exportQuality = await page.locator('[data-testid="export-quality"]').textContent();
      expect(exportQuality).toContain('high');

      console.log('✅ Advanced export workflow completed successfully');
    });
  });

  cognitiveTest('should handle error recovery and retry workflows', async ({
    page,
    cognitiveUtils
  }) => {
    await cognitiveTest.step('Test network error recovery', async () => {
      // Simulate network error
      await page.route('/api/cognitive-graph', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Network error occurred',
            timestamp: Date.now(),
          }),
        });
      });

      // Try to load graph
      await page.click('[data-testid="load-sample-graph"]');

      // Check error handling
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible({ timeout: 5000 });

      const errorMessage = await page.locator('[data-testid="error-message"]').textContent();
      expect(errorMessage).toContain('Network error');

      // Test retry functionality
      await page.click('[data-testid="retry-button"]');

      // Should show retry in progress
      await expect(page.locator('[data-testid="retry-progress"]')).toBeVisible();

      console.log('✅ Error recovery workflow initiated');
    });

    await cognitiveTest.step('Test graceful degradation on performance issues', async () => {
      // Mock performance degradation
      await page.addInitScript(() => {
        // Simulate low performance
        Object.defineProperty(window, 'performance', {
          value: {
            ...window.performance,
            now: () => Date.now() + Math.random() * 100, // Add jitter to simulate lag
          },
        });
      });

      // Load graph and check for performance optimizations
      await page.click('[data-testid="load-sample-graph"]');
      await cognitiveUtils.waitForSceneReady();

      // Check if performance optimizations are applied
      const performanceMode = await page.locator('[data-testid="performance-mode"]').textContent();
      expect(performanceMode).toMatch(/optimized|reduced/i);

      console.log('✅ Graceful degradation on performance issues validated');
    });
  });
});