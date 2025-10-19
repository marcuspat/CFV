import { test, expect } from '@playwright/test';
import { test as cognitiveTest } from '../helpers/test-fixtures';
import { graphFixtures, mockWebSocketMessages } from '../fixtures/cognitive-graph-data';

/**
 * Real-time updates and cognitive dimension filtering tests
 * Tests live data updates, WebSocket communication, and dynamic filtering
 */

cognitiveTest.describe('Cognitive Fabric Visualizer - Real-time Updates & Filtering', () => {
  cognitiveTest.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Mock WebSocket for real-time testing
    await page.addInitScript(() => {
      class MockWebSocket extends EventTarget {
        public readyState = 1; // OPEN
        public url: string;
        private mockConnected = true;

        constructor(url: string) {
          super();
          this.url = url;
          (window as any).activeWebSocket = this;
        }

        send(data: string) {
          // Simulate server response
          setTimeout(() => {
            this.dispatchEvent(new MessageEvent('message', {
              data: JSON.stringify({
                type: 'ack',
                timestamp: Date.now(),
              }),
            }));
          }, 50);
        }

        close() {
          this.readyState = 3; // CLOSED
          this.mockConnected = false;
          this.dispatchEvent(new CloseEvent('close'));
        }
      }

      window.WebSocket = MockWebSocket as any;
    });

    // Load initial graph
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
  });

  cognitiveTest('should handle real-time cognitive updates via WebSocket', async ({
    page,
    cognitiveUtils
  }) => {
    await cognitiveTest.step('Establish WebSocket connection', async () => {
      // Enable real-time mode
      await page.click('[data-testid="enable-realtime-button"]');

      // Wait for connection indicator
      await expect(page.locator('[data-testid="connection-status"]')).toBeVisible();
      await expect(page.locator('[data-testid="connection-status"]')).toHaveText(/connected/i);

      const connectionStatus = await page.locator('[data-testid="connection-status"]').textContent();
      expect(connectionStatus).toMatch(/connected|ready/i);

      console.log('✅ WebSocket connection established');
    });

    await cognitiveTest.step('Process real-time node addition', async () => {
      const initialNodes = await cognitiveUtils.getCognitiveNodes();

      // Simulate real-time node addition
      await page.evaluate(() => {
        const ws = (window as any).activeWebSocket;
        if (ws) {
          ws.dispatchEvent(new MessageEvent('message', {
            data: JSON.stringify({
              type: 'cognitive_update',
              payload: {
                updateType: 'node_added',
                node: {
                  id: 'node-realtime-001',
                  type: 'creative_synthesis',
                  content: 'New insight from real-time analysis',
                  confidence: 0.82,
                  position: { x: 8, y: 3, z: -2 },
                  color: '#FF9800',
                  radius: 1.0,
                },
              },
            }),
          }));
        }
      });

      // Wait for update to be processed
      await page.waitForTimeout(1000);

      // Verify new node was added
      const updatedNodes = await cognitiveUtils.getCognitiveNodes();
      expect(updatedNodes.length).toBe(initialNodes.length + 1);

      const newNode = updatedNodes.find(node => node.id.includes('realtime'));
      expect(newNode).toBeDefined();
      expect(newNode?.type).toBe('creative_synthesis');
      expect(newNode?.confidence).toBe(0.82);

      // Check for visual feedback
      await expect(page.locator('[data-testid="update-indicator"]')).toBeVisible();
      const updateText = await page.locator('[data-testid="update-indicator"]').textContent();
      expect(updateText).toContain(/new node|added/i);

      console.log(`✅ Real-time node added: ${newNode?.type} with confidence ${newNode?.confidence}`);
    });

    await cognitiveTest.step('Process real-time node updates', async () => {
      // Get existing node to update
      const nodes = await cognitiveUtils.getCognitiveNodes();
      const targetNode = nodes[0];

      // Simulate node update
      await page.evaluate((nodeId) => {
        const ws = (window as any).activeWebSocket;
        if (ws) {
          ws.dispatchEvent(new MessageEvent('message', {
            data: JSON.stringify({
              type: 'cognitive_update',
              payload: {
                updateType: 'node_updated',
                nodeId: nodeId,
                updates: {
                  confidence: 0.95,
                  content: 'Updated content from real-time analysis',
                },
              },
            }),
          }));
        }
      }, targetNode.id);

      // Wait for update to be processed
      await page.waitForTimeout(1000);

      // Verify node was updated
      const updatedNodes = await cognitiveUtils.getCognitiveNodes();
      const updatedNode = updatedNodes.find(node => node.id === targetNode.id);
      expect(updatedNode?.confidence).toBe(0.95);

      // Check for update animation
      const isAnimating = await page.evaluate((nodeId) => {
        const node = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (!node) return false;

        const style = window.getComputedStyle(node);
        return style.animation && style.animation !== 'none';
      }, targetNode.id);

      expect(isAnimating).toBe(true);

      console.log(`✅ Real-time node updated: confidence changed to ${updatedNode?.confidence}`);
    });

    await cognitiveTest.step('Process real-time edge operations', async () => {
      const initialEdges = await cognitiveUtils.getCognitiveEdges();

      // Simulate edge addition
      await page.evaluate(() => {
        const ws = (window as any).activeWebSocket;
        if (ws) {
          ws.dispatchEvent(new MessageEvent('message', {
            data: JSON.stringify({
              type: 'cognitive_update',
              payload: {
                updateType: 'edge_added',
                edge: {
                  id: 'edge-realtime-001',
                  source: 'node-001',
                  target: 'node-realtime-001',
                  type: 'semantic',
                  strength: 0.7,
                  confidence: 0.85,
                  color: '#2196F3',
                  animated: true,
                },
              },
            }),
          }));
        }
      });

      // Wait for update to be processed
      await page.waitForTimeout(1000);

      // Verify edge was added
      const updatedEdges = await cognitiveUtils.getCognitiveEdges();
      expect(updatedEdges.length).toBe(initialEdges.length + 1);

      const newEdge = updatedEdges.find(edge => edge.id.includes('realtime'));
      expect(newEdge).toBeDefined();
      expect(newEdge?.type).toBe('semantic');
      expect(newEdge?.animated).toBe(true);

      console.log(`✅ Real-time edge added: ${newEdge?.type} connection`);
    });

    await cognitiveTest.step('Handle connection resilience', async () => {
      // Simulate connection loss
      await page.evaluate(() => {
        const ws = (window as any).activeWebSocket;
        if (ws) {
          ws.close();
        }
      });

      // Check for reconnection attempt
      await expect(page.locator('[data-testid="connection-status"]')).toHaveText(/reconnecting|disconnected/i);

      // Simulate reconnection
      await page.evaluate(() => {
        const ws = new (window as any).WebSocket('ws://localhost:8080');
        (window as any).activeWebSocket = ws;
      });

      // Wait for reconnection
      await page.waitForTimeout(2000);

      // Verify connection restored
      await expect(page.locator('[data-testid="connection-status"]')).toHaveText(/connected/i);

      console.log('✅ WebSocket resilience tested');
    });
  });

  cognitiveTest('should handle complex cognitive dimension filtering', async ({
    page,
    cognitiveUtils
  }) => {
    await cognitiveTest.step('Test individual dimension filters', async () => {
      // Get initial node count
      const initialNodes = await cognitiveUtils.getCognitiveNodes();

      // Test factual dimension filter
      await page.click('[data-testid="filter-factual"]');
      await page.waitForTimeout(500);

      const factualNodes = await page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
        return Array.from(nodes).filter(node => {
          const nodeType = node.getAttribute('data-node-type');
          const style = window.getComputedStyle(node);
          return nodeType === 'factual_retrieval' && style.display !== 'none';
        }).length;
      });

      expect(factualNodes).toBeGreaterThan(0);

      // Test logical dimension filter
      await page.click('[data-testid="filter-logical"]');
      await page.waitForTimeout(500);

      const logicalNodes = await page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
        return Array.from(nodes).filter(node => {
          const nodeType = node.getAttribute('data-node-type');
          const style = window.getComputedStyle(node);
          return nodeType === 'logical_inference' && style.display !== 'none';
        }).length;
      });

      expect(logicalNodes).toBeGreaterThan(0);

      // Test creative dimension filter
      await page.click('[data-testid="filter-creative"]');
      await page.waitForTimeout(500);

      const creativeNodes = await page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
        return Array.from(nodes).filter(node => {
          const nodeType = node.getAttribute('data-node-type');
          const style = window.getComputedStyle(node);
          return nodeType === 'creative_synthesis' && style.display !== 'none';
        }).length;
      });

      expect(creativeNodes).toBeGreaterThan(0);

      // Test metacognitive dimension filter
      await page.click('[data-testid="filter-metacognitive"]');
      await page.waitForTimeout(500);

      const metacognitiveNodes = await page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
        return Array.from(nodes).filter(node => {
          const nodeType = node.getAttribute('data-node-type');
          const style = window.getComputedStyle(node);
          return nodeType === 'meta_cognition' && style.display !== 'none';
        }).length;
      });

      expect(metacognitiveNodes).toBeGreaterThan(0);

      console.log(`✅ Dimension filters: Factual=${factualNodes}, Logical=${logicalNodes}, Creative=${creativeNodes}, Metacognitive=${metacognitiveNodes}`);
    });

    await cognitiveTest.step('Test multiple dimension combinations', async () => {
      // Reset filters
      await page.click('[data-testid="reset-filters"]');
      await page.waitForTimeout(500);

      // Test factual + logical combination
      await page.click('[data-testid="filter-factual"]');
      await page.click('[data-testid="filter-logical"]');
      await page.waitForTimeout(500);

      const factualLogicalNodes = await page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
        return Array.from(nodes).filter(node => {
          const nodeType = node.getAttribute('data-node-type');
          const style = window.getComputedStyle(node);
          return (nodeType === 'factual_retrieval' || nodeType === 'logical_inference') &&
                 style.display !== 'none';
        }).length;
      });

      expect(factualLogicalNodes).toBeGreaterThan(0);

      // Test creative + metacognitive combination
      await page.click('[data-testid="filter-factual"]'); // Remove factual
      await page.click('[data-testid="filter-creative"]');
      await page.click('[data-testid="filter-metacognitive"]');
      await page.waitForTimeout(500);

      const creativeMetacognitiveNodes = await page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
        return Array.from(nodes).filter(node => {
          const nodeType = node.getAttribute('data-node-type');
          const style = window.getComputedStyle(node);
          return (nodeType === 'creative_synthesis' || nodeType === 'meta_cognition') &&
                 style.display !== 'none';
        }).length;
      });

      expect(creativeMetacognitiveNodes).toBeGreaterThan(0);

      console.log(`✅ Combined filters: Factual+Logical=${factualLogicalNodes}, Creative+Metacognitive=${creativeMetacognitiveNodes}`);
    });

    await cognitiveTest.step('Test confidence-based filtering', async () => {
      // Reset all filters
      await page.click('[data-testid="reset-filters"]');
      await page.waitForTimeout(500);

      // Test high confidence filter (>0.8)
      await page.click('[data-testid="confidence-high"]');
      await page.waitForTimeout(500);

      const highConfidenceNodes = await page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
        return Array.from(nodes).filter(node => {
          const confidence = parseFloat(node.getAttribute('data-confidence') || '0');
          const style = window.getComputedStyle(node);
          return confidence > 0.8 && style.display !== 'none';
        }).length;
      });

      expect(highConfidenceNodes).toBeGreaterThan(0);

      // Test medium confidence filter (0.5-0.8)
      await page.click('[data-testid="confidence-medium"]');
      await page.waitForTimeout(500);

      const mediumConfidenceNodes = await page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
        return Array.from(nodes).filter(node => {
          const confidence = parseFloat(node.getAttribute('data-confidence') || '0');
          const style = window.getComputedStyle(node);
          return confidence >= 0.5 && confidence <= 0.8 && style.display !== 'none';
        }).length;
      });

      expect(mediumConfidenceNodes).toBeGreaterThan(0);

      // Test low confidence filter (<0.5)
      await page.click('[data-testid="confidence-low"]');
      await page.waitForTimeout(500);

      const lowConfidenceNodes = await page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
        return Array.from(nodes).filter(node => {
          const confidence = parseFloat(node.getAttribute('data-confidence') || '0');
          const style = window.getComputedStyle(node);
          return confidence < 0.5 && style.display !== 'none';
        }).length;
      });

      console.log(`✅ Confidence filters: High=${highConfidenceNodes}, Medium=${mediumConfidenceNodes}, Low=${lowConfidenceNodes}`);
    });

    await cognitiveTest.step('Test temporal filtering', async () => {
      // Reset filters
      await page.click('[data-testid="reset-filters"]');
      await page.waitForTimeout(500);

      // Enable temporal view
      await page.click('[data-testid="enable-temporal-view"]');
      await page.waitForTimeout(500);

      // Test recent time filter (last 5 seconds)
      await page.click('[data-testid="time-filter-recent"]');
      await page.waitForTimeout(500);

      const recentNodes = await page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
        const now = Date.now();
        return Array.from(nodes).filter(node => {
          const timestamp = parseInt(node.getAttribute('data-timestamp') || '0');
          const style = window.getComputedStyle(node);
          return (now - timestamp) < 5000 && style.display !== 'none';
        }).length;
      });

      // Test historical time filter
      await page.click('[data-testid="time-filter-historical"]');
      await page.waitForTimeout(500);

      const historicalNodes = await page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
        const now = Date.now();
        return Array.from(nodes).filter(node => {
          const timestamp = parseInt(node.getAttribute('data-timestamp') || '0');
          const style = window.getComputedStyle(node);
          return (now - timestamp) >= 5000 && style.display !== 'none';
        }).length;
      });

      console.log(`✅ Temporal filters: Recent=${recentNodes}, Historical=${historicalNodes}`);
    });

    await cognitiveTest.step('Test filter persistence and presets', async () => {
      // Apply complex filter combination
      await page.click('[data-testid="filter-factual"]');
      await page.click('[data-testid="filter-logical"]');
      await page.click('[data-testid="confidence-high"]');
      await page.waitForTimeout(500);

      // Save current filter state as preset
      await page.click('[data-testid="save-filter-preset"]');
      await page.fill('[data-testid="preset-name"]', 'High Confidence Analytical');
      await page.click('[data-testid="save-preset-button"]');
      await page.waitForTimeout(500);

      // Reset filters
      await page.click('[data-testid="reset-filters"]');
      await page.waitForTimeout(500);

      // Load saved preset
      await page.click('[data-testid="load-filter-preset"]');
      await page.selectOption('[data-testid="preset-select"]', 'High Confidence Analytical');
      await page.click('[data-testid="load-preset-button"]');
      await page.waitForTimeout(500);

      // Verify filters were restored
      const factualActive = await page.locator('[data-testid="filter-factual"]').getAttribute('data-active');
      const logicalActive = await page.locator('[data-testid="filter-logical"]').getAttribute('data-active');
      const highConfActive = await page.locator('[data-testid="confidence-high"]').getAttribute('data-active');

      expect(factualActive).toBe('true');
      expect(logicalActive).toBe('true');
      expect(highConfActive).toBe('true');

      console.log('✅ Filter presets working correctly');
    });
  });

  cognitiveTest('should handle real-time performance with filtering', async ({
    page,
    performanceMonitor,
    cognitiveUtils
  }) => {
    await cognitiveTest.step('Monitor performance during real-time updates', async () => {
      await performanceMonitor.startMonitoring();

      // Enable real-time mode
      await page.click('[data-testid="enable-realtime-button"]');
      await page.waitForTimeout(1000);

      const baselineMetrics = await performanceMonitor.getMetrics();

      // Simulate rapid real-time updates
      for (let i = 0; i < 10; i++) {
        await page.evaluate((index) => {
          const ws = (window as any).activeWebSocket;
          if (ws) {
            ws.dispatchEvent(new MessageEvent('message', {
              data: JSON.stringify({
                type: 'cognitive_update',
                payload: {
                  updateType: i % 2 === 0 ? 'node_added' : 'node_updated',
                  ...(i % 2 === 0 ? {
                    node: {
                      id: `node-rapid-${index}`,
                      type: ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition'][index % 4],
                      content: `Rapid update ${index}`,
                      confidence: 0.7 + Math.random() * 0.3,
                    },
                  } : {
                    nodeId: `node-${index}`,
                    updates: { confidence: 0.9 + Math.random() * 0.1 },
                  }),
                },
              }),
            }));
          }
        }, i);

        await page.waitForTimeout(200);
      }

      // Check performance after rapid updates
      const afterRapidUpdates = await performanceMonitor.getMetrics();

      // Performance should not degrade significantly
      expect(afterRapidUpdates.fps).toBeGreaterThan(baselineMetrics.fps * 0.7);
      expect(afterRapidUpdates.memory).toBeLessThan(baselineMetrics.memory + 100);

      console.log(`✅ Performance maintained during rapid updates: ${afterRapidUpdates.fps} FPS`);
    });

    await cognitiveTest.step('Monitor performance during complex filtering', async () => {
      // Apply complex filter combinations rapidly
      const filterCombinations = [
        ['factual', 'logical'],
        ['creative', 'metacognitive'],
        ['factual', 'creative'],
        ['logical', 'metacognitive'],
        ['factual', 'logical', 'creative'],
        ['logical', 'creative', 'metacognitive'],
      ];

      for (const combination of filterCombinations) {
        // Reset filters
        await page.click('[data-testid="reset-filters"]');
        await page.waitForTimeout(300);

        // Apply filter combination
        for (const filter of combination) {
          await page.click(`[data-testid="filter-${filter}"]`);
        }
        await page.waitForTimeout(500);

        // Check performance
        const metrics = await performanceMonitor.getMetrics();
        expect(metrics.fps).toBeGreaterThan(30);
      }

      console.log('✅ Performance maintained during complex filtering operations');
    });

    await cognitiveTest.step('Test performance optimization modes', async () => {
      // Enable performance optimization mode
      await page.click('[data-testid="performance-mode-auto"]');
      await page.waitForTimeout(1000);

      // Test that optimizations are applied automatically
      const performanceMode = await page.locator('[data-testid="current-performance-mode"]').textContent();
      expect(performanceMode).toMatch(/optimized|balanced/i);

      // Test manual performance settings
      await page.click('[data-testid="performance-settings"]');
      await expect(page.locator('[data-testid="performance-dialog"]')).toBeVisible();

      // Enable aggressive optimization
      await page.check('[data-testid="reduce-quality"]');
      await page.check('[data-testid="limit-updates"]');
      await page.check('[data-testid="disable-animations"]');

      await page.click('[data-testid="apply-settings"]');
      await page.waitForTimeout(1000);

      // Verify performance improvements
      const optimizedMetrics = await performanceMonitor.getMetrics();
      expect(optimizedMetrics.fps).toBeGreaterThan(120);

      console.log(`✅ Performance optimization effective: ${optimizedMetrics.fps} FPS achieved`);
    });
  });
});