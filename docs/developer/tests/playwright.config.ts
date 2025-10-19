import { defineConfig, devices, expect } from '@playwright/test';
import path from 'path';

/**
 * Comprehensive Playwright E2E Testing Configuration for Cognitive Fabric Visualizer
 *
 * Features:
 * - Multi-browser testing (Chrome, Firefox, Safari, Edge)
 * - Performance monitoring with FPS validation
 * - Visual regression testing
 * - Mobile responsive testing
 * - Memory leak detection
 * - Real-time interaction testing
 */
export default defineConfig({
  testDir: path.join(__dirname, 'e2e'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'test-results-junit.xml' }],
    ['list'],
    // Custom performance reporter
    [path.join(__dirname, 'helpers', 'performance-reporter.ts')],
  ],
  use: {
    /* Base configuration */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    /* Performance monitoring */
    launchOptions: {
      args: [
        '--enable-gpu-rasterization',
        '--enable-zero-copy',
        '--enable-webgl2-compute-context',
        '--enable-features=Vulkan',
        '--use-vulkan=native',
        '--enable-oop-rasterization',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--force-color-profile=srgb',
        '--disable-extensions',
        '--no-default-browser-check',
        '--disable-logging',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    },

    /* Viewport and device configuration */
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
    acceptDownloads: true,

    /* Performance thresholds */
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  /* Projects for different browsers and devices */
  projects: [
    /* Desktop browsers - primary testing */
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            ...['--enable-gpu-rasterization', '--enable-webgl2-compute-context'],
            '--disable-dev-shm-usage',
            '--no-sandbox',
          ],
        },
      },
      testMatch: '**/desktop/**/*.spec.ts',
      dependencies: ['performance-setup'],
    },

    {
      name: 'firefox-desktop',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'webgl.force-enabled': true,
            'webgl.msaa-force': true,
            'gfx.offscreen-canvas.force-enabled': true,
          },
        },
      },
      testMatch: '**/desktop/**/*.spec.ts',
      dependencies: ['performance-setup'],
    },

    {
      name: 'webkit-desktop',
      use: {
        ...devices['Desktop Safari'],
        launchOptions: {
          args: [
            '--enable-webgl2',
            '--enable-gpu-rasterization',
          ],
        },
      },
      testMatch: '**/desktop/**/*.spec.ts',
      dependencies: ['performance-setup'],
    },

    /* Mobile responsive testing */
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        launchOptions: {
          args: ['--enable-gpu-rasterization'],
        },
      },
      testMatch: '**/mobile/**/*.spec.ts',
    },

    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 12'],
      },
      testMatch: '**/mobile/**/*.spec.ts',
    },

    /* Performance-focused testing */
    {
      name: 'performance-chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--enable-gpu-rasterization',
            '--enable-webgl2-compute-context',
            '--enable-features=UseSkiaRenderer',
            '--disable-background-timer-throttling',
            '--disable-field-trial-config',
            '--disable-features=Vulkan',
          ],
        },
      },
      testMatch: '**/performance/**/*.spec.ts',
      retries: 3, // Performance tests need more retries
    },

    /* Visual regression testing */
    {
      name: 'visual-regression',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
      },
      testMatch: '**/visual/**/*.spec.ts',
      dependencies: ['performance-setup'],
    },

    /* Setup project for global test initialization */
    {
      name: 'performance-setup',
      testMatch: '**/setup/**/*.spec.ts',
    },
  ],

  /* Global setup and teardown */
  globalSetup: path.join(__dirname, 'helpers', 'global-setup.ts'),
  globalTeardown: path.join(__dirname, 'helpers', 'global-teardown.ts'),

  /* Web server configuration */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },

  /* Output directory */
  outputDir: 'test-results',

  /* Expect configuration */
  expect: {
    /* Timeout for expect assertions */
    timeout: 5000,

    /* Screenshot comparison options */
    toHaveScreenshot: {
      mode: 'auto',
      animations: 'disabled',
      caret: 'hide',
    },

    /* Visual regression comparison */
    toMatchSnapshot: {
      maxDiffPixels: 100,
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
    },
  },

  /* Metadata for test organization */
  metadata: {
    'Test Environment': process.env.NODE_ENV || 'test',
    'Browser Version': 'auto-detected',
    'Test Suite': 'Cognitive Fabric Visualizer E2E',
    'Performance Target': '240 FPS',
    'Memory Limit': '512MB',
  },
});