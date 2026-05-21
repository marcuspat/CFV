/**
 * HTTP integration test for PostgreSQL-backed conversation ingestion: the
 * real conversations router behind authMiddleware, wired to the Conversation
 * Ingestion composition root, over supertest against a live database.
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
import { createAuthRouter } from '../../../src/server/routes/auth';
import { createConversationsRouter } from '../../../src/server/routes/conversations';
import { authMiddleware } from '../../../src/server/middleware/auth';
import { errorHandler } from '../../../src/server/middleware/errorHandler';

const RUN = process.env.RUN_DB_TESTS === '1';
const DSN = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/cfv_test';

(RUN ? describe : describe.skip)('Conversations HTTP flow (integration)', () => {
  let app: express.Express;
  let identity: IdentityModule;
  let pool: Pool;
  let token: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DSN });
    const ddl = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
    await pool.query(ddl('src/server/shared/outbox/ddl/0001_domain_event_outbox.sql'));
    await pool.query(ddl('src/server/contexts/identity/infrastructure/ddl/0001_identity.sql'));
    await pool.query(ddl('src/server/contexts/conversation-ingestion/infrastructure/ddl/0001_conversation_ingestion.sql'));

    identity = buildIdentityModule({ pool });
    await identity.ensureDefaultTenant();
    const conversationModule = buildConversationModule({ pool });

    app = express();
    app.use(express.json());
    app.use('/api/auth', createAuthRouter(identity));
    app.use('/api/conversations', authMiddleware, createConversationsRouter(conversationModule));
    app.use(errorHandler);

    const email = `conv-${Date.now()}@example.com`;
    const password = 'correct-horse-battery-staple';
    await request(app).post('/api/auth/register').send({ email, password, roles: ['analyst'] });
    const login = await request(app).post('/api/auth/login').send({ email, password });
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await identity.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/conversations');
    expect(res.status).toBe(401);
  });

  it('ingests a conversation from a transcript', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .set(auth())
      .send({ title: 'Standup', transcript: ['Hello team', 'What is the status?', 'On track'] });
    expect(res.status).toBe(201);
    expect(typeof res.body.conversationId).toBe('string');
  });

  it('round-trips a conversation with structured turns', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .set(auth())
      .send({
        title: 'Interview',
        turns: [
          { speaker: 'alice', text: 'Tell me about yourself' },
          { speaker: 'bob', text: 'I build systems' },
        ],
      });
    expect(create.status).toBe(201);
    const id = create.body.conversationId;

    const get = await request(app).get(`/api/conversations/${id}`).set(auth());
    expect(get.status).toBe(200);
    expect(get.body.conversation.turns).toHaveLength(2);
    expect(get.body.conversation.turns[0].text).toBe('Tell me about yourself');
    // Distinct speakers map to distinct ULID speaker ids.
    expect(get.body.conversation.turns[0].speakerId).not.toBe(get.body.conversation.turns[1].speakerId);
  });

  it('lists conversations for the tenant', async () => {
    const res = await request(app).get('/api/conversations?limit=50').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.conversations)).toBe(true);
    expect(res.body.conversations.length).toBeGreaterThan(0);
  });

  it('soft-deletes a conversation', async () => {
    const create = await request(app)
      .post('/api/conversations')
      .set(auth())
      .send({ transcript: ['ephemeral'] });
    const id = create.body.conversationId;

    const del = await request(app).delete(`/api/conversations/${id}`).set(auth());
    expect(del.status).toBe(204);

    const get = await request(app).get(`/api/conversations/${id}`).set(auth());
    expect(get.status).toBe(200);
    expect(get.body.conversation.status).toBe('DELETED');
  });

  it('rejects an invalid conversation id', async () => {
    const res = await request(app).get('/api/conversations/not-a-ulid').set(auth());
    expect(res.status).toBe(400);
  });
});
