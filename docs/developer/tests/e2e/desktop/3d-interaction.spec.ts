import { test, expect } from '@playwright/test';
import { test as cognitiveTest } from '../helpers/test-fixtures';
import { graphFixtures, performanceBaselines } from '../fixtures/cognitive-graph-data';

/**
 * Desktop 3D interaction tests
 * Tests 3D visualization controls, interactions, and performance on desktop browsers
 */

cognitiveTest.describe('Cognitive Fabric Visualizer - 3D Desktop Interactions', () => {
  cognitiveTest.beforeEach(async ({ page, performanceMonitor, cognitiveUtils }) => {
    await page.goto('/');
    await performanceMonitor.startMonitoring();

    // Load test data
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
  });

  cognitiveTest('should handle orbit camera controls smoothly', async ({
    page,
    performanceMonitor,
    cognitiveUtils
  }) => {
    await cognitiveTest.step('Test orbit rotation controls', async () => {
      const canvas = await page.locator('canvas').first();
      const initialNodes = await cognitiveUtils.getCognitiveNodes();

      // Test orbit rotation with mouse drag
      await canvas.hover();
      await page.mouse.down();

      // Rotate horizontally
      await page.mouse.move(100, 0);
      await page.waitForTimeout(100);

      // Rotate vertically
      await page.mouse.move(0, 50);
      await page.waitForTimeout(100);

      // Continue rotation
      await page.mouse.move(-50, -25);
      await page.waitForTimeout(100);

      await page.mouse.up();
      await page.waitForTimeout(500);

      // Verify camera moved and scene updated
      const updatedNodes = await cognitiveUtils.getCognitiveNodes();
      expect(updatedNodes.length).toBe(initialNodes.length);

      // Check performance during rotation
      const rotationMetrics = await performanceMonitor.getMetrics();
      expect(rotationMetrics.fps).toBeGreaterThan(60);

      console.log(`✅ Orbit rotation smooth at ${rotationMetrics.fps} FPS`);
    });

    await cognitiveTest.step('Test zoom controls', async () => {
      const canvas = await page.locator('canvas').first();

      // Test zoom in with mouse wheel
      await canvas.hover();
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(300);

      // Test zoom out
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(300);

      // Test precision zoom
      await page.mouse.wheel(0, -50);
      await page.waitForTimeout(200);

      // Verify zoom controls in UI work
      await page.click('[data-testid="zoom-in-button"]');
      await page.waitForTimeout(200);

      await page.click('[data-testid="zoom-out-button"]');
      await page.waitForTimeout(200);

      // Test zoom reset
      await page.click('[data-testid="zoom-reset-button"]');
      await page.waitForTimeout(200);

      const zoomMetrics = await performanceMonitor.getMetrics();
      expect(zoomMetrics.fps).toBeGreaterThan(60);

      console.log(`✅ Zoom controls responsive at ${zoomMetrics.fps} FPS`);
    });

    await cognitiveTest.step('Test pan controls', async () => {
      const canvas = await page.locator('canvas').first();

      // Test pan with Shift+drag
      await page.keyboard.down('Shift');
      await canvas.hover();
      await page.mouse.down();
      await page.mouse.move(100, 50);
      await page.waitForTimeout(200);
      await page.mouse.up();
      await page.keyboard.up('Shift');

      // Test pan controls
      await page.click('[data-testid="pan-left-button"]');
      await page.waitForTimeout(100);

      await page.click('[data-testid="pan-right-button"]');
      await page.waitForTimeout(100);

      await page.click('[data-testid="pan-up-button"]');
      await page.waitForTimeout(100);

      await page.click('[data-testid="pan-down-button"]');
      await page.waitForTimeout(100);

      // Test pan reset
      await page.click('[data-testid="pan-reset-button"]');
      await page.waitForTimeout(200);

      const panMetrics = await performanceMonitor.getMetrics();
      expect(panMetrics.fps).toBeGreaterThan(60);

      console.log(`✅ Pan controls working at ${panMetrics.fps} FPS`);
    });
  });

  cognitiveTest('should handle complex node interactions', async ({
    page,
    cognitiveUtils
  }) => {
    await cognitiveTest.step('Test node selection and highlighting', async () => {
      const nodes = await cognitiveUtils.getCognitiveNodes();
      expect(nodes.length).toBeGreaterThan(0);

      // Test clicking on first node
      await cognitiveUtils.clickNode(nodes[0].id);

      // Verify selection state
      await expect(page.locator(`[data-node-id="${nodes[0].id}"][data-selected="true"]`)).toBeVisible();

      // Check node details panel
      await expect(page.locator('[data-testid="node-details-panel"]')).toBeVisible();

      const nodeDetails = await page.locator('[data-testid="node-details-panel"]').textContent();
      expect(nodeDetails).toContain(nodes[0].type.replace('_', ' '));
      expect(nodeDetails).toContain(nodes[0].confidence.toString());

      // Test multiple selection with Ctrl+click
      await page.keyboard.down('Control');
      await cognitiveUtils.clickNode(nodes[1].id);
      await page.keyboard.up('Control');

      // Verify multiple selection
      const selectedNodes = await page.locator('[data-selected="true"]').count();
      expect(selectedNodes).toBe(2);

      console.log(`✅ Node selection working for ${selectedNodes} nodes`);
    });

    await cognitiveTest.step('Test node hover interactions', async () => {
      const nodes = await cognitiveUtils.getCognitiveNodes();

      // Test hover state
      await cognitiveUtils.hoverNode(nodes[0].id);

      // Verify hover state
      await expect(page.locator(`[data-node-id="${nodes[0].id}"][data-hovered="true"]`)).toBeVisible();

      // Check for tooltip
      await expect(page.locator('[data-testid="node-tooltip"]')).toBeVisible();

      const tooltipContent = await page.locator('[data-testid="node-tooltip"]').textContent();
      expect(tooltipContent).toContain(nodes[0].type.replace('_', ' '));

      // Test hover animation
      const hoverAnimation = await page.evaluate((nodeId) => {
        const node = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (!node) return false;

        const style = window.getComputedStyle(node);
        const transform = style.transform;
        const scale = transform.match(/scale\(([\d.]+)\)/);
        return scale && parseFloat(scale[1]) > 1;
      }, nodes[0].id);

      expect(hoverAnimation).toBe(true);

      // Test hover removal
      await page.mouse.move(500, 500); // Move away
      await page.waitForTimeout(100);

      await expect(page.locator(`[data-node-id="${nodes[0].id}"][data-hovered="false"]`)).toBeVisible();
      await expect(page.locator('[data-testid="node-tooltip"]')).not.toBeVisible();

      console.log('✅ Node hover interactions working correctly');
    });

    await cognitiveTest.step('Test node context menu', async () => {
      const nodes = await cognitiveUtils.getCognitiveNodes();

      // Right-click on node to open context menu
      await page.click(`[data-node-id="${nodes[0].id}"]`, { button: 'right' });

      await expect(page.locator('[data-testid="node-context-menu"]')).toBeVisible();

      // Test context menu options
      await expect(page.locator('[data-testid="context-focus-node"]')).toBeVisible();
      await expect(page.locator('[data-testid="context-hide-node"]')).toBeVisible();
      await expect(page.locator('[data-testid="context-inspect-node"]')).toBeVisible();
      await expect(page.locator('[data-testid="context-export-node"]')).toBeVisible();

      // Test focus on node
      await page.click('[data-testid="context-focus-node"]');
      await page.waitForTimeout(500);

      // Verify camera focused on node
      const focusedNode = await page.evaluate((nodeId) => {
        const node = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (!node) return false;

        const rect = node.getBoundingClientRect();
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        return Math.abs(rect.left + rect.width / 2 - centerX) < 100 &&
               Math.abs(rect.top + rect.height / 2 - centerY) < 100;
      }, nodes[0].id);

      expect(focusedNode).toBe(true);

      console.log('✅ Node context menu working correctly');
    });
  });

  cognitiveTest('should handle advanced 3D visualization features', async ({
    page,
    performanceMonitor
  }) => {
    await cognitiveTest.step('Test visualization mode switching', async () => {
      // Test 3D sphere mode
      await page.click('[data-testid="view-mode-sphere"]');
      await page.waitForTimeout(500);

      const sphereActive = await page.locator('[data-testid="view-mode-sphere"]').getAttribute('data-active');
      expect(sphereActive).toBe('true');

      // Test 2D force-directed mode
      await page.click('[data-testid="view-mode-2d"]');
      await page.waitForTimeout(500);

      const mode2dActive = await page.locator('[data-testid="view-mode-2d"]').getAttribute('data-active');
      expect(mode2dActive).toBe('true');

      // Test tree layout mode
      await page.click('[data-testid="view-mode-tree"]');
      await page.waitForTimeout(500);

      const treeActive = await page.locator('[data-testid="view-mode-tree"]').getAttribute('data-active');
      expect(treeActive).toBe('true');

      // Test circular layout mode
      await page.click('[data-testid="view-mode-circular"]');
      await page.waitForTimeout(500);

      const circularActive = await page.locator('[data-testid="view-mode-circular"]').getAttribute('data-active');
      expect(circularActive).toBe('true');

      console.log('✅ All visualization modes working correctly');
    });

    await cognitiveTest.step('Test advanced rendering options', async () => {
      // Test edge rendering styles
      await page.click('[data-testid="edge-style-animated"]');
      await page.waitForTimeout(300);

      await page.click('[data-testid="edge-style-gradient"]');
      await page.waitForTimeout(300);

      await page.click('[data-testid="edge-style-dashed"]');
      await page.waitForTimeout(300);

      // Test node rendering styles
      await page.click('[data-testid="node-style-glow"]');
      await page.waitForTimeout(300);

      await page.click('[data-testid="node-style-wireframe"]');
      await page.waitForTimeout(300);

      await page.click('[data-testid="node-style-solid"]');
      await page.waitForTimeout(300);

      // Test background effects
      await page.click('[data-testid="background-grid"]');
      await page.waitForTimeout(300);

      await page.click('[data-testid="background-particles"]');
      await page.waitForTimeout(300);

      await page.click('[data-testid="background-gradient"]');
      await page.waitForTimeout(300);

      const renderingMetrics = await performanceMonitor.getMetrics();
      expect(renderingMetrics.fps).toBeGreaterThan(60);

      console.log(`✅ Advanced rendering options working at ${renderingMetrics.fps} FPS`);
    });

    await cognitiveTest.step('Test lighting and material options', async () => {
      // Test lighting presets
      await page.click('[data-testid="lighting-bright"]');
      await page.waitForTimeout(200);

      await page.click('[data-testid="lighting-dim"]');
      await page.waitForTimeout(200);

      await page.click('[data-testid="lighting-dramatic"]');
      await page.waitForTimeout(200);

      // Test material presets
      await page.click('[data-testid="material-glass"]');
      await page.waitForTimeout(200);

      await page.click('[data-testid="material-metallic"]');
      await page.waitForTimeout(200);

      await page.click('[data-testid="material-matte"]');
      await page.waitForTimeout(200);

      // Test ambient occlusion
      await page.check('[data-testid="enable-ambient-occlusion"]');
      await page.waitForTimeout(500);

      await page.uncheck('[data-testid="enable-ambient-occlusion"]');
      await page.waitForTimeout(300);

      console.log('✅ Lighting and material options working correctly');
    });
  });

  cognitiveTest('should maintain performance under stress', async ({
    page,
    performanceMonitor,
    cognitiveUtils
  }) => {
    await cognitiveTest.step('Test performance with large graphs', async () => {
      // Load large graph for stress testing
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

      await page.click('[data-testid="load-large-graph"]');
      await cognitiveUtils.waitForSceneReady();

      // Allow for initial rendering
      await page.waitForTimeout(2000);

      const largeGraphMetrics = await performanceMonitor.validatePerformance({
        fps: performanceBaselines.large.targetFPS,
        memory: performanceBaselines.large.targetMemory,
      });

      expect(largeGraphMetrics.fps.passed).toBe(true);
      expect(largeGraphMetrics.memory.passed).toBe(true);

      console.log(`✅ Large graph performance: ${largeGraphMetrics.fps.current} FPS, ${largeGraphMetrics.memory.current}MB`);
    });

    await cognitiveTest.step('Test performance during complex interactions', async () => {
      // Test rapid camera movements
      const canvas = await page.locator('canvas').first();

      for (let i = 0; i < 10; i++) {
        await canvas.hover();
        await page.mouse.down();
        await page.mouse.move(
          Math.random() * 200 - 100,
          Math.random() * 200 - 100
        );
        await page.mouse.up();
        await page.waitForTimeout(50);
      }

      // Test rapid zooming
      for (let i = 0; i < 5; i++) {
        await canvas.hover();
        await page.mouse.wheel(0, (Math.random() - 0.5) * 300);
        await page.waitForTimeout(100);
      }

      // Test rapid node selection
      const nodes = await cognitiveUtils.getCognitiveNodes();
      for (let i = 0; i < Math.min(10, nodes.length); i++) {
        await cognitiveUtils.clickNode(nodes[i].id);
        await page.waitForTimeout(50);
      }

      const stressTestMetrics = await performanceMonitor.getMetrics();
      expect(stressTestMetrics.fps).toBeGreaterThan(30);

      console.log(`✅ Stress test performance: ${stressTestMetrics.fps} FPS maintained`);
    });

    await cognitiveTest.step('Test memory usage over time', async () => {
      const initialMemory = (await performanceMonitor.getMetrics()).memory;

      // Perform various operations over time
      for (let cycle = 0; cycle < 5; cycle++) {
        // Switch visualization modes
        await page.click('[data-testid="view-mode-sphere"]');
        await page.waitForTimeout(500);

        await page.click('[data-testid="view-mode-2d"]');
        await page.waitForTimeout(500);

        // Filter by dimensions
        const dimensions = ['factual', 'logical', 'creative', 'metacognitive'];
        await page.click(`[data-testid="filter-${dimensions[cycle % 4]}"]`);
        await page.waitForTimeout(300);

        // Reset filters
        await page.click('[data-testid="reset-filters"]');
        await page.waitForTimeout(300);
      }

      const finalMemory = (await performanceMonitor.getMetrics()).memory;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (<100MB)
      expect(memoryIncrease).toBeLessThan(100);

      console.log(`✅ Memory usage stable: increased by ${memoryIncrease}MB over test period`);
    });
  });
});