/**
 * Integration tests for the Identity PostgreSQL adapters + transactional
 * outbox. Exercises real SQL against a live database.
 *
 * Gated behind RUN_DB_TESTS=1 so the default unit run (and CI without a
 * database) skips it. Run with:
 *   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://postgres@localhost:5433/cfv_test \
 *     npx jest tests/contexts/identity/infrastructure
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import {
  closePool,
  configurePool,
  getQueryable,
  withTransaction,
} from '../../../../src/server/contexts/../shared/db/pool';
import {
  PostgresRefreshTokenRepository,
  PostgresTenantRepository,
  PostgresUserRepository,
} from '../../../../src/server/contexts/identity/infrastructure/postgres';
import { AggregateVersionConflict } from '../../../../src/server/contexts/identity/infrastructure/in-memory';
import {
  BcryptPasswordHasher,
  JwtAccessTokenSigner,
  SystemClock,
  UlidIdGenerator,
} from '../../../../src/server/contexts/identity/infrastructure/production';
import {
  PostgresOutboxReader,
  PostgresOutboxStore,
} from '../../../../src/server/shared/outbox/postgres';
import { wrapEvent, type EnvelopeContext } from '../../../../src/server/shared/outbox/envelope';
import { User } from '../../../../src/server/contexts/identity/domain/user';
import { RefreshToken } from '../../../../src/server/contexts/identity/domain/refresh-token';
import {
  Email,
  Jti,
  PasswordHash,
  RefreshTokenId,
  TenantId,
  UserId,
} from '../../../../src/server/contexts/identity/domain/value-objects';

const RUN = process.env.RUN_DB_TESTS === '1';
const DSN = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/cfv_test';

const TENANT = TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T0');
const ulid = new UlidIdGenerator();

function envCtx(): EnvelopeContext {
  return {
    tenantId: TENANT,
    actor: { type: 'SYSTEM', id: 'test' },
    correlationId: ulid.newId(),
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    newEventId: () => ulid.newId(),
  };
}

function makeUser(): User {
  return User.register({
    id: UserId.of(ulid.newId()),
    tenantId: TENANT,
    email: Email.of(`u${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`),
    passwordHash: PasswordHash.fromHashed('plain:secret********'),
    roles: ['analyst'],
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

(RUN ? describe : describe.skip)('Identity PostgreSQL adapters (integration)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DSN });
    configurePool(pool);
    const ddl = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
    await pool.query(ddl('src/server/shared/outbox/ddl/0001_domain_event_outbox.sql'));
    await pool.query(ddl('src/server/contexts/identity/infrastructure/ddl/0001_identity.sql'));
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE users, tenants, refresh_tokens, domain_event_outbox');
  });

  afterAll(async () => {
    await closePool();
  });

  it('persists a user and its outbox events atomically in one transaction', async () => {
    const users = new PostgresUserRepository();
    const outbox = new PostgresOutboxStore();
    const reader = new PostgresOutboxReader();
    const user = makeUser();
    const events = user.pullEvents();

    await withTransaction(async () => {
      await users.save(user, 0);
      await outbox.append(events.map((e) => wrapEvent<unknown>(e, envCtx())));
    });

    const loaded = await users.findById(user.id);
    expect(loaded?.email.value).toBe(user.email.value);
    expect(loaded?.roles).toEqual(['analyst']);

    const unpublished = await reader.readUnpublished(10);
    expect(unpublished).toHaveLength(1);
    expect(unpublished[0].eventType).toBe('UserRegistered');
  });

  it('rolls back the user write when the transaction throws', async () => {
    const users = new PostgresUserRepository();
    const user = makeUser();
    await expect(
      withTransaction(async () => {
        await users.save(user, 0);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await users.findById(user.id)).toBeNull();
  });

  it('enforces optimistic concurrency on save', async () => {
    const users = new PostgresUserRepository();
    const user = makeUser();
    await withTransaction(() => users.save(user, 0));
    // Re-inserting with expectedVersion 0 collides on the primary key.
    await expect(withTransaction(() => users.save(user, 0))).rejects.toBeInstanceOf(
      AggregateVersionConflict,
    );
  });

  it('finds a user by tenant + email (tenant-isolated)', async () => {
    const users = new PostgresUserRepository();
    const user = makeUser();
    await withTransaction(() => users.save(user, 0));
    const found = await users.findByEmail(TENANT, user.email);
    expect(found?.id).toBe(user.id);
    const otherTenant = await users.findByEmail(TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T1'), user.email);
    expect(otherTenant).toBeNull();
  });

  it('rotates refresh tokens, revoking the predecessor', async () => {
    const repo = new PostgresRefreshTokenRepository();
    const prev = RefreshToken.issue({
      id: RefreshTokenId.of(ulid.newId()),
      userId: UserId.of(ulid.newId()),
      tenantId: TENANT,
      now: new Date('2026-01-01T00:00:00Z'),
      ttlSeconds: 86_400,
    });
    await withTransaction(() => repo.put(prev));
    const next = RefreshToken.issue({
      id: RefreshTokenId.of(ulid.newId()),
      userId: prev.userId,
      tenantId: TENANT,
      now: new Date('2026-01-01T12:00:00Z'),
      ttlSeconds: 86_400,
      rotatedFromId: prev.id,
    });
    prev.rotate(new Date('2026-01-01T12:00:00Z'));
    await withTransaction(() => repo.rotate(prev, next));

    const reloadedPrev = await repo.findActive(prev.id);
    expect(reloadedPrev?.isRotated).toBe(true);
    const reloadedNext = await repo.findActive(next.id);
    expect(reloadedNext?.isRevoked).toBe(false);
  });

  it('persists and reloads a tenant', async () => {
    const repo = new PostgresTenantRepository();
    const { Tenant } = await import('../../../../src/server/contexts/identity/domain/tenant');
    const tenant = Tenant.create({
      id: TENANT,
      name: 'Acme',
      region: 'us-east-1',
      retentionPolicy: { retainMedia: false, maxAgeDays: 30 },
      featureFlags: ['beta'],
      now: new Date('2026-01-01T00:00:00Z'),
    });
    await withTransaction(() => repo.save(tenant, 0));
    const loaded = await repo.findById(TENANT);
    expect(loaded?.snapshot().name).toBe('Acme');
    expect(loaded?.snapshot().featureFlags).toEqual(['beta']);
  });
});

(RUN ? describe : describe.skip)('Identity production adapters (integration)', () => {
  it('bcrypt hashes and verifies passwords', async () => {
    const hasher = new BcryptPasswordHasher(4);
    const hash = await hasher.hash('correct horse battery staple');
    expect(await hasher.verify('correct horse battery staple', hash)).toBe(true);
    expect(await hasher.verify('wrong', hash)).toBe(false);
  });

  it('JWT signer round-trips claims', async () => {
    const signer = new JwtAccessTokenSigner('test-jwt-secret-at-least-32-characters-long-000');
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      sub: UserId.of(ulid.newId()),
      org: TENANT,
      roles: ['analyst'] as const,
      scopes: ['analysis:read'] as const,
      jti: Jti.of(ulid.newId()),
      iat: now,
      exp: now + 3600,
    };
    const token = await signer.sign(claims);
    const decoded = await signer.verify(token);
    expect(decoded.sub).toBe(claims.sub);
    expect(decoded.roles).toEqual(['analyst']);
  });

  it('ULID generator produces valid, distinct identifiers', () => {
    const gen = new UlidIdGenerator();
    const RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
    const ids = Array.from({ length: 100 }, () => gen.newId());
    for (const id of ids) expect(id).toMatch(RE);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('SystemClock returns the current time', () => {
    const before = Date.now();
    const t = new SystemClock().now().getTime();
    expect(t).toBeGreaterThanOrEqual(before);
  });
});
