/**
 * Shared PostgreSQL access + transactional Unit of Work.
 *
 * The Unit of Work is propagated implicitly via AsyncLocalStorage so that
 * repositories and the transactional outbox (ADR-0012) enrol in the same
 * transaction without threading a client through every method signature.
 *
 *   await withTransaction(async () => {
 *     await users.save(user, expected);   // uses the ambient client
 *     await outbox.append(envelopes);      // same client → atomic
 *   });
 *
 * Outside a transaction, getQueryable() returns the pool, so reads work
 * without ceremony.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<QueryResult<R>>;
}

const txStorage = new AsyncLocalStorage<PoolClient>();

let pool: Pool | null = null;

export function configurePool(p: Pool): void {
  pool = p;
}

/** Build a pool from a connection string and register it as the default. */
export function createPool(connectionString: string, max = 20): Pool {
  const p = new Pool({ connectionString, max });
  configurePool(p);
  return p;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('PostgreSQL pool not configured; call configurePool() first');
  }
  return pool;
}

/** The ambient transaction client if inside withTransaction(), else the pool. */
export function getQueryable(): Queryable {
  return txStorage.getStore() ?? getPool();
}

/** True when called within an active withTransaction() scope. */
export function inTransaction(): boolean {
  return txStorage.getStore() !== undefined;
}

/**
 * Run `fn` inside a single database transaction. Nested calls reuse the
 * enclosing transaction (savepoint-free) so composed use cases stay atomic.
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const existing = txStorage.getStore();
  if (existing) {
    return fn();
  }
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await txStorage.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure; surface the original error
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
