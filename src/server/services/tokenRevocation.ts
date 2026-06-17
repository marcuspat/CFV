/**
 * Refresh-token revocation (logout) store.
 *
 * Blocklists refresh tokens by their `jti` (JWT ID). Uses Redis when the
 * database layer is connected, with an in-memory Set fallback when it is not
 * (dev/CI without Redis). Entries are stored with a TTL equal to the token's
 * remaining lifetime, so the blocklist self-cleans and never grows unbounded.
 */
import database from '../config/database';
import { logger } from '../utils/logger';

const PREFIX = 'revoked:refresh:';

// jti -> epoch ms at which the entry may be discarded (in-memory fallback).
const memBlocklist = new Map<string, number>();

function redisAvailable(): boolean {
  return database.isConnected;
}

/** Add a refresh token's jti to the blocklist for `ttlSeconds`. */
export async function revokeRefreshToken(jti: string, ttlSeconds: number): Promise<void> {
  const ttl = Math.max(1, Math.floor(ttlSeconds));
  if (redisAvailable()) {
    try {
      await database.redis.setEx(`${PREFIX}${jti}`, ttl, '1');
      return;
    } catch (err) {
      logger.warn('Redis revoke failed; using in-memory blocklist', { err: String(err) });
    }
  }
  memBlocklist.set(jti, Date.now() + ttl * 1000);
}

/** Whether a refresh token's jti has been revoked (and not yet expired). */
export async function isRefreshTokenRevoked(jti: string): Promise<boolean> {
  if (redisAvailable()) {
    try {
      const exists = await database.redis.exists(`${PREFIX}${jti}`);
      return exists === 1;
    } catch (err) {
      logger.warn('Redis revocation check failed; using in-memory blocklist', { err: String(err) });
    }
  }
  const expiresAt = memBlocklist.get(jti);
  if (expiresAt === undefined) return false;
  if (expiresAt <= Date.now()) {
    memBlocklist.delete(jti);
    return false;
  }
  return true;
}
