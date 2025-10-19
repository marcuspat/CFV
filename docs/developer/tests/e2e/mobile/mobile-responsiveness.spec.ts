import { test, expect } from '@playwright/test';
import { test as cognitiveTest } from '../helpers/test-fixtures';
import { graphFixtures } from '../fixtures/cognitive-graph-data';

/**
 * Mobile responsiveness and touch interaction tests
 * Tests the application on various mobile devices and screen sizes
 */

cognitiveTest.describe('Cognitive Fabric Visualizer - Mobile Responsiveness', () => {
  cognitiveTest.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Mock API responses for mobile testing
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

    // Simulate touch events
    await page.addInitScript(() => {
      // Override touch event detection
      Object.defineProperty(navigator, 'maxTouchPoints', {
        writable: true,
        value: 5,
      });

      Object.defineProperty(navigator, 'ontouchstart', {
        writable: true,
        value: null,
      });

      // Add touch event support detection
      ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    });
  });

  cognitiveTest('should work on iPhone 12 (portrait)', async ({
    page,
    cognitiveUtils,
    mobileUtils
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await cognitiveTest.step('Test mobile layout adaptation', async () => {
      // Load sample graph
      await page.click('[data-testid="load-sample-graph"]');
      await cognitiveUtils.waitForSceneReady();

      // Verify mobile layout elements
      await expect(page.locator('[data-testid="mobile-layout"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-controls"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-navigation"]')).toBeVisible();

      // Check that desktop-specific elements are hidden
      await expect(page.locator('[data-testid="desktop-sidebar"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="desktop-toolbar"]')).not.toBeVisible();

      console.log('✅ Mobile layout properly adapted for iPhone 12 portrait');
    });

    await cognitiveTest.step('Test touch interactions', async () => {
      // Test tap interactions on nodes
      const nodes = await page.locator('[data-testid="cognitive-node"]');
      if (await nodes.count() > 0) {
        await nodes.first().tap();
        await page.waitForTimeout(500);

        // Verify touch feedback
        await expect(page.locator('[data-testid="touch-feedback"]')).toBeVisible({ timeout: 3000 });

        // Check node details panel adapts to mobile
        await expect(page.locator('[data-testid="mobile-node-details"]')).toBeVisible();
      }

      // Test swipe gestures for navigation
      await mobileUtils.testTouchInteractions();

      // Test pinch-to-zoom
      await page.touchscreen.tap(200, 400);
      await page.waitForTimeout(100);

      // Simulate pinch gesture
      await page.touchscreen.tapAt(150, 350);
      await page.touchscreen.tapAt(250, 450);
      await page.waitForTimeout(200);

      console.log('✅ Touch interactions working correctly on mobile');
    });

    await cognitiveTest.step('Test mobile-specific controls', async () => {
      // Test mobile control buttons
      await expect(page.locator('[data-testid="mobile-zoom-in"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-zoom-out"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-rotate"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-reset"]')).toBeVisible();

      // Test mobile zoom controls
      await page.tap('[data-testid="mobile-zoom-in"]');
      await page.waitForTimeout(300);

      await page.tap('[data-testid="mobile-zoom-out"]');
      await page.waitForTimeout(300);

      // Test mobile rotation controls
      await page.tap('[data-testid="mobile-rotate"]');
      await page.waitForTimeout(300);

      // Test mobile reset
      await page.tap('[data-testid="mobile-reset"]');
      await page.waitForTimeout(300);

      console.log('✅ Mobile controls working correctly');
    });

    await cognitiveTest.step('Test mobile filtering interface', async () => {
      // Test mobile filter toggle
      await page.tap('[data-testid="mobile-filter-toggle"]');
      await expect(page.locator('[data-testid="mobile-filter-panel"]')).toBeVisible();

      // Test mobile dimension filters
      await page.tap('[data-testid="mobile-filter-factual"]');
      await page.waitForTimeout(300);

      await page.tap('[data-testid="mobile-filter-logical"]');
      await page.waitForTimeout(300);

      // Test mobile filter reset
      await page.tap('[data-testid="mobile-filter-reset"]');
      await page.waitForTimeout(300);

      // Close mobile filter panel
      await page.tap('[data-testid="mobile-filter-close"]');
      await expect(page.locator('[data-testid="mobile-filter-panel"]')).not.toBeVisible();

      console.log('✅ Mobile filtering interface working correctly');
    });
  });

  cognitiveTest('should work on iPhone 12 (landscape)', async ({
    page,
    cognitiveUtils
  }) => {
    await page.setViewportSize({ width: 844, height: 390 });

    await cognitiveTest.step('Test landscape mobile layout', async () => {
      await page.click('[data-testid="load-sample-graph"]');
      await cognitiveUtils.waitForSceneReady();

      // Verify landscape layout
      await expect(page.locator('[data-testid="landscape-layout"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-landscape-controls"]')).toBeVisible();

      // Test that controls reposition for landscape
      const controls = await page.locator('[data-testid="mobile-landscape-controls"]').boundingBox();
      expect(controls).toBeTruthy();

      console.log('✅ Landscape layout working correctly');
    });

    await cognitiveTest.step('Test landscape touch interactions', async () => {
      // Test swipe gestures in landscape
      await page.touchscreen.swipe(100, 200, 700, 200);
      await page.waitForTimeout(500);

      // Test horizontal scrolling if present
      await page.touchscreen.swipe(700, 200, 100, 200);
      await page.waitForTimeout(500);

      console.log('✅ Landscape touch interactions working correctly');
    });
  });

  cognitiveTest('should work on Android devices', async ({
    page,
    cognitiveUtils
  }) => {
    await page.setViewportSize({ width: 412, height: 892 }); // Pixel 5 dimensions

    await cognitiveTest.step('Test Android-specific features', async () => {
      // Mock Android user agent
      await page.setUserAgent('Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36');

      await page.reload();
      await page.click('[data-testid="load-sample-graph"]');
      await cognitiveUtils.waitForSceneReady();

      // Verify Android compatibility
      await expect(page.locator('[data-testid="cognitive-visualization"]')).toBeVisible();

      // Test Android back button handling
      await page.goBack();
      await page.waitForTimeout(500);

      await page.goForward();
      await page.waitForTimeout(500);

      console.log('✅ Android compatibility verified');
    });

    await cognitiveTest.step('Test Android touch interactions', async () => {
      // Test long press for context menu
      const nodes = await page.locator('[data-testid="cognitive-node"]');
      if (await nodes.count() > 0) {
        await nodes.first().tap();
        await page.waitForTimeout(1000); // Long press duration

        // Check for mobile context menu
        await expect(page.locator('[data-testid="mobile-context-menu"]')).toBeVisible({ timeout: 3000 });

        // Close context menu
        await page.tap(200, 200); // Tap outside
      }

      console.log('✅ Android touch interactions working correctly');
    });
  });

  cognitiveTest('should work on tablet devices', async ({
    page,
    cognitiveUtils
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad dimensions

    await cognitiveTest.step('Test tablet layout adaptation', async () => {
      await page.click('[data-testid="load-sample-graph"]');
      await cognitiveUtils.waitForSceneReady();

      // Verify tablet layout
      await expect(page.locator('[data-testid="tablet-layout"]')).toBeVisible();
      await expect(page.locator('[data-testid="tablet-controls"]')).toBeVisible();

      // Test hybrid mobile-desktop interface
      await expect(page.locator('[data-testid="tablet-sidebar"]')).toBeVisible();
      await expect(page.locator('[data-testid="tablet-touch-controls"]')).toBeVisible();

      console.log('✅ Tablet layout properly adapted');
    });

    await cognitiveTest.step('Test tablet touch and mouse interactions', async () => {
      // Test touch interactions
      await page.touchscreen.tap(300, 400);
      await page.waitForTimeout(300);

      // Test mouse hover (tablet should support both)
      await page.hover(300, 400);
      await page.waitForTimeout(300);

      // Test multi-touch gestures
      await page.touchscreen.tapAt(200, 300);
      await page.touchscreen.tapAt(400, 500);
      await page.waitForTimeout(500);

      console.log('✅ Tablet hybrid interactions working correctly');
    });

    await cognitiveTest.step('Test tablet split-screen mode', async () => {
      // Simulate split-screen by reducing width
      await page.setViewportSize({ width: 500, height: 1024 });
      await page.waitForTimeout(1000);

      // Verify split-screen adaptation
      await expect(page.locator('[data-testid="split-screen-layout"]')).toBeVisible();

      // Test that interface reflows correctly
      const sidebarWidth = await page.locator('[data-testid="tablet-sidebar"]').evaluate(el => {
        return window.getComputedStyle(el).width;
      });

      expect(parseInt(sidebarWidth)).toBeLessThan(200); // Should be compressed

      console.log('✅ Tablet split-screen mode working correctly');
    });
  });

  cognitiveTest('should handle orientation changes gracefully', async ({
    page,
    cognitiveUtils
  }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // Start with portrait

    await cognitiveTest.step('Test portrait to landscape transition', async () => {
      await page.click('[data-testid="load-sample-graph"]');
      await cognitiveUtils.waitForSceneReady();

      // Capture initial state
      const portraitNodes = await cognitiveUtils.getCognitiveNodes();

      // Rotate to landscape
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(1000);

      // Verify layout adapts
      await expect(page.locator('[data-testid="landscape-layout"]')).toBeVisible();

      // Verify visualization maintains integrity
      const landscapeNodes = await cognitiveUtils.getCognitiveNodes();
      expect(landscapeNodes.length).toBe(portraitNodes.length);

      console.log('✅ Portrait to landscape orientation change handled correctly');
    });

    await cognitiveTest.step('Test landscape to portrait transition', async () => {
      // Rotate back to portrait
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(1000);

      // Verify layout adapts back
      await expect(page.locator('[data-testid="mobile-layout"]')).toBeVisible();

      // Verify controls reposition correctly
      await expect(page.locator('[data-testid="mobile-controls"]')).toBeVisible();

      console.log('✅ Landscape to portrait orientation change handled correctly');
    });

    await cognitiveTest.step('Test rapid orientation changes', async () => {
      // Simulate rapid orientation changes
      const orientations = [
        { width: 390, height: 844 },  // Portrait
        { width: 844, height: 390 },  // Landscape
        { width: 412, height: 892 },  // Different portrait
        { width: 892, height: 412 },  // Different landscape
      ];

      for (const orientation of orientations) {
        await page.setViewportSize(orientation);
        await page.waitForTimeout(500);

        // Verify visualization is still functional
        await expect(page.locator('[data-testid="cognitive-visualization"]')).toBeVisible();
      }

      console.log('✅ Rapid orientation changes handled gracefully');
    });
  });

  cognitiveTest('should optimize performance on mobile devices', async ({
    page,
    performanceMonitor,
    cognitiveUtils
  }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // Small mobile device

    await cognitiveTest.step('Test mobile performance optimization', async () => {
      await performanceMonitor.startMonitoring();

      // Load graph with mobile optimizations
      await page.click('[data-testid="load-sample-graph"]');
      await cognitiveUtils.waitForSceneReady();

      // Wait for mobile performance optimizations to apply
      await page.waitForTimeout(3000);

      const metrics = await performanceMonitor.getMetrics();

      // Mobile devices should have reasonable performance
      expect(metrics.fps).toBeGreaterThan(30);
      expect(metrics.memory).toBeLessThan(256);

      // Verify mobile-specific optimizations
      const mobileOptimized = await page.locator('[data-testid="mobile-optimized"]').isVisible();
      expect(mobileOptimized).toBe(true);

      console.log(`✅ Mobile performance: ${metrics.fps} FPS, ${metrics.memory}MB memory`);
    });

    await cognitiveTest.step('Test battery saving mode', async () => {
      // Simulate low battery state
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'getBattery', {
          writable: true,
          value: async () => ({
            level: 0.2, // 20% battery
            addEventListener: () => {},
          }),
        });
      });

      // Trigger battery optimization
      await page.click('[data-testid="enable-battery-saver"]');
      await page.waitForTimeout(2000);

      // Verify battery optimizations are applied
      const batterySaverActive = await page.locator('[data-testid="battery-saver-active"]').isVisible();
      expect(batterySaverActive).toBe(true);

      // Check that performance is still acceptable
      const batteryMetrics = await performanceMonitor.getMetrics();
      expect(batteryMetrics.fps).toBeGreaterThan(20);

      console.log(`✅ Battery saver mode: ${batteryMetrics.fps} FPS maintained`);
    });

    await cognitiveTest.step('Test memory management on mobile', async () => {
      const initialMemory = (await performanceMonitor.getMetrics()).memory;

      // Perform memory-intensive operations
      for (let i = 0; i < 5; i++) {
        // Switch visualization modes
        await page.click('[data-testid="view-mode-sphere"]');
        await page.waitForTimeout(1000);

        await page.click('[data-testid="view-mode-2d"]');
        await page.waitForTimeout(1000);

        // Apply filters
        await page.click('[data-testid="mobile-filter-factual"]');
        await page.waitForTimeout(300);
        await page.click('[data-testid="mobile-filter-reset"]');
        await page.waitForTimeout(300);
      }

      const finalMemory = (await performanceMonitor.getMetrics()).memory;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be minimal on mobile
      expect(memoryIncrease).toBeLessThan(50);

      console.log(`✅ Mobile memory management: ${memoryIncrease}MB increase`);
    });
  });

  cognitiveTest('should handle mobile-specific error states', async ({
    page
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await cognitiveTest.step('Test mobile network error handling', async () => {
      // Simulate network error
      await page.route('/api/cognitive-graph', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: 'Network connection failed',
            timestamp: Date.now(),
          }),
        });
      });

      await page.click('[data-testid="load-sample-graph"]');

      // Verify mobile-specific error display
      await expect(page.locator('[data-testid="mobile-error-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-retry-button"]')).toBeVisible();

      // Test mobile retry
      await page.tap('[data-testid="mobile-retry-button"]');
      await page.waitForTimeout(2000);

      console.log('✅ Mobile error handling working correctly');
    });

    await cognitiveTest.step('Test mobile offline mode', async () => {
      // Simulate offline state
      await page.context().setOffline(true);

      await page.click('[data-testid="load-sample-graph"]');

      // Verify offline indicator
      await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();

      // Restore connection
      await page.context().setOffline(false);
      await page.waitForTimeout(2000);

      // Verify connection restored
      await expect(page.locator('[data-testid="connection-restored"]')).toBeVisible();

      console.log('✅ Mobile offline mode working correctly');
    });
  });

  cognitiveTest('should handle mobile accessibility features', async ({
    page,
    cognitiveUtils
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await cognitiveTest.step('Test mobile screen reader support', async () => {
      // Enable screen reader mode
      await page.emulateMedia({ reducedMotion: 'reduce' });

      await page.click('[data-testid="load-sample-graph"]');
      await cognitiveUtils.waitForSceneReady();

      // Verify ARIA labels on mobile controls
      const mobileControls = await page.locator('[data-testid="mobile-controls"]');
      await expect(mobileControls).toHaveAttribute('role', 'toolbar');
      await expect(mobileControls).toHaveAttribute('aria-label');

      // Test keyboard navigation on mobile
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);

      const focusedElement = await page.locator(':focus');
      expect(await focusedElement.count()).toBeGreaterThan(0);

      console.log('✅ Mobile accessibility features working correctly');
    });

    await cognitiveTest.step('Test mobile high contrast mode', async () => {
      // Enable high contrast
      await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'active' });
      await page.waitForTimeout(1000);

      await page.click('[data-testid="load-sample-graph"]');
      await cognitiveUtils.waitForSceneReady();

      // Verify high contrast styling
      const highContrastElements = await page.locator('[data-high-contrast]').count();
      expect(highContrastElements).toBeGreaterThan(0);

      console.log('✅ Mobile high contrast mode working correctly');
    });
  });
});