import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('health endpoint returns 200 with healthy status', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.version).toBe('1.0.0');
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(body.timestamp).toBeTruthy();
  });

  test('health/live liveness probe returns alive', async ({ request }) => {
    const response = await request.get('/health/live');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('alive');
    expect(body.timestamp).toBeTruthy();
  });

  test('API root is reachable', async ({ request }) => {
    const response = await request.get('/api');
    // 200 or 404 both indicate the server is alive
    expect([200, 404]).toContain(response.status());
  });
});
