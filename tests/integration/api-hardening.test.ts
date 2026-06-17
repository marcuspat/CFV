/**
 * Integration tests for production-hardening middleware:
 *   - Zod input validation -> 400 + structured error
 *   - express-rate-limit on /api/analysis -> 429 after 10 req / window
 *
 * Drives the real Express application (App) via supertest, so the assertions
 * cover the production wiring (validation schemas + the analysis rate limiter
 * mounted in app.ts), not a re-declared test harness.
 *
 * Run with:  npx jest --config jest.config.integration.cjs
 */

// These must be set before the server config module is (dynamically) imported —
// config/index.ts requires JWT_SECRET (>= 32 chars) at load time.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-characters-long-xyz';
process.env.MONITORING_ENABLED = 'false';
// Ensure no real AI provider is contacted during the rate-limit flood.
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

import request from 'supertest';
import type { Application } from 'express';

async function buildApp(): Promise<Application> {
  const App = (await import('../../src/server/app')).default;
  const instance = new App();
  // Routes are mounted in the private async initializeRoutes(); invoke it
  // directly so we can drive the app with supertest without binding a port.
  await (instance as unknown as { initializeRoutes: () => Promise<void> }).initializeRoutes();
  return instance.app;
}

describe('API hardening — Zod input validation', () => {
  let app: Application;

  beforeAll(async () => {
    app = await buildApp();
  });

  it('rejects an empty/invalid conversation payload with 400 + structured issues', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .send({ title: '', transcript: [] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.details?.issues)).toBe(true);
    expect(res.body.details.issues.length).toBeGreaterThan(0);
    expect(res.body.details.issues[0]).toHaveProperty('path');
    expect(res.body.details.issues[0]).toHaveProperty('message');
  });

  it('rejects a conversation payload with the wrong transcript type', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .send({ title: 'ok', transcript: 'not-an-array' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a well-formed conversation payload (201)', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .send({ title: 'Valid title', transcript: ['hello world'] });

    expect(res.status).toBe(201);
    expect(res.body.conversationId).toBeDefined();
  });

  it('rejects an analysis-start payload missing conversationId with 400', async () => {
    const res = await request(app)
      .post('/api/analysis/start')
      .send({ conversationText: 'some text but no conversationId' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(
      res.body.details.issues.some((i: { path: string }) => i.path === 'conversationId')
    ).toBe(true);
  });
});

describe('API hardening — rate limiting on /api/analysis', () => {
  it('allows 10 requests per window then returns 429 on the 11th', async () => {
    // Fresh app -> fresh limiter counters.
    const app = await buildApp();
    const statuses: number[] = [];

    for (let i = 0; i < 11; i++) {
      // Invalid body keeps each request cheap (400 from validation) while still
      // counting against the limiter, which runs before the route handler.
      const res = await request(app).post('/api/analysis/start').send({});
      statuses.push(res.status);
    }

    // First 10 pass the limiter (and get 400 from validation); none are 429.
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
    // The 11th request is blocked by the 10-per-window analysis limiter.
    expect(statuses[10]).toBe(429);
  });
});
