/**
 * Integration tests for the Redis GraphCache adapter against a live Redis.
 *
 * Gated behind RUN_DB_TESTS=1 so the default unit run (and CI without
 * Redis) skips it. Run with:
 *   RUN_DB_TESTS=1 TEST_REDIS_URL=redis://localhost:6379 \
 *     npx jest tests/contexts/cognitive-graph/infrastructure
 */

import { createClient } from 'redis';
import { RedisGraphCache } from '../../../../src/server/contexts/cognitive-graph/infrastructure/redis';
import { GraphId } from '../../../../src/server/contexts/cognitive-graph/domain/value-objects';

const RUN = process.env.RUN_DB_TESTS === '1';
const URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379';

const GRAPH = GraphId.of('01HJK3R6X7Y8ZAB2C3D4E5F6G0');

(RUN ? describe : describe.skip)('RedisGraphCache (integration)', () => {
  let client: ReturnType<typeof createClient>;
  let cache: RedisGraphCache;

  beforeAll(async () => {
    client = createClient({ url: URL });
    await client.connect();
    cache = new RedisGraphCache(client as unknown as ConstructorParameters<typeof RedisGraphCache>[0], 'cfvtest:graph:ver:');
  });

  beforeEach(async () => {
    await client.del(`cfvtest:graph:ver:${GRAPH}`);
  });

  afterAll(async () => {
    await client.del(`cfvtest:graph:ver:${GRAPH}`);
    await client.quit();
  });

  it('returns null on a cache miss', async () => {
    expect(await cache.getVersion(GRAPH)).toBeNull();
  });

  it('round-trips a version tag', async () => {
    await cache.set(GRAPH, 7);
    expect(await cache.getVersion(GRAPH)).toBe(7);
  });

  it('invalidates a cached version', async () => {
    await cache.set(GRAPH, 3);
    await cache.invalidate(GRAPH);
    expect(await cache.getVersion(GRAPH)).toBeNull();
  });
});
