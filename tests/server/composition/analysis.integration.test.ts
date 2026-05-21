/**
 * HTTP integration test for the cognitive-analysis pipeline: register →
 * ingest a conversation → run the ExecuteAnalysisSaga via the analysis route,
 * over supertest against a live database. The ensemble is the heuristic
 * stand-in, but the saga/fusion/calibration/symbolic logic is real.
 *
 * Gated behind RUN_DB_TESTS=1.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { buildIdentityModule, type IdentityModule } from '../../../src/server/composition/identity';
import { buildConversationModule } from '../../../src/server/composition/conversation-ingestion';
import { buildAnalysisModule } from '../../../src/server/composition/cognitive-analysis';
import { createAuthRouter } from '../../../src/server/routes/auth';
import { createConversationsRouter } from '../../../src/server/routes/conversations';
import { createAnalysisRouter } from '../../../src/server/routes/analysis';
import { authMiddleware } from '../../../src/server/middleware/auth';
import { errorHandler } from '../../../src/server/middleware/errorHandler';

const RUN = process.env.RUN_DB_TESTS === '1';
const DSN = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/cfv_test';

(RUN ? describe : describe.skip)('Analysis HTTP flow (integration)', () => {
  let app: express.Express;
  let identity: IdentityModule;
  let pool: Pool;
  let token: string;
  let conversationId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DSN });
    const ddl = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
    await pool.query(ddl('src/server/shared/outbox/ddl/0001_domain_event_outbox.sql'));
    await pool.query(ddl('src/server/contexts/identity/infrastructure/ddl/0001_identity.sql'));
    await pool.query(ddl('src/server/contexts/conversation-ingestion/infrastructure/ddl/0001_conversation_ingestion.sql'));
    await pool.query(ddl('src/server/contexts/cognitive-analysis/infrastructure/ddl/0001_cognitive_analysis.sql'));

    identity = buildIdentityModule({ pool });
    await identity.ensureDefaultTenant();

    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(identity));
    app.use('/api/conversations', authMiddleware, createConversationsRouter(buildConversationModule({ pool })));
    app.use('/api/analysis', authMiddleware, createAnalysisRouter(buildAnalysisModule({ pool })));
    app.use(errorHandler);

    const email = `analysis-${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';
    await request(app).post('/api/auth/register').send({ email, password, roles: ['analyst'] });
    token = (await request(app).post('/api/auth/login').send({ email, password })).body.accessToken;

    const conv = await request(app)
      .post('/api/conversations')
      .set({ Authorization: `Bearer ${token}` })
      .send({ title: 'Design review', transcript: ['We should cache the results', 'Why? Because latency matters', 'Agreed, lets prototype'] });
    conversationId = conv.body.conversationId;
  });

  afterAll(async () => {
    await identity.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('rejects unauthenticated analysis', async () => {
    const res = await request(app).post('/api/analysis/start').send({ conversationId });
    expect(res.status).toBe(401);
  });

  it('runs the analysis saga and returns real computed elements', async () => {
    const res = await request(app).post('/api/analysis/start').set(auth()).send({ conversationId });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.elementCount).toBeGreaterThan(0);
    expect(res.body.degraded).toBe(false);
  });

  it('exposes status and result for the analysis', async () => {
    const start = await request(app).post('/api/analysis/start').set(auth()).send({ conversationId });
    const id = start.body.analysisId;

    const status = await request(app).get(`/api/analysis/${id}/status`).set(auth());
    expect(status.status).toBe(200);
    expect(status.body.status).toBe('COMPLETED');

    const result = await request(app).get(`/api/analysis/${id}/result`).set(auth());
    expect(result.status).toBe(200);
    expect(result.body.elementCount).toBeGreaterThan(0);
    expect(result.body.bundleVersion).toBe('heuristic-0.1.0');
    expect(result.body.stages.map((s: { name: string }) => s.name)).toContain('DECOMPOSE');
  });

  it('is idempotent for the same conversation + parameters', async () => {
    const first = await request(app).post('/api/analysis/start').set(auth()).send({ conversationId });
    const second = await request(app).post('/api/analysis/start').set(auth()).send({ conversationId });
    expect(second.status).toBe(201);
    expect(second.body.analysisId).toBe(first.body.analysisId);
  });

  it('404s analysis for an unknown conversation', async () => {
    const res = await request(app)
      .post('/api/analysis/start')
      .set(auth())
      .send({ conversationId: '01HJK3R6X7Y8ZAB2C3D4E5F6Z9' });
    expect(res.status).toBe(404);
  });
});
