/**
 * In-memory OutboxStore + OutboxReader.
 *
 * Used by unit and component tests, and by `npm run dev` when running
 * without PostgreSQL. The behaviour mirrors the PostgreSQL adapter:
 *   - duplicate eventId is a no-op (idempotent append);
 *   - reads return unpublished envelopes in insertion order;
 *   - mark-published is atomic over the supplied id set.
 */

import type { EventEnvelope } from './envelope';
import type { OutboxReader, OutboxStore } from './port';

interface OutboxRow {
  readonly envelope: EventEnvelope;
  publishedAt: Date | null;
}

export class InMemoryOutboxStore implements OutboxStore, OutboxReader {
  private readonly rows = new Map<string, OutboxRow>();
  private readonly order: string[] = [];

  async append(envelopes: ReadonlyArray<EventEnvelope>): Promise<void> {
    for (const env of envelopes) {
      if (this.rows.has(env.eventId)) continue; // idempotent
      this.rows.set(env.eventId, { envelope: env, publishedAt: null });
      this.order.push(env.eventId);
    }
  }

  async readUnpublished(limit: number): Promise<ReadonlyArray<EventEnvelope>> {
    const out: EventEnvelope[] = [];
    for (const id of this.order) {
      if (out.length >= limit) break;
      const row = this.rows.get(id);
      if (row && row.publishedAt === null) out.push(row.envelope);
    }
    return out;
  }

  async markPublished(eventIds: ReadonlyArray<string>): Promise<void> {
    const now = new Date();
    for (const id of eventIds) {
      const row = this.rows.get(id);
      if (row) row.publishedAt = now;
    }
  }

  /** Test-only helper: total appended events (including published). */
  size(): number {
    return this.rows.size;
  }

  /** Test-only helper: snapshot the appended envelopes in order. */
  all(): ReadonlyArray<EventEnvelope> {
    return this.order.map((id) => this.rows.get(id)!.envelope);
  }
}
