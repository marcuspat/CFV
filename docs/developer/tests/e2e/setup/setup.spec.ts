import { test, expect } from '@playwright/test';
import { graphFixtures, performanceBaselines } from '../fixtures/cognitive-graph-data';

/**
 * Global setup tests to ensure the application is ready for testing
 * These tests run before the main test suites to validate the environment
 */

test.describe('Cognitive Fabric Visualizer - Setup Validation', () => {
  test.beforeEach(async ({ page }) => {
    // Set up performance monitoring
    await page.addInitScript(() => {
      (window as any).performanceMetrics = {
        frames: 0,
        startTime: performance.now(),
        fps: 0,
        memory: 0,
      };
    });
  });

  test('should load the application successfully', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');

    // Wait for the main application to load
    await expect(page.locator('body')).toBeVisible();

    const loadTime = Date.now() - startTime;
    console.log(`PERFORMANCE: {"loadTime": ${loadTime}}`);

    // Load time should be reasonable
    expect(loadTime).toBeLessThan(performanceBaselines.small.targetLoadTime);
  });

  test('should initialize WebGL context successfully', async ({ page }) => {
    await page.goto('/');

    // Wait for WebGL context
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
    }, { timeout: 30000 });

    // Verify WebGL is working
    const webglSupported = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return !!gl;
    });

    expect(webglSupported).toBe(true);
    console.log('✅ WebGL context verified');
  });

  test('should load cognitive visualization components', async ({ page }) => {
    await page.goto('/');

    // Wait for main visualization container
    await expect(page.locator('[data-testid="cognitive-visualization"]')).toBeVisible({ timeout: 15000 });

    // Wait for 3D canvas to be ready
    await expect(page.locator('canvas')).toBeVisible({ timeout: 10000 });

    // Check for control elements
    await expect(page.locator('[data-testid="visualization-controls"]')).toBeVisible();
    await expect(page.locator('[data-testid="dimension-filters"]')).toBeVisible();
    await expect(page.locator('[data-testid="performance-indicators"]')).toBeVisible();
  });

  test('should establish WebSocket connection for real-time updates', async ({ page }) => {
    await page.goto('/');

    // Mock WebSocket to test connection establishment
    await page.addInitScript(() => {
      (window as any).mockWebSocketConnected = false;

      // Mock WebSocket constructor
      const OriginalWebSocket = window.WebSocket;
      window.WebSocket = class extends OriginalWebSocket {
        constructor(url: string, protocols?: string | string[]) {
          super(url, protocols);
          (window as any).mockWebSocketConnected = true;
        }
      };
    });

    // Wait for WebSocket connection simulation
    await page.waitForFunction(() => (window as any).mockWebSocketConnected, { timeout: 10000 });

    const wsConnected = await page.evaluate(() => (window as any).mockWebSocketConnected);
    expect(wsConnected).toBe(true);
    console.log('✅ WebSocket connection established');
  });

  test('should load sample cognitive graph data', async ({ page }) => {
    await page.goto('/');

    // Mock API response for cognitive graph data
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

    // Trigger graph loading
    await page.click('[data-testid="load-sample-graph"]');

    // Wait for nodes to appear
    await page.waitForSelector('[data-testid="cognitive-node"]', { timeout: 15000 });

    // Verify nodes are loaded
    const nodeCount = await page.locator('[data-testid="cognitive-node"]').count();
    expect(nodeCount).toBeGreaterThan(0);

    // Verify edges are loaded
    const edgeCount = await page.locator('[data-testid="cognitive-edge"]').count();
    expect(edgeCount).toBeGreaterThan(0);

    console.log(`✅ Loaded ${nodeCount} nodes and ${edgeCount} edges`);
  });

  test('should initialize performance monitoring', async ({ page }) => {
    await page.goto('/');

    // Wait for performance indicators to be visible
    await expect(page.locator('[data-testid="fps-indicator"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="memory-indicator"]')).toBeVisible({ timeout: 10000 });

    // Check initial performance values
    const fpsText = await page.locator('[data-testid="fps-indicator"]').textContent();
    const memoryText = await page.locator('[data-testid="memory-indicator"]').textContent();

    expect(fpsText).toMatch(/\d+ FPS/);
    expect(memoryText).toMatch(/\d+ MB/);

    console.log(`✅ Performance monitoring initialized: ${fpsText}, ${memoryText}`);
  });

  test('should handle responsive design correctly', async ({ page }) => {
    await page.goto('/');

    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1000);

    await expect(page.locator('[data-testid="desktop-layout"]')).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(1000);

    await expect(page.locator('[data-testid="tablet-layout"]')).toBeVisible();

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);

    await expect(page.locator('[data-testid="mobile-layout"]')).toBeVisible();

    console.log('✅ Responsive design validated for all viewports');
  });

  test('should handle browser compatibility features', async ({ page }) => {
    await page.goto('/');

    // Check for required browser features
    const browserFeatures = await page.evaluate(() => {
      return {
        webgl2: !!document.createElement('canvas').getContext('webgl2'),
        webgl: !!document.createElement('canvas').getContext('webgl'),
        webglSupported: (() => {
          const canvas = document.createElement('canvas');
          return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
        })(),
        webAssembly: typeof WebAssembly === 'object',
        requestAnimationFrame: typeof requestAnimationFrame === 'function',
        performanceAPI: typeof performance === 'object' && typeof performance.now === 'function',
      };
    });

    expect(browserFeatures.webglSupported).toBe(true);
    expect(browserFeatures.requestAnimationFrame).toBe(true);
    expect(browserFeatures.performanceAPI).toBe(true);

    console.log('✅ Browser compatibility features validated:', browserFeatures);
  });

  test('should handle error states gracefully', async ({ page }) => {
    await page.goto('/');

    // Mock API error response
    await page.route('/api/cognitive-graph', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Internal server error',
          timestamp: Date.now(),
        }),
      });
    });

    // Try to load graph data
    await page.click('[data-testid="load-sample-graph"]');

    // Check for error handling
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible({ timeout: 5000 });

    const errorMessage = await page.locator('[data-testid="error-message"]').textContent();
    expect(errorMessage).toContain('Failed to load cognitive graph');

    console.log('✅ Error handling validated');
  });

  test('should establish baseline performance metrics', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');

    // Wait for full initialization
    await page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 15000 });
    await page.waitForSelector('canvas', { timeout: 10000 });

    const loadTime = Date.now() - startTime;

    // Get initial performance metrics
    const initialMetrics = await page.evaluate(() => {
      return {
        memory: (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024) : 0,
        domNodes: document.querySelectorAll('*').length,
        eventListeners: (window as any).eventListeners || 0,
      };
    });

    // Validate baseline metrics
    expect(loadTime).toBeLessThan(performanceBaselines.small.acceptableLoadTime);
    expect(initialMetrics.memory).toBeLessThan(performanceBaselines.small.acceptableMemory);

    console.log(`PERFORMANCE: ${JSON.stringify({
      loadTime,
      memory: initialMetrics.memory,
      domNodes: initialMetrics.domNodes,
    })}`);

    console.log('✅ Baseline performance metrics established');
  });
});