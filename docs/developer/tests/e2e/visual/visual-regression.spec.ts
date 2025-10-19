import { test, expect } from '@playwright/test';
import { graphFixtures } from '../fixtures/cognitive-graph-data';

/**
 * Visual regression testing suite
 * Tests UI consistency, visual accuracy, and screenshot comparison
 */

test.describe('Cognitive Fabric Visualizer - Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Set consistent viewport for visual testing
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Disable animations for consistent screenshots
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `,
    });

    // Load test data
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
  });

  test('should match baseline visualization layout', async ({ page }) => {
    await page.click('[data-testid="load-sample-graph"]');

    // Wait for visualization to fully render
    await page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 15000 });
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Wait for WebGL rendering to complete
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;

      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return false;

      // Check if rendering is complete by checking for any pixels
      const pixels = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels[3] > 0; // Check alpha channel
    }, { timeout: 20000 });

    // Take full page screenshot for layout comparison
    await expect(page.locator('body')).toHaveScreenshot('full-layout.png', {
      fullPage: true,
      animations: 'disabled',
      caret: 'hide',
    });

    // Take specific component screenshots
    await expect(page.locator('[data-testid="cognitive-visualization"]')).toHaveScreenshot('visualization-container.png', {
      animations: 'disabled',
    });

    await expect(page.locator('[data-testid="visualization-controls"]')).toHaveScreenshot('controls-panel.png', {
      animations: 'disabled',
    });

    await expect(page.locator('[data-testid="dimension-filters"]')).toHaveScreenshot('filter-controls.png', {
      animations: 'disabled',
    });
  });

  test('should match baseline with medium graph complexity', async ({ page }) => {
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

    await page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 20000 });
    await page.waitForSelector('canvas', { timeout: 15000 });

    // Wait for nodes to be rendered
    await page.waitForFunction(() => {
      const nodes = document.querySelectorAll('[data-testid="cognitive-node"]');
      return nodes.length >= 20;
    }, { timeout: 15000 });

    await expect(page.locator('[data-testid="cognitive-visualization"]')).toHaveScreenshot('medium-graph-visualization.png', {
      animations: 'disabled',
    });

    // Test with different view modes
    await page.click('[data-testid="view-mode-sphere"]');
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="cognitive-visualization"]')).toHaveScreenshot('sphere-view-mode.png', {
      animations: 'disabled',
    });

    await page.click('[data-testid="view-mode-2d"]');
    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="cognitive-visualization"]')).toHaveScreenshot('2d-view-mode.png', {
      animations: 'disabled',
    });
  });

  test('should match baseline with different filtering states', async ({ page }) => {
    await page.click('[data-testid="load-sample-graph"]');
    await page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 15000 });

    // Test each dimension filter
    const dimensions = ['factual', 'logical', 'creative', 'metacognitive'];

    for (const dimension of dimensions) {
      await page.click(`[data-testid="filter-${dimension}"]`);
      await page.waitForTimeout(1000);

      await expect(page.locator('[data-testid="cognitive-visualization"]')).toHaveScreenshot(`filtered-${dimension}.png`, {
        animations: 'disabled',
      });
    }

    // Test multiple filters
    await page.click('[data-testid="filter-factual"]');
    await page.click('[data-testid="filter-logical"]');
    await page.waitForTimeout(1000);

    await expect(page.locator('[data-testid="cognitive-visualization"]')).toHaveScreenshot('filtered-factual-logical.png', {
      animations: 'disabled',
    });

    // Reset filters
    await page.click('[data-testid="reset-filters"]');
    await page.waitForTimeout(1000);
  });

  test('should match baseline for interactive states', async ({ page }) => {
    await page.click('[data-testid="load-sample-graph"]');
    await page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 15000 });

    // Test hover state on first node
    const nodes = await page.locator('[data-testid="cognitive-node"]');
    if (await nodes.count() > 0) {
      await nodes.first().hover();
      await page.waitForTimeout(500);

      await expect(page.locator('[data-testid="cognitive-visualization"]')).toHaveScreenshot('node-hover-state.png', {
        animations: 'disabled',
      });

      // Test selected state
      await nodes.first().click();
      await page.waitForTimeout(500);

      await expect(page.locator('[data-testid="cognitive-visualization"]')).toHaveScreenshot('node-selected-state.png', {
        animations: 'disabled',
      });
    }

    // Test control panel states
    await page.hover('[data-testid="zoom-in-button"]');
    await page.waitForTimeout(200);
    await expect(page.locator('[data-testid="visualization-controls"]')).toHaveScreenshot('zoom-hover-state.png', {
      animations: 'disabled',
    });

    // Test expanded panels
    await page.click('[data-testid="expand-filters"]');
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="dimension-filters"]')).toHaveScreenshot('expanded-filters.png', {
      animations: 'disabled',
    });
  });

  test('should match baseline for dark/light theme variations', async ({ page }) => {
    await page.click('[data-testid="load-sample-graph"]');
    await page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 15000 });

    // Test light theme (default)
    await expect(page.locator('body')).toHaveScreenshot('light-theme-layout.png', {
      fullPage: true,
      animations: 'disabled',
    });

    // Switch to dark theme
    await page.click('[data-testid="theme-toggle"]');
    await page.waitForTimeout(1000);

    await expect(page.locator('body')).toHaveScreenshot('dark-theme-layout.png', {
      fullPage: true,
      animations: 'disabled',
    });

    // Test visualization in dark theme
    await expect(page.locator('[data-testid="cognitive-visualization"]')).toHaveScreenshot('dark-theme-visualization.png', {
      animations: 'disabled',
    });

    // Switch back to light theme
    await page.click('[data-testid="theme-toggle"]');
    await page.waitForTimeout(1000);
  });

  test('should match baseline for responsive breakpoints', async ({ page }) => {
    await page.click('[data-testid="load-sample-graph"]');
    await page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 15000 });

    // Test desktop (1920x1080)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toHaveScreenshot('desktop-1920x1080.png', {
      fullPage: true,
      animations: 'disabled',
    });

    // Test laptop (1366x768)
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toHaveScreenshot('laptop-1366x768.png', {
      fullPage: true,
      animations: 'disabled',
    });

    // Test tablet (768x1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toHaveScreenshot('tablet-768x1024.png', {
      fullPage: true,
      animations: 'disabled',
    });

    // Test mobile portrait (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toHaveScreenshot('mobile-375x667.png', {
      fullPage: true,
      animations: 'disabled',
    });

    // Test mobile landscape (667x375)
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(1000);
    await expect(page.locator('body')).toHaveScreenshot('mobile-667x375.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('should match baseline for error and loading states', async ({ page }) => {
    // Test loading state
    await page.route('/api/cognitive-graph', (route) => {
      // Delay response to show loading state
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: graphFixtures.small,
            timestamp: Date.now(),
          }),
        });
      }, 2000);
    });

    await page.click('[data-testid="load-sample-graph"]');

    // Capture loading state
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible();
    await expect(page.locator('body')).toHaveScreenshot('loading-state.png', {
      fullPage: true,
      animations: 'disabled',
    });

    // Wait for loading to complete
    await page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 5000 });

    // Test error state
    await page.route('/api/cognitive-graph', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Internal server error occurred',
          timestamp: Date.now(),
        }),
      });
    });

    await page.click('[data-testid="load-sample-graph"]');

    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('body')).toHaveScreenshot('error-state.png', {
      fullPage: true,
      animations: 'disabled',
    });

    // Test empty state
    await page.click('[data-testid="clear-graph"]');
    await page.waitForTimeout(1000);

    await expect(page.locator('[data-testid="empty-state"]')).toBeVisible();
    await expect(page.locator('body')).toHaveScreenshot('empty-state.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('should match baseline for high-DPI displays', async ({ page }) => {
    await page.click('[data-testid="load-sample-graph"]');
    await page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 15000 });

    // Test 2x pixel ratio
    await page.addStyleTag({
      content: `
        body {
          image-rendering: -webkit-optimize-contrast;
          image-rendering: crisp-edges;
        }
      `,
    });

    // Set device pixel ratio for testing
    await page.evaluate(() => {
      Object.defineProperty(window, 'devicePixelRatio', {
        writable: true,
        value: 2,
      });
    });

    await page.waitForTimeout(2000);

    await expect(page.locator('[data-testid="cognitive-visualization"]')).toHaveScreenshot('high-dpi-2x.png', {
      animations: 'disabled',
    });

    // Test 3x pixel ratio
    await page.evaluate(() => {
      Object.defineProperty(window, 'devicePixelRatio', {
        writable: true,
        value: 3,
      });
    });

    await page.waitForTimeout(2000);

    await expect(page.locator('[data-testid="cognitive-visualization"]')).toHaveScreenshot('high-dpi-3x.png', {
      animations: 'disabled',
    });
  });

  test('should match baseline for accessibility features', async ({ page }) => {
    await page.click('[data-testid="load-sample-graph"]');
    await page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 15000 });

    // Test high contrast mode
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.addStyleTag({
      content: `
        * {
          forced-color-adjust: forced;
        }
      `,
    });

    await expect(page.locator('body')).toHaveScreenshot('high-contrast-mode.png', {
      fullPage: true,
      animations: 'disabled',
    });

    // Test reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(1000);

    await expect(page.locator('[data-testid="cognitive-visualization"]')).toHaveScreenshot('reduced-motion.png', {
      animations: 'disabled',
    });

    // Test increased font size
    await page.addStyleTag({
      content: `
        * {
          font-size: 120% !important;
        }
      `,
    });

    await page.waitForTimeout(1000);

    await expect(page.locator('body')).toHaveScreenshot('increased-font-size.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('should match baseline for different browsers rendering', async ({ page }) => {
    await page.click('[data-testid="load-sample-graph"]');
    await page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 15000 });

    // Test WebGL vs WebGL2 fallback
    await page.addInitScript(() => {
      // Force WebGL1 to test fallback
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(contextId, ...args) {
        if (contextId === 'webgl2') {
          return null; // Force fallback to WebGL1
        }
        return originalGetContext.call(this, contextId, ...args);
      };
    });

    await page.reload();
    await page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 15000 });

    await expect(page.locator('[data-testid="cognitive-visualization"]')).toHaveScreenshot('webgl1-fallback.png', {
      animations: 'disabled',
    });
  });

  test('should match baseline for performance indicators', async ({ page }) => {
    await page.click('[data-testid="load-sample-graph"]');
    await page.waitForSelector('[data-testid="cognitive-visualization"]', { timeout: 15000 });

    // Test performance indicators display
    await expect(page.locator('[data-testid="performance-indicators"]')).toBeVisible();
    await expect(page.locator('[data-testid="performance-indicators"]')).toHaveScreenshot('performance-indicators.png', {
      animations: 'disabled',
    });

    // Test FPS meter at different performance levels
    await page.evaluate(() => {
      // Mock high FPS
      (window as any).mockFPS = 240;
    });

    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="fps-indicator"]')).toHaveScreenshot('fps-indicator-high.png', {
      animations: 'disabled',
    });

    await page.evaluate(() => {
      // Mock medium FPS
      (window as any).mockFPS = 120;
    });

    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="fps-indicator"]')).toHaveScreenshot('fps-indicator-medium.png', {
      animations: 'disabled',
    });

    await page.evaluate(() => {
      // Mock low FPS
      (window as any).mockFPS = 30;
    });

    await page.waitForTimeout(1000);
    await expect(page.locator('[data-testid="fps-indicator"]')).toHaveScreenshot('fps-indicator-low.png', {
      animations: 'disabled',
    });
  });
});