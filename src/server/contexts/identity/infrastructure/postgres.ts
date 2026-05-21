/**
 * PostgreSQL implementations of the Identity repositories.
 *
 * All queries run on the ambient Unit-of-Work client (shared/db/pool.ts) so
 * they commit atomically with the transactional outbox. Optimistic
 * concurrency mirrors the in-memory adapter's contract: callers pass the
 * aggregate version *before* the mutation as `expectedVersion`.
 */

import { getQueryable } from '../../../shared/db/pool';
import { RefreshToken } from '../domain/refresh-token';
import { Tenant } from '../domain/tenant';
import { User } from '../domain/user';
import {
  Email,
  PasswordHash,
  RefreshTokenId,
  TenantId,
  UserId,
  type Role,
} from '../domain/value-objects';
import type {
  RefreshTokenRepository,
  TenantRepository,
  UserRepository,
} from '../application/ports';
import { AggregateVersionConflict } from './in-memory';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

// ---------------------------------------------------------------------------
// User repository
// ---------------------------------------------------------------------------

export class PostgresUserRepository implements UserRepository {
  async findById(id: UserId): Promise<User | null> {
    const { rows } = await getQueryable().query(
      `SELECT id, tenant_id, email, password_hash, roles, created_at, disabled_at, version
         FROM users WHERE id = $1`,
      [id],
    );
    return rows[0] ? hydrateUser(rows[0]) : null;
  }

  async findByEmail(tenantId: TenantId, email: Email): Promise<User | null> {
    const { rows } = await getQueryable().query(
      `SELECT id, tenant_id, email, password_hash, roles, created_at, disabled_at, version
         FROM users WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email.value],
    );
    return rows[0] ? hydrateUser(rows[0]) : null;
  }

  async save(user: User, expectedVersion: number): Promise<void> {
    const s = user.snapshot();
    const db = getQueryable();
    if (expectedVersion === 0) {
      try {
        await db.query(
          `INSERT INTO users (id, tenant_id, email, password_hash, roles, created_at, disabled_at, version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [s.id, s.tenantId, s.email.value, s.passwordHash.reveal(), s.roles, s.createdAt, s.disabledAt, s.version],
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw new AggregateVersionConflict('User', s.id);
        throw err;
      }
      return;
    }
    const { rowCount } = await db.query(
      `UPDATE users
          SET email = $2, password_hash = $3, roles = $4, disabled_at = $5, version = $6
        WHERE id = $1 AND version = $7`,
      [s.id, s.email.value, s.passwordHash.reveal(), s.roles, s.disabledAt, s.version, expectedVersion],
    );
    if (rowCount !== 1) throw new AggregateVersionConflict('User', s.id);
  }

  async delete(id: UserId): Promise<void> {
    await getQueryable().query(`DELETE FROM users WHERE id = $1`, [id]);
  }
}

function hydrateUser(row: Record<string, unknown>): User {
  return User.rehydrate({
    id: UserId.of(String(row.id)),
    tenantId: TenantId.of(String(row.tenant_id)),
    email: Email.of(String(row.email)),
    passwordHash: PasswordHash.fromHashed(String(row.password_hash)),
    roles: row.roles as ReadonlyArray<Role>,
    createdAt: row.created_at as Date,
    disabledAt: (row.disabled_at as Date | null) ?? null,
    version: Number(row.version),
  });
}

// ---------------------------------------------------------------------------
// Tenant repository
// ---------------------------------------------------------------------------

export class PostgresTenantRepository implements TenantRepository {
  async findById(id: TenantId): Promise<Tenant | null> {
    const { rows } = await getQueryable().query(
      `SELECT id, name, region, retain_media, max_age_days, feature_flags, created_at, version
         FROM tenants WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return null;
    return Tenant.rehydrate({
      id: TenantId.of(String(row.id)),
      name: String(row.name),
      region: String(row.region),
      retentionPolicy: {
        retainMedia: Boolean(row.retain_media),
        maxAgeDays: Number(row.max_age_days),
      },
      featureFlags: row.feature_flags as ReadonlyArray<string>,
      createdAt: row.created_at as Date,
      version: Number(row.version),
    });
  }

  async save(tenant: Tenant, expectedVersion: number): Promise<void> {
    const s = tenant.snapshot();
    const db = getQueryable();
    if (expectedVersion === 0) {
      try {
        await db.query(
          `INSERT INTO tenants (id, name, region, retain_media, max_age_days, feature_flags, created_at, version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [s.id, s.name, s.region, s.retentionPolicy.retainMedia, s.retentionPolicy.maxAgeDays, s.featureFlags, s.createdAt, s.version],
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw new AggregateVersionConflict('Tenant', s.id);
        throw err;
      }
      return;
    }
    const { rowCount } = await db.query(
      `UPDATE tenants
          SET name = $2, region = $3, retain_media = $4, max_age_days = $5, feature_flags = $6, version = $7
        WHERE id = $1 AND version = $8`,
      [s.id, s.name, s.region, s.retentionPolicy.retainMedia, s.retentionPolicy.maxAgeDays, s.featureFlags, s.version, expectedVersion],
    );
    if (rowCount !== 1) throw new AggregateVersionConflict('Tenant', s.id);
  }
}

// ---------------------------------------------------------------------------
// Refresh-token repository
// ---------------------------------------------------------------------------

export class PostgresRefreshTokenRepository implements RefreshTokenRepository {
  async findActive(tokenId: RefreshTokenId): Promise<RefreshToken | null> {
    const { rows } = await getQueryable().query(
      `SELECT id, user_id, tenant_id, issued_at, expires_at, rotated_from_id, rotated_at, revoked_at, version
         FROM refresh_tokens WHERE id = $1`,
      [tokenId],
    );
    return rows[0] ? hydrateRefreshToken(rows[0]) : null;
  }

  async put(token: RefreshToken): Promise<void> {
    await upsertRefreshToken(token);
  }

  async rotate(prev: RefreshToken, next: RefreshToken): Promise<void> {
    await upsertRefreshToken(prev);
    await upsertRefreshToken(next);
  }

  async revoke(tokenId: RefreshTokenId): Promise<void> {
    const existing = await this.findActive(tokenId);
    if (!existing) return;
    existing.revoke(new Date());
    await upsertRefreshToken(existing);
  }
}

async function upsertRefreshToken(token: RefreshToken): Promise<void> {
  const s = token.snapshot();
  await getQueryable().query(
    `INSERT INTO refresh_tokens
       (id, user_id, tenant_id, issued_at, expires_at, rotated_from_id, rotated_at, revoked_at, version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET
       rotated_from_id = EXCLUDED.rotated_from_id,
       rotated_at = EXCLUDED.rotated_at,
       revoked_at = EXCLUDED.revoked_at,
       version = EXCLUDED.version`,
    [s.id, s.userId, s.tenantId, s.issuedAt, s.expiresAt, s.rotatedFromId, s.rotatedAt, s.revokedAt, s.version],
  );
}

function hydrateRefreshToken(row: Record<string, unknown>): RefreshToken {
  return RefreshToken.rehydrate({
    id: RefreshTokenId.of(String(row.id)),
    userId: UserId.of(String(row.user_id)),
    tenantId: TenantId.of(String(row.tenant_id)),
    issuedAt: row.issued_at as Date,
    expiresAt: row.expires_at as Date,
    rotatedFromId: row.rotated_from_id ? RefreshTokenId.of(String(row.rotated_from_id)) : null,
    rotatedAt: (row.rotated_at as Date | null) ?? null,
    revokedAt: (row.revoked_at as Date | null) ?? null,
    version: Number(row.version),
  });
}
