/**
 * Integration tests for the Cognitive Analysis PostgreSQL adapter + the
 * transactional outbox. Exercises real SQL against a live database.
 *
 * Gated behind RUN_DB_TESTS=1 so the default unit run (and CI without a
 * database) skips it. Run with:
 *   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://postgres@localhost:5433/cfv_test \
 *     npx jest tests/contexts/cognitive-analysis/infrastructure
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import {
  closePool,
  configurePool,
  withTransaction,
} from '../../../../src/server/contexts/../shared/db/pool';
import { PostgresAnalysisRepository } from '../../../../src/server/contexts/cognitive-analysis/infrastructure/postgres';
import {
  AggregateVersionConflict,
  CountingIdGenerator,
} from '../../../../src/server/contexts/cognitive-analysis/infrastructure/in-memory';
import {
  PostgresOutboxReader,
  PostgresOutboxStore,
} from '../../../../src/server/shared/outbox/postgres';
import { wrapEvent, type EnvelopeContext } from '../../../../src/server/shared/outbox/envelope';
import { Analysis } from '../../../../src/server/contexts/cognitive-analysis/domain/analysis';
import {
  AnalysisId,
  ConversationId,
  TenantId,
} from '../../../../src/server/contexts/cognitive-analysis/domain/value-objects';

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

function startAnalysis(overrides: Partial<{ conversationId: ConversationId; parameterHash: string }> = {}): Analysis {
  return Analysis.start({
    id: AnalysisId.of(ulid.newId()),
    conversationId: overrides.conversationId ?? ConversationId.of(ulid.newId()),
    tenantId: TENANT,
    bundleVersion: 'bundle-1.0.0',
    parameterHash: overrides.parameterHash ?? 'ph-default',
    parameters: { temperature: 0, members: ['m1', 'm2'] },
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

(RUN ? describe : describe.skip)('Cognitive Analysis PostgreSQL adapter (integration)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DSN });
    configurePool(pool);
    const ddl = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
    await pool.query(ddl('src/server/shared/outbox/ddl/0001_domain_event_outbox.sql'));
    await pool.query(ddl('src/server/contexts/cognitive-analysis/infrastructure/ddl/0001_cognitive_analysis.sql'));
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE analyses, domain_event_outbox');
  });

  afterAll(async () => {
    await closePool();
  });

  it('round-trips a freshly started analysis via findById and findByKey', async () => {
    const repo = new PostgresAnalysisRepository();
    const analysis = startAnalysis();
    await withTransaction(() => repo.save(analysis, 0));

    const byId = await repo.findById(analysis.id, TENANT);
    expect(byId?.id).toBe(analysis.id);
    expect(byId?.status).toBe('STARTED');
    expect(byId?.stages).toHaveLength(7);
    expect(byId?.stages.every((s) => s.status === 'PENDING')).toBe(true);
    expect(byId?.snapshot().parameters).toEqual({ temperature: 0, members: ['m1', 'm2'] });

    const byKey = await repo.findByKey(analysis.conversationId, 'bundle-1.0.0', 'ph-default');
    expect(byKey?.id).toBe(analysis.id);

    const otherTenant = await repo.findById(analysis.id, TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T1'));
    expect(otherTenant).toBeNull();
  });

  it('round-trips a multi-stage advanced saga state (JSONB serialization)', async () => {
    const repo = new PostgresAnalysisRepository();
    const analysis = startAnalysis();
    const t0 = new Date('2026-01-01T00:00:00Z');
    const t1 = new Date('2026-01-01T00:00:05Z');

    // Advance the saga through the first stages so stages JSONB carries
    // RUNNING/COMPLETED entries with dates and durations.
    analysis.startStage('SEGMENT', t0);
    analysis.completeStage('SEGMENT', t1);
    analysis.startStage('DECOMPOSE', t1);
    analysis.completeStage('DECOMPOSE', new Date('2026-01-01T00:00:09Z'));
    analysis.startStage('FUSE', new Date('2026-01-01T00:00:09Z'));
    analysis.recordDegradation({ reason: 'member m2 dropped', dropped: ['m2'] });

    await withTransaction(() => repo.save(analysis, 0));

    const loaded = await repo.findById(analysis.id, TENANT);
    expect(loaded).not.toBeNull();
    const snap = loaded!.snapshot();
    expect(snap.status).toBe('RUNNING');
    expect(snap.degradedReasons).toEqual(['member m2 dropped']);
    expect(snap.droppedMembers).toEqual(['m2']);

    const segment = snap.stages.find((s) => s.name === 'SEGMENT')!;
    expect(segment.status).toBe('COMPLETED');
    expect(segment.startedAt).toBeInstanceOf(Date);
    expect(segment.completedAt).toBeInstanceOf(Date);
    expect(segment.durationMs).toBe(5000);

    const fuse = snap.stages.find((s) => s.name === 'FUSE')!;
    expect(fuse.status).toBe('RUNNING');
    expect(fuse.startedAt).toBeInstanceOf(Date);

    // The aggregate must remain mutable after rehydration.
    expect(loaded!.aggregateVersion).toBe(analysis.aggregateVersion);
  });

  it('persists an analysis and its outbox events atomically in one transaction', async () => {
    const repo = new PostgresAnalysisRepository();
    const outbox = new PostgresOutboxStore();
    const reader = new PostgresOutboxReader();
    const analysis = startAnalysis();
    const events = analysis.pullEvents();

    await withTransaction(async () => {
      await repo.save(analysis, 0);
      await outbox.append(events.map((e) => wrapEvent<unknown>(e, envCtx())));
    });

    const loaded = await repo.findById(analysis.id, TENANT);
    expect(loaded?.id).toBe(analysis.id);

    const unpublished = await reader.readUnpublished(10);
    expect(unpublished).toHaveLength(1);
    expect(unpublished[0].eventType).toBe('AnalysisStarted');
  });

  it('rolls back the analysis write when the transaction throws', async () => {
    const repo = new PostgresAnalysisRepository();
    const analysis = startAnalysis();
    await expect(
      withTransaction(async () => {
        await repo.save(analysis, 0);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repo.findById(analysis.id, TENANT)).toBeNull();
  });

  it('enforces optimistic concurrency on save', async () => {
    const repo = new PostgresAnalysisRepository();
    const analysis = startAnalysis();
    await withTransaction(() => repo.save(analysis, 0));
    // Re-inserting with expectedVersion 0 collides on the primary key.
    await expect(withTransaction(() => repo.save(analysis, 0))).rejects.toBeInstanceOf(
      AggregateVersionConflict,
    );
    // A stale expectedVersion on update fails the WHERE clause.
    analysis.startStage('SEGMENT', new Date('2026-01-01T00:00:00Z'));
    await expect(withTransaction(() => repo.save(analysis, 99))).rejects.toBeInstanceOf(
      AggregateVersionConflict,
    );
  });

  it('updates an existing analysis with the correct expected version', async () => {
    const repo = new PostgresAnalysisRepository();
    const analysis = startAnalysis();
    await withTransaction(() => repo.save(analysis, 0));
    const before = analysis.aggregateVersion;
    analysis.startStage('SEGMENT', new Date('2026-01-01T00:00:00Z'));
    await withTransaction(() => repo.save(analysis, before));

    const loaded = await repo.findById(analysis.id, TENANT);
    expect(loaded?.status).toBe('RUNNING');
    expect(loaded?.aggregateVersion).toBe(analysis.aggregateVersion);
  });
});
