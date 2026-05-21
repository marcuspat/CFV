/**
 * PostgreSQL transactional-outbox adapter (ADR-0012).
 *
 * `append` runs on the ambient Unit-of-Work client (see shared/db/pool.ts),
 * so outbox rows commit atomically with the aggregate write. The reader is
 * used by the relay process that republishes onto Redis Streams.
 */

import { getQueryable, type Queryable } from '../db/pool';
import type { EventEnvelope } from './envelope';
import type { OutboxReader, OutboxStore } from './port';

export class PostgresOutboxStore implements OutboxStore {
  async append(envelopes: ReadonlyArray<EventEnvelope>): Promise<void> {
    if (envelopes.length === 0) return;
    const db = getQueryable();
    for (const e of envelopes) {
      await db.query(
        `INSERT INTO domain_event_outbox
           (event_id, event_type, schema_version, tenant_id, actor_type,
            actor_id, correlation_id, causation_id, occurred_at, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (event_id) DO NOTHING`,
        [
          e.eventId,
          e.eventType,
          e.schemaVersion,
          e.tenantId,
          e.actor.type,
          e.actor.id,
          e.correlationId,
          e.causationId ?? null,
          e.occurredAt,
          JSON.stringify(e.payload),
        ],
      );
    }
  }
}

export class PostgresOutboxReader implements OutboxReader {
  constructor(private readonly db: Queryable = getQueryable()) {}

  async readUnpublished(limit: number): Promise<ReadonlyArray<EventEnvelope>> {
    const { rows } = await this.db.query(
      `SELECT event_id, event_type, schema_version, tenant_id, actor_type,
              actor_id, correlation_id, causation_id, occurred_at, payload
         FROM domain_event_outbox
        WHERE published_at IS NULL
        ORDER BY created_at ASC
        LIMIT $1`,
      [limit],
    );
    return rows.map(toEnvelope);
  }

  async markPublished(eventIds: ReadonlyArray<string>): Promise<void> {
    if (eventIds.length === 0) return;
    await this.db.query(
      `UPDATE domain_event_outbox
          SET published_at = NOW()
        WHERE event_id = ANY($1::text[])`,
      [eventIds],
    );
  }
}

function toEnvelope(row: Record<string, unknown>): EventEnvelope {
  const occurredAt = row.occurred_at;
  const payload = row.payload;
  return {
    eventId: String(row.event_id),
    eventType: String(row.event_type),
    schemaVersion: Number(row.schema_version),
    occurredAt: occurredAt instanceof Date ? occurredAt.toISOString() : String(occurredAt),
    tenantId: String(row.tenant_id),
    actor: { type: row.actor_type as EventEnvelope['actor']['type'], id: String(row.actor_id) },
    correlationId: String(row.correlation_id),
    ...(row.causation_id ? { causationId: String(row.causation_id) } : {}),
    payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
  };
}
