/**
 * OutboxStore port.
 *
 * Application services in any bounded context inject this and call
 * `append` from within the same unit of work as the aggregate save.
 * The PostgreSQL adapter (added in Phase 2 wiring) participates in the
 * surrounding transaction; the in-memory adapter (in-memory.ts) is for
 * tests and local development.
 */

import type { EventEnvelope } from './envelope';

export interface OutboxStore {
  /**
   * Append envelopes to the outbox. Implementations must be:
   *   - idempotent on duplicate `eventId` (UNIQUE constraint at the
   *     persistence layer);
   *   - participating in the ambient transaction (PostgreSQL adapter)
   *     so that failure rolls back both aggregate and outbox writes.
   */
  append(envelopes: ReadonlyArray<EventEnvelope>): Promise<void>;
}

/**
 * Reader API used by the relay process. Kept separate from `OutboxStore`
 * to make clear that application services append while the relay reads.
 */
export interface OutboxReader {
  readUnpublished(limit: number): Promise<ReadonlyArray<EventEnvelope>>;
  markPublished(eventIds: ReadonlyArray<string>): Promise<void>;
}
