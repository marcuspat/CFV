/**
 * Basic E2E tests using Playwright
 */

import { test, expect } from '@playwright/test';

test.describe('Cognitive Fabric Visualizer - Basic E2E', () => {
  test('should load the application', async ({ page }) => {
    // Navigate to the application (assuming it's running)
    await page.goto('http://localhost:3000');

    // Check if page loads without errors
    await expect(page).toHaveTitle(/Cognitive Fabric Visualizer/);
  });

  test('should handle responsive design', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Test desktop viewport
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(1000);

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
  });

  test('should handle JavaScript errors gracefully', async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);

    // Expect no critical JavaScript errors
    expect(errors.filter(e => e.includes('TypeError') || e.includes('ReferenceError'))).toHaveLength(0);
  });
});