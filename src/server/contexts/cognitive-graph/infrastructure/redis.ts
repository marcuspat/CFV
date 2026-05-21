/**
 * Redis implementation of the GraphCache port (ADR-0005).
 *
 * Stores the per-graph version tag so reads can detect staleness without
 * hitting the graph store. Decoupled from the concrete client via the
 * minimal {@link RedisLike} shape, which the node-redis v4 client satisfies
 * structurally — keeping the domain/infra boundary clean and the adapter
 * unit-testable.
 */

import type { GraphCache } from '../application/ports';
import type { GraphId } from '../domain/value-objects';

export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export class RedisGraphCache implements GraphCache {
  constructor(
    private readonly client: RedisLike,
    private readonly keyPrefix = 'cfv:graph:ver:',
  ) {}

  private key(graphId: GraphId): string {
    return `${this.keyPrefix}${graphId}`;
  }

  async getVersion(graphId: GraphId): Promise<number | null> {
    const raw = await this.client.get(this.key(graphId));
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  async set(graphId: GraphId, version: number): Promise<void> {
    await this.client.set(this.key(graphId), String(version));
  }

  async invalidate(graphId: GraphId): Promise<void> {
    await this.client.del(this.key(graphId));
  }
}
