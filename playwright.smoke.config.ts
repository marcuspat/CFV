import { defineConfig, devices } from '@playwright/test';

/**
 * Minimal smoke-test config for the CI pipeline (test:ci).
 *
 * Unlike the full playwright.config.ts (5 browsers, frontend baseURL), this:
 *  - runs only tests/e2e/smoke.spec.ts
 *  - targets the backend API directly on :3001
 *  - boots only the backend (one-shot tsx, no watch) with a CI JWT secret
 *  - uses Chromium only (the only browser installed in this environment)
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'smoke.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  webServer: {
    command: 'npx tsx src/server/index.ts',
    url: 'http://localhost:3001/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NODE_ENV: 'development',
      PORT: '3001',
      MONITORING_ENABLED: 'false',
      JWT_SECRET: 'ci-smoke-jwt-secret-at-least-32-characters-long',
    },
  },
});
