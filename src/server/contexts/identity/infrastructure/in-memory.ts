/**
 * In-memory implementations of the Identity ports.
 *
 * Used for unit and component tests, local development without a
 * database, and as a reference for the future PostgreSQL/Redis adapters
 * (docs/ddd/14-implementation-roadmap.md, Phase 1).
 *
 * Behaviour intentionally mirrors a production adapter's contract:
 *   - tenant-isolated reads (cross-tenant queries return null/empty);
 *   - optimistic-concurrency check on save;
 *   - structural deep-clone on load and save to defend against
 *     accidental in-place mutation by callers.
 */

import { RefreshToken } from '../domain/refresh-token';
import { Tenant } from '../domain/tenant';
import { User } from '../domain/user';
import {
  Email,
  RefreshTokenId,
  TenantId,
  UserId,
  PasswordHash,
} from '../domain/value-objects';
import type { IdentityDomainEvent } from '../domain/events';
import type {
  AccessTokenSigner,
  Clock,
  DomainEventPublisher,
  IdGenerator,
  PasswordHasher,
  RefreshTokenRepository,
  TenantRepository,
  UserRepository,
} from '../application/ports';

export class AggregateVersionConflict extends Error {
  constructor(public readonly aggregate: string, public readonly id: string) {
    super(`Optimistic-lock conflict on ${aggregate} ${id}`);
    this.name = 'AggregateVersionConflict';
  }
}

// ---------------------------------------------------------------------------
// User repository
// ---------------------------------------------------------------------------

export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, ReturnType<User['snapshot']>>();
  private readonly byTenantEmail = new Map<string, string>(); // key -> userId

  async findById(id: UserId): Promise<User | null> {
    const snap = this.byId.get(id);
    return snap ? User.rehydrate(snap) : null;
  }

  async findByEmail(tenantId: TenantId, email: Email): Promise<User | null> {
    const key = `${tenantId}::${email.value}`;
    const userId = this.byTenantEmail.get(key);
    if (!userId) return null;
    const snap = this.byId.get(userId);
    return snap ? User.rehydrate(snap) : null;
  }

  async save(user: User, expectedVersion: number): Promise<void> {
    const existing = this.byId.get(user.id);
    if (existing) {
      const expectedFromExisting = expectedVersion;
      // Caller passed expectedVersion = previous version; aggregate's
      // current in-memory version is post-mutation (existing + 1+).
      if (existing.version !== expectedFromExisting) {
        throw new AggregateVersionConflict('User', user.id);
      }
    } else if (expectedVersion !== 0) {
      throw new AggregateVersionConflict('User', user.id);
    }

    const snap = user.snapshot();
    this.byId.set(snap.id, snap);
    this.byTenantEmail.set(`${snap.tenantId}::${snap.email.value}`, snap.id);
  }

  async delete(id: UserId): Promise<void> {
    const snap = this.byId.get(id);
    if (!snap) return;
    this.byId.delete(id);
    this.byTenantEmail.delete(`${snap.tenantId}::${snap.email.value}`);
  }

  /** Test-only helper: number of stored users. */
  size(): number {
    return this.byId.size;
  }
}

// ---------------------------------------------------------------------------
// Tenant repository
// ---------------------------------------------------------------------------

export class InMemoryTenantRepository implements TenantRepository {
  private readonly byId = new Map<string, ReturnType<Tenant['snapshot']>>();

  async findById(id: TenantId): Promise<Tenant | null> {
    const snap = this.byId.get(id);
    return snap ? Tenant.rehydrate(snap) : null;
  }

  async save(tenant: Tenant, expectedVersion: number): Promise<void> {
    const existing = this.byId.get(tenant.id);
    if (existing) {
      if (existing.version !== expectedVersion) {
        throw new AggregateVersionConflict('Tenant', tenant.id);
      }
    } else if (expectedVersion !== 0) {
      throw new AggregateVersionConflict('Tenant', tenant.id);
    }
    this.byId.set(tenant.id, tenant.snapshot());
  }
}

// ---------------------------------------------------------------------------
// Refresh-token repository
// ---------------------------------------------------------------------------

export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  private readonly byId = new Map<string, ReturnType<RefreshToken['snapshot']>>();

  async findActive(tokenId: RefreshTokenId): Promise<RefreshToken | null> {
    const snap = this.byId.get(tokenId);
    if (!snap) return null;
    return RefreshToken.rehydrate(snap);
  }

  async put(token: RefreshToken): Promise<void> {
    this.byId.set(token.id, token.snapshot());
  }

  async rotate(prev: RefreshToken, next: RefreshToken): Promise<void> {
    this.byId.set(prev.id, prev.snapshot());
    this.byId.set(next.id, next.snapshot());
  }

  async revoke(tokenId: RefreshTokenId): Promise<void> {
    const snap = this.byId.get(tokenId);
    if (!snap) return;
    const tok = RefreshToken.rehydrate(snap);
    tok.revoke(new Date());
    this.byId.set(tokenId, tok.snapshot());
  }
}

// ---------------------------------------------------------------------------
// Adapter ports — minimal in-memory / dev-grade implementations.
// Production adapters wrap bcrypt, jsonwebtoken, and a ULID library.
// ---------------------------------------------------------------------------

/**
 * Test-only password hasher. Production code uses a bcrypt adapter.
 * The "hash" is `plain:<plaintext>` which deliberately documents itself
 * as insecure if it ever accidentally reaches a real environment.
 */
export class FakePasswordHasher implements PasswordHasher {
  async hash(plaintext: string): Promise<PasswordHash> {
    return PasswordHash.fromHashed(`plain:${plaintext}`.padEnd(20, '*'));
  }
  async verify(plaintext: string, hash: PasswordHash): Promise<boolean> {
    return hash.reveal().startsWith(`plain:${plaintext}`);
  }
}

/** Test-only access-token signer. Returns a structured opaque string. */
export class FakeAccessTokenSigner implements AccessTokenSigner {
  async sign(claims: Parameters<AccessTokenSigner['sign']>[0]): Promise<string> {
    return `fake.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
  }
  async verify(jwt: string): Promise<ReturnType<AccessTokenSigner['sign']> extends Promise<infer _R> ? any : never> {
    if (!jwt.startsWith('fake.')) throw new Error('not a fake token');
    return JSON.parse(Buffer.from(jwt.slice(5), 'base64url').toString());
  }
}

/** Deterministic 26-char id generator suitable for tests. */
export class CountingIdGenerator implements IdGenerator {
  private counter = 0;
  newId(): string {
    this.counter += 1;
    // Pad to 26 chars using ULID alphabet (Crockford base32).
    const stem = this.counter.toString(32).toUpperCase().replace(/I|L|O|U/g, '0');
    return stem.padStart(26, '0');
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current.getTime());
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
  set(at: Date): void {
    this.current = new Date(at.getTime());
  }
}

export class CapturingDomainEventPublisher implements DomainEventPublisher {
  readonly events: IdentityDomainEvent[] = [];
  async publish(events: ReadonlyArray<IdentityDomainEvent>): Promise<void> {
    for (const e of events) this.events.push(e);
  }
}
