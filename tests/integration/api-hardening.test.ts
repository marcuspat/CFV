/**
 * Integration tests for production-hardening + authentication middleware:
 *   - JWT auth: register / login / refresh, protected routes reject no token
 *   - Zod input validation -> 400 + structured error
 *   - express-rate-limit on /api/analysis -> 429 after 10 req/window
 *
 * Drives the real Express application (App) via supertest, so the assertions
 * cover the production wiring. The user store falls back to in-memory when no
 * database is connected (as here), so auth works without Postgres.
 *
 * Run with:  npx jest --config jest.config.integration.cjs
 */

// Must be set before the server config module is (dynamically) imported —
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

// A valid access token shared by the protected-route tests below. The in-memory
// user store is module-global, and every app instance verifies tokens with the
// same JWT_SECRET, so one registration is reusable across app instances.
let authToken: string;
const bearer = () => `Bearer ${authToken}`;

beforeAll(async () => {
  const app = await buildApp();
  const res = await request(app).post('/api/auth/register').send({
    email: 'itest@example.com',
    password: 'password123',
    username: 'itest_user',
    fullName: 'Integration Test',
  });
  authToken = res.body.token;
});

describe('Authentication (JWT + bcrypt)', () => {
  let app: Application;
  const creds = {
    email: 'authflow@example.com',
    password: 'password123',
    username: 'authflow_user',
    fullName: 'Auth Flow',
  };

  beforeAll(async () => {
    app = await buildApp();
  });

  it('registers a new user -> 201 with tokens and no password hash', async () => {
    const res = await request(app).post('/api/auth/register').send(creds);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.email).toBe(creds.email);
    expect(res.body.user.role).toBe('viewer');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects duplicate registration -> 400', async () => {
    const res = await request(app).post('/api/auth/register').send(creds);
    expect(res.status).toBe(400);
  });

  it('rejects a too-short password at registration -> 400', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'shortpw@example.com',
      password: 'short',
      username: 'shortpw_user',
      fullName: 'Short PW',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('logs in with correct credentials -> 200 with a token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: creds.password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('rejects login with a wrong password -> 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects a protected route with no token -> 401', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .send({ title: 'x', transcript: ['y'] });
    expect(res.status).toBe(401);
  });

  it('refreshes tokens with a valid refresh token -> 200', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: creds.password });
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('rejects refresh with a garbage token -> 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });

  it('revokes the refresh token on logout; reuse returns 401', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: creds.password });
    const rt = login.body.refreshToken as string;

    // Valid before logout.
    const before = await request(app).post('/api/auth/refresh').send({ refreshToken: rt });
    expect(before.status).toBe(200);

    // Logout revokes this refresh token.
    const out = await request(app).post('/api/auth/logout').send({ refreshToken: rt });
    expect(out.status).toBe(200);

    // Reuse after revocation is rejected.
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: rt });
    expect(reuse.status).toBe(401);
  });

  it('blocklists the access token on logout; access-token reuse returns 401', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: creds.email, password: creds.password });
    const accessToken = login.body.token as string;
    const refreshToken = login.body.refreshToken as string;

    // The access token works on a protected route before logout.
    const before = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(before.status).toBe(200);

    // Logout presents the access token (Authorization) + refresh token (body).
    const out = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(out.status).toBe(200);

    // Reusing the now-blocklisted access token is rejected.
    const after = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(401);
  });

  it('persists the refresh token as an httpOnly cookie; cookie-based logout revokes it', async () => {
    const agent = request.agent(app);

    const login = await agent
      .post('/api/auth/login')
      .send({ email: creds.email, password: creds.password });
    expect(login.status).toBe(200);

    const setCookie = (login.headers['set-cookie'] as unknown as string[]) ?? [];
    const cookieStr = setCookie.join(';');
    expect(cookieStr).toMatch(/refresh_token=/);
    expect(cookieStr.toLowerCase()).toContain('httponly');

    // Refresh using only the cookie (empty body).
    const refreshed = await agent.post('/api/auth/refresh').send({});
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.token).toBeTruthy();

    // Logout via the cookie revokes the token and clears the cookie.
    const out = await agent.post('/api/auth/logout').send({});
    expect(out.status).toBe(200);

    // The cookie is now cleared, so a cookie-only refresh is rejected.
    const reuse = await agent.post('/api/auth/refresh').send({});
    expect(reuse.status).toBe(401);
  });
});

describe('API hardening — Zod input validation', () => {
  let app: Application;

  beforeAll(async () => {
    app = await buildApp();
  });

  it('rejects an empty/invalid conversation payload with 400 + structured issues', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', bearer())
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
      .set('Authorization', bearer())
      .send({ title: 'ok', transcript: 'not-an-array' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('accepts a well-formed conversation payload (201)', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', bearer())
      .send({ title: 'Valid title', transcript: ['hello world'] });

    expect(res.status).toBe(201);
    expect(res.body.conversationId).toBeDefined();
  });

  it('rejects an analysis-start payload missing conversationId with 400', async () => {
    const res = await request(app)
      .post('/api/analysis/start')
      .set('Authorization', bearer())
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
      // counting against the limiter, which runs after auth but before the route.
      const res = await request(app)
        .post('/api/analysis/start')
        .set('Authorization', bearer())
        .send({});
      statuses.push(res.status);
    }

    // First 10 pass the limiter (and get 400 from validation); none are 429.
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
    // The 11th request is blocked by the 10-per-window analysis limiter.
    expect(statuses[10]).toBe(429);
  });
});

describe('Conversation persistence', () => {
  let app: Application;

  beforeAll(async () => {
    app = await buildApp();
  });

  it('creates, retrieves, and lists a conversation (transcript round-trips)', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .set('Authorization', bearer())
      .send({ title: 'Persisted convo', transcript: ['line one', 'line two'], metadata: { domain: 'testing' } });
    expect(create.status).toBe(201);
    const id = create.body.conversationId as string;
    expect(id).toBeTruthy();

    const got = await request(app)
      .get(`/api/conversations/${id}`)
      .set('Authorization', bearer());
    expect(got.status).toBe(200);
    expect(got.body.conversation.title).toBe('Persisted convo');
    expect(got.body.conversation.transcript).toEqual(['line one', 'line two']);
    expect(got.body.conversation.metadata.domain).toBe('testing');

    const listed = await request(app).get('/api/conversations').set('Authorization', bearer());
    expect(listed.status).toBe(200);
    expect(listed.body.total).toBeGreaterThanOrEqual(1);
    expect(
      (listed.body.conversations as Array<{ id: string }>).some((c) => c.id === id)
    ).toBe(true);
  });

  it('returns 404 for an unknown conversation id', async () => {
    const got = await request(app)
      .get('/api/conversations/00000000-0000-0000-0000-000000000000')
      .set('Authorization', bearer());
    expect(got.status).toBe(404);
  });
});

describe('Request ID middleware', () => {
  let app: Application;

  beforeAll(async () => {
    app = await buildApp();
  });

  it('generates and echoes an X-Request-Id when none is provided', async () => {
    const res = await request(app).get('/api/conversations').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeTruthy();
    // uuid v4 shape
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('echoes back a caller-provided X-Request-Id', async () => {
    const res = await request(app)
      .get('/api/conversations')
      .set('Authorization', bearer())
      .set('X-Request-Id', 'trace-abc-123');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe('trace-abc-123');
  });
});
