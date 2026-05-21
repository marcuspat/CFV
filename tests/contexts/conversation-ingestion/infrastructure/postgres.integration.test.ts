/**
 * Integration tests for the Conversation Ingestion PostgreSQL adapters +
 * transactional outbox. Exercises real SQL against a live database.
 *
 * Gated behind RUN_DB_TESTS=1 so the default unit run (and CI without a
 * database) skips it. Run with:
 *   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://postgres@localhost:5433/cfv_test \
 *     npx jest tests/contexts/conversation-ingestion/infrastructure
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import {
  closePool,
  configurePool,
  withTransaction,
} from '../../../../src/server/contexts/../shared/db/pool';
import {
  PostgresAnalysisSessionRepository,
  PostgresConversationRepository,
} from '../../../../src/server/contexts/conversation-ingestion/infrastructure/postgres';
import {
  AggregateVersionConflict,
  CountingIdGenerator,
} from '../../../../src/server/contexts/conversation-ingestion/infrastructure/in-memory';
import {
  PostgresOutboxReader,
  PostgresOutboxStore,
} from '../../../../src/server/shared/outbox/postgres';
import { wrapEvent, type EnvelopeContext } from '../../../../src/server/shared/outbox/envelope';
import { Conversation } from '../../../../src/server/contexts/conversation-ingestion/domain/conversation';
import { AnalysisSession } from '../../../../src/server/contexts/conversation-ingestion/domain/analysis-session';
import {
  ConversationId,
  SessionId,
  SpeakerId,
  TenantId,
  TurnId,
  TurnIndex,
  UserId,
} from '../../../../src/server/contexts/conversation-ingestion/domain/value-objects';

const RUN = process.env.RUN_DB_TESTS === '1';
const DSN = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/cfv_test';

const TENANT = TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T0');
const ulid = new CountingIdGenerator();

function envCtx(): EnvelopeContext {
  return {
    tenantId: TENANT,
    actor: { type: 'SYSTEM', id: 'test' },
    correlationId: ulid.newId(),
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    newEventId: () => ulid.newId(),
  };
}

function makeConversation(): Conversation {
  return Conversation.ingest({
    id: ConversationId.of(ulid.newId()),
    tenantId: TENANT,
    title: 'Support thread',
    sourceModality: 'TEXT',
    turns: [
      {
        id: TurnId.of(ulid.newId()),
        speakerId: SpeakerId.of(ulid.newId()),
        text: 'Hello there',
        timestamp: new Date('2026-01-01T00:00:00Z'),
        turnIndex: TurnIndex.of(0),
      },
      {
        id: TurnId.of(ulid.newId()),
        speakerId: SpeakerId.of(ulid.newId()),
        text: 'General Kenobi',
        timestamp: new Date('2026-01-01T00:01:00Z'),
        turnIndex: TurnIndex.of(1),
      },
    ],
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

function makeSession(conversationId: ConversationId): AnalysisSession {
  return AnalysisSession.open({
    id: SessionId.of(ulid.newId()),
    tenantId: TENANT,
    conversationId,
    userId: UserId.of(ulid.newId()),
    parameters: { depth: 'deep' },
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

(RUN ? describe : describe.skip)('Conversation Ingestion PostgreSQL adapters (integration)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DSN });
    configurePool(pool);
    const ddl = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
    await pool.query(ddl('src/server/shared/outbox/ddl/0001_domain_event_outbox.sql'));
    await pool.query(
      ddl('src/server/contexts/conversation-ingestion/infrastructure/ddl/0001_conversation_ingestion.sql'),
    );
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE conversations, analysis_sessions, domain_event_outbox');
  });

  afterAll(async () => {
    await closePool();
  });

  it('persists a conversation and its outbox events atomically in one transaction', async () => {
    const repo = new PostgresConversationRepository();
    const outbox = new PostgresOutboxStore();
    const reader = new PostgresOutboxReader();
    const conv = makeConversation();
    const events = conv.pullEvents();

    await withTransaction(async () => {
      await repo.save(conv, 0);
      await outbox.append(events.map((e) => wrapEvent<unknown>(e, envCtx())));
    });

    const loaded = await repo.findById(conv.id, TENANT);
    expect(loaded?.turns).toHaveLength(2);
    expect(loaded?.turns[1].text).toBe('General Kenobi');
    expect(loaded?.status).toBe('INGESTED');

    const unpublished = await reader.readUnpublished(10);
    expect(unpublished).toHaveLength(1);
    expect(unpublished[0].eventType).toBe('ConversationIngested');
  });

  it('rolls back the conversation write when the transaction throws', async () => {
    const repo = new PostgresConversationRepository();
    const conv = makeConversation();
    await expect(
      withTransaction(async () => {
        await repo.save(conv, 0);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repo.findById(conv.id, TENANT)).toBeNull();
  });

  it('round-trips an updated conversation under optimistic concurrency', async () => {
    const repo = new PostgresConversationRepository();
    const conv = makeConversation();
    await withTransaction(() => repo.save(conv, 0));
    conv.applySegments({
      boundaries: [
        {
          fromTurnIndex: TurnIndex.of(0),
          toTurnIndex: TurnIndex.of(1),
          source: 'FALLBACK',
        },
      ],
      source: 'FALLBACK',
    });
    await withTransaction(() => repo.save(conv, 1));
    const loaded = await repo.findById(conv.id, TENANT);
    expect(loaded?.status).toBe('SEGMENTED');
    expect(loaded?.segments).toHaveLength(1);
    expect(loaded?.version).toBe(2);
  });

  it('enforces optimistic concurrency on save', async () => {
    const repo = new PostgresConversationRepository();
    const conv = makeConversation();
    await withTransaction(() => repo.save(conv, 0));
    await expect(withTransaction(() => repo.save(conv, 0))).rejects.toBeInstanceOf(
      AggregateVersionConflict,
    );
  });

  it('isolates findById by tenant', async () => {
    const repo = new PostgresConversationRepository();
    const conv = makeConversation();
    await withTransaction(() => repo.save(conv, 0));
    const other = await repo.findById(conv.id, TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T1'));
    expect(other).toBeNull();
  });

  it('lists conversations for a tenant with paging', async () => {
    const repo = new PostgresConversationRepository();
    const a = makeConversation();
    const b = makeConversation();
    await withTransaction(() => repo.save(a, 0));
    await withTransaction(() => repo.save(b, 0));
    const page = await repo.listForTenant(TENANT, { offset: 0, limit: 1 });
    expect(page).toHaveLength(1);
  });

  it('persists and resolves analysis sessions idempotently', async () => {
    const convRepo = new PostgresConversationRepository();
    const repo = new PostgresAnalysisSessionRepository();
    const conv = makeConversation();
    await withTransaction(() => convRepo.save(conv, 0));
    const session = makeSession(conv.id);
    await withTransaction(() => repo.save(session, 0, 'hash-1'));

    const byId = await repo.findById(session.id, TENANT);
    expect(byId?.conversationId).toBe(conv.id);

    const idempotent = await repo.findIdempotent(TENANT, conv.id, 'hash-1');
    expect(idempotent?.id).toBe(session.id);

    const miss = await repo.findIdempotent(TENANT, conv.id, 'hash-2');
    expect(miss).toBeNull();
  });

  it('enforces optimistic concurrency on session save', async () => {
    const convRepo = new PostgresConversationRepository();
    const repo = new PostgresAnalysisSessionRepository();
    const conv = makeConversation();
    await withTransaction(() => convRepo.save(conv, 0));
    const session = makeSession(conv.id);
    await withTransaction(() => repo.save(session, 0, 'hash-1'));
    await expect(
      withTransaction(() => repo.save(session, 0, 'hash-1')),
    ).rejects.toBeInstanceOf(AggregateVersionConflict);
  });
});
