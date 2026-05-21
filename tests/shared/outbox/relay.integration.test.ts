/**
 * Integration test for the outbox relay against live PostgreSQL + Redis:
 * append events to the outbox, drain them onto a Redis Stream, and confirm
 * the rows are marked published and re-draining is a no-op.
 *
 * Gated behind RUN_DB_TESTS=1.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { configurePool, closePool, withTransaction } from '../../../src/server/shared/db/pool';
import { PostgresOutboxStore, PostgresOutboxReader } from '../../../src/server/shared/outbox/postgres';
import { OutboxRelay, RedisStreamPublisher } from '../../../src/server/shared/outbox/relay';
import type { EventEnvelope } from '../../../src/server/shared/outbox/envelope';

const RUN = process.env.RUN_DB_TESTS === '1';
const DSN = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/cfv_test';
const REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379';
const STREAM = 'cfvtest:events';

let seq = 0;
function ulid(): string {
  seq += 1;
  return seq.toString(32).toUpperCase().replace(/[ILOU]/g, '0').padStart(26, '0');
}

function envelope(eventType: string): EventEnvelope {
  return {
    eventId: ulid(),
    eventType,
    schemaVersion: 1,
    occurredAt: new Date('2026-01-01T00:00:00Z').toISOString(),
    tenantId: '01J0000000000000000000000A',
    actor: { type: 'SYSTEM', id: 'test' },
    correlationId: ulid(),
    payload: { hello: 'world' },
  };
}

(RUN ? describe : describe.skip)('OutboxRelay (integration)', () => {
  let pool: Pool;
  let redis: ReturnType<typeof createClient>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DSN });
    configurePool(pool);
    await pool.query(
      readFileSync(resolve(process.cwd(), 'src/server/shared/outbox/ddl/0001_domain_event_outbox.sql'), 'utf8'),
    );
    redis = createClient({ url: REDIS_URL });
    await redis.connect();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE domain_event_outbox');
    await redis.del(STREAM);
  });

  afterAll(async () => {
    await redis.del(STREAM);
    await redis.quit();
    await closePool();
  });

  it('drains unpublished events to a Redis stream and marks them published', async () => {
    const store = new PostgresOutboxStore();
    const reader = new PostgresOutboxReader();
    await withTransaction(() => store.append([envelope('GraphNodeAdded'), envelope('GraphEdgeFormed')]));

    const relay = new OutboxRelay(reader, new RedisStreamPublisher(redis as never, STREAM));
    const relayed = await relay.drainAll();
    expect(relayed).toBe(2);

    // Both events landed on the stream.
    const len = await redis.xLen(STREAM);
    expect(len).toBe(2);

    // Nothing remains unpublished; a second drain is a no-op.
    expect(await reader.readUnpublished(10)).toHaveLength(0);
    expect(await relay.drainAll()).toBe(0);
  });

  it('preserves the event payload through the stream', async () => {
    const store = new PostgresOutboxStore();
    const reader = new PostgresOutboxReader();
    await withTransaction(() => store.append([envelope('AnalysisCompleted')]));

    await new OutboxRelay(reader, new RedisStreamPublisher(redis as never, STREAM)).drainAll();

    const entries = await redis.xRange(STREAM, '-', '+');
    expect(entries).toHaveLength(1);
    const parsed = JSON.parse(entries[0].message.envelope as string);
    expect(parsed.eventType).toBe('AnalysisCompleted');
    expect(parsed.payload.hello).toBe('world');
  });
});
