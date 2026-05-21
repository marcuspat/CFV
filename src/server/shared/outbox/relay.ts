/**
 * Transactional-outbox relay (ADR-0012).
 *
 * Drains unpublished rows from the outbox and republishes them onto Redis
 * Streams, then marks them published. At-least-once: a crash between publish
 * and mark re-delivers on the next drain (consumers must be idempotent on
 * eventId). Conventionally a separate process; can also run in-process on a
 * timer.
 */

import type { EventEnvelope } from './envelope';
import type { OutboxReader } from './port';

/** Minimal Redis Streams surface satisfied by the node-redis v4 client. */
export interface StreamClient {
  xAdd(key: string, id: string, message: Record<string, string>): Promise<string>;
}

export interface StreamPublisher {
  publish(envelopes: ReadonlyArray<EventEnvelope>): Promise<void>;
}

export class RedisStreamPublisher implements StreamPublisher {
  constructor(
    private readonly client: StreamClient,
    private readonly stream = 'cfv:events',
  ) {}

  async publish(envelopes: ReadonlyArray<EventEnvelope>): Promise<void> {
    for (const e of envelopes) {
      await this.client.xAdd(this.stream, '*', {
        eventId: e.eventId,
        eventType: e.eventType,
        tenantId: e.tenantId,
        correlationId: e.correlationId,
        envelope: JSON.stringify(e),
      });
    }
  }
}

export class OutboxRelay {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly reader: OutboxReader,
    private readonly publisher: StreamPublisher,
    private readonly batchSize = 100,
  ) {}

  /** Publish one batch of unpublished events. Returns the number relayed. */
  async drainOnce(): Promise<number> {
    const batch = await this.reader.readUnpublished(this.batchSize);
    if (batch.length === 0) return 0;
    await this.publisher.publish(batch);
    await this.reader.markPublished(batch.map((e) => e.eventId));
    return batch.length;
  }

  /** Drain repeatedly until no rows remain (bounded by maxBatches). */
  async drainAll(maxBatches = 1000): Promise<number> {
    let total = 0;
    for (let i = 0; i < maxBatches; i++) {
      const n = await this.drainOnce();
      total += n;
      if (n < this.batchSize) break;
    }
    return total;
  }

  /** Start an in-process polling loop. Idempotent. */
  start(intervalMs = 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.drainAll().catch(() => {
        // Swallow transient errors; the next tick retries (at-least-once).
      });
    }, intervalMs);
    // Do not keep the event loop alive solely for the relay.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
