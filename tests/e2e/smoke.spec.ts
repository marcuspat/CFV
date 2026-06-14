import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('health endpoint returns 200', async ({ request }) => {
    const response = await request.get('http://localhost:3000/health');
    expect(response.status()).toBe(200);
  });

  test('API root is reachable', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api');
    // 200 or 404 both indicate the server is alive
    expect([200, 404]).toContain(response.status());
  });
});
