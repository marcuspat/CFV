/**
 * Token revocation (logout) blocklist for access AND refresh tokens.
 *
 * Blocklists tokens by their `jti` (JWT ID). Uses Redis when the database layer
 * is connected, with an in-memory Map fallback when it is not (dev/CI without
 * Redis). Entries carry a TTL equal to the token's remaining lifetime, so the
 * blocklist self-cleans and never grows unbounded.
 */
import database from '../config/database';
import { logger } from '../utils/logger';

const REFRESH_PREFIX = 'revoked:refresh:';
const ACCESS_PREFIX = 'revoked:access:';

// key (`${prefix}${jti}`) -> epoch ms at which the entry may be discarded.
const memBlocklist = new Map<string, number>();

function redisAvailable(): boolean {
  return database.isConnected;
}

async function revoke(key: string, ttlSeconds: number): Promise<void> {
  const ttl = Math.max(1, Math.floor(ttlSeconds));
  if (redisAvailable()) {
    try {
      await database.redis.setEx(key, ttl, '1');
      return;
    } catch (err) {
      logger.warn('Redis revoke failed; using in-memory blocklist', { err: String(err) });
    }
  }
  memBlocklist.set(key, Date.now() + ttl * 1000);
}

async function isRevoked(key: string): Promise<boolean> {
  if (redisAvailable()) {
    try {
      return (await database.redis.exists(key)) === 1;
    } catch (err) {
      logger.warn('Redis revocation check failed; using in-memory blocklist', { err: String(err) });
    }
  }
  const expiresAt = memBlocklist.get(key);
  if (expiresAt === undefined) return false;
  if (expiresAt <= Date.now()) {
    memBlocklist.delete(key);
    return false;
  }
  return true;
}

export const revokeRefreshToken = (jti: string, ttlSeconds: number): Promise<void> =>
  revoke(`${REFRESH_PREFIX}${jti}`, ttlSeconds);

export const isRefreshTokenRevoked = (jti: string): Promise<boolean> =>
  isRevoked(`${REFRESH_PREFIX}${jti}`);

export const revokeAccessToken = (jti: string, ttlSeconds: number): Promise<void> =>
  revoke(`${ACCESS_PREFIX}${jti}`, ttlSeconds);

export const isAccessTokenRevoked = (jti: string): Promise<boolean> =>
  isRevoked(`${ACCESS_PREFIX}${jti}`);
