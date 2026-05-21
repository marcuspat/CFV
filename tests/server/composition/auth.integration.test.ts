/**
 * End-to-end integration test for PostgreSQL-backed authentication: the real
 * auth router + authMiddleware wired to the Identity composition root, over
 * HTTP via supertest, against a live database.
 *
 * Gated behind RUN_DB_TESTS=1. Run with:
 *   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://postgres@localhost:5433/cfv_test \
 *     npx jest tests/server/composition
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { buildIdentityModule, type IdentityModule } from '../../../src/server/composition/identity';
import { createAuthRouter } from '../../../src/server/routes/auth';
import { authMiddleware, type AuthenticatedRequest } from '../../../src/server/middleware/auth';
import { errorHandler } from '../../../src/server/middleware/errorHandler';

const RUN = process.env.RUN_DB_TESTS === '1';
const DSN = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/cfv_test';

(RUN ? describe : describe.skip)('Auth HTTP flow (integration)', () => {
  let app: express.Express;
  let identity: IdentityModule;
  let pool: Pool;
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'correct-horse-battery-staple';

  beforeAll(async () => {
    pool = new Pool({ connectionString: DSN });
    const ddl = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
    await pool.query(ddl('src/server/shared/outbox/ddl/0001_domain_event_outbox.sql'));
    await pool.query(ddl('src/server/contexts/identity/infrastructure/ddl/0001_identity.sql'));

    identity = buildIdentityModule({ pool });
    await identity.ensureDefaultTenant();

    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(identity));
    app.get('/api/protected', authMiddleware, (req, res) => {
      res.json({ ok: true, auth: (req as AuthenticatedRequest).auth });
    });
    app.use(errorHandler);
  });

  afterAll(async () => {
    await identity.close();
  });

  it('rejects registration with a weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `weak-${Date.now()}@example.com`, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('password');
  });

  it('registers a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password, roles: ['analyst'] });
    expect(res.status).toBe(201);
    expect(typeof res.body.userId).toBe('string');
  });

  it('rejects a duplicate registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password });
    expect(res.status).toBe(409);
  });

  it('rejects login with the wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('logs in and returns tokens', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('rejects a protected route without a token', async () => {
    const res = await request(app).get('/api/protected');
    expect(res.status).toBe(401);
  });

  it('allows a protected route with a valid token and exposes the principal', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password });
    const res = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.auth.roles).toContain('analyst');
    expect(typeof res.body.auth.userId).toBe('string');
  });

  it('rotates a refresh token exactly once (one-shot)', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password });
    const { refreshToken } = login.body;

    const first = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    expect(typeof first.body.accessToken).toBe('string');

    const replay = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(replay.status).toBe(401);
  });

  it('returns the principal from /me', async () => {
    const login = await request(app).post('/api/auth/login').send({ email, password });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.roles).toContain('analyst');
  });
});
