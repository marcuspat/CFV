import { chromium, FullConfig } from '@playwright/test';
import path from 'path';

/**
 * Global setup for Playwright testing
 * Initializes test environment and prepares performance monitoring
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 Setting up Cognitive Fabric Visualizer E2E Tests...');

  // Performance monitoring setup
  const performanceDir = path.join(process.cwd(), 'test-results', 'performance');
  if (!require('fs').existsSync(performanceDir)) {
    require('fs').mkdirSync(performanceDir, { recursive: true });
  }

  // Setup performance baseline
  const baselinePath = path.join(performanceDir, 'baseline.json');
  if (!require('fs').existsSync(baselinePath)) {
    const baseline = {
      fps: { target: 240, minimum: 120, acceptable: 180 },
      memory: { maximum: 512, warning: 256 },
      loadTime: { target: 2000, maximum: 5000 },
      interaction: { responseTime: 100, animationFrame: 16.67 },
    };
    require('fs').writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
  }

  // Launch browser for setup tasks
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Wait for application to be ready
    await page.goto(config.webServer?.url || 'http://localhost:3000');

    // Wait for WebGL context
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas');
      return canvas && canvas.getContext('webgl2');
    }, { timeout: 30000 });

    // Warm up GPU drivers
    await page.evaluate(() => {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl2');
      if (gl) {
        // Simple WebGL operations to warm up GPU
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    });

    console.log('✅ Performance monitoring initialized');
    console.log('✅ WebGL context verified');
    console.log('✅ GPU warmed up');

  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }

  console.log('🎯 Cognitive Fabric Visualizer E2E Tests Ready!');
}

export default globalSetup;