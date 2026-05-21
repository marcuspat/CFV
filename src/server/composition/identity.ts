/**
 * Composition root for the Identity & Access context.
 *
 * Wires the domain use cases to their production adapters (PostgreSQL
 * repositories, transactional outbox, bcrypt/JWT/ULID) and exposes them as
 * transaction-wrapped operations. This is the only place where concrete
 * adapters meet use cases — the contexts themselves stay framework-free
 * (ADR-0016).
 */

import { Pool } from 'pg';
import { config } from '../config';
import {
  closePool,
  configurePool,
  getPool,
  withTransaction,
} from '../shared/db/pool';
import { PostgresOutboxStore } from '../shared/outbox/postgres';
import { OutboxDomainEventPublisher } from '../shared/outbox/domain-event-publisher';
import type { EnvelopeContext } from '../shared/outbox/envelope';
import { Tenant } from '../contexts/identity/domain/tenant';
import { TenantId } from '../contexts/identity/domain/value-objects';
import {
  PostgresRefreshTokenRepository,
  PostgresTenantRepository,
  PostgresUserRepository,
} from '../contexts/identity/infrastructure/postgres';
import {
  BcryptPasswordHasher,
  JwtAccessTokenSigner,
  SystemClock,
  UlidIdGenerator,
} from '../contexts/identity/infrastructure/production';
import { AggregateVersionConflict } from '../contexts/identity/infrastructure/in-memory';
import { RegisterUser } from '../contexts/identity/application/use-cases/register-user';
import { Login } from '../contexts/identity/application/use-cases/login';
import { RotateRefreshToken } from '../contexts/identity/application/use-cases/rotate-refresh-token';
import { Authorise } from '../contexts/identity/application/use-cases/authorise';
import type { AccessTokenSigner } from '../contexts/identity/application/ports';

/** A stable default tenant so first-run registration works out of the box. */
export const DEFAULT_TENANT_ID = '01J0000000000000000000000A';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // ADR-0007
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // ADR-0007

export interface IdentityModule {
  readonly signer: AccessTokenSigner;
  readonly register: RegisterUser['execute'];
  readonly login: Login['execute'];
  readonly rotate: RotateRefreshToken['execute'];
  readonly authorise: Authorise['execute'];
  ensureDefaultTenant(): Promise<void>;
  close(): Promise<void>;
}

export interface BuildIdentityOptions {
  /** Overrides the connection string (tests point this at a scratch DB). */
  readonly connectionString?: string;
  /** Reuse an already-configured pool instead of creating one. */
  readonly pool?: Pool;
}

function defaultConnectionString(): string {
  const u = encodeURIComponent(config.DB_USER);
  const p = encodeURIComponent(config.DB_PASSWORD);
  return `postgres://${u}:${p}@${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`;
}

export function buildIdentityModule(opts: BuildIdentityOptions = {}): IdentityModule {
  const pool = opts.pool ?? new Pool({ connectionString: opts.connectionString ?? defaultConnectionString() });
  configurePool(pool);

  const users = new PostgresUserRepository();
  const tenants = new PostgresTenantRepository();
  const refreshTokens = new PostgresRefreshTokenRepository();
  const hasher = new BcryptPasswordHasher();
  const signer = new JwtAccessTokenSigner(config.JWT_SECRET);
  const ids = new UlidIdGenerator();
  const clock = new SystemClock();
  const outbox = new PostgresOutboxStore();

  const publisher = new OutboxDomainEventPublisher({
    outbox,
    contextProvider: (): EnvelopeContext => ({
      tenantId: DEFAULT_TENANT_ID,
      actor: { type: 'SYSTEM', id: 'identity' },
      correlationId: ids.newId(),
      occurredAt: clock.now(),
      newEventId: () => ids.newId(),
    }),
  });

  const ttl = { accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS, refreshTokenTtlSeconds: REFRESH_TOKEN_TTL_SECONDS };

  const registerUC = new RegisterUser({ users, tenants, hasher, ids, clock, publisher });
  const loginUC = new Login({ users, refreshTokens, hasher, signer, ids, clock, config: ttl });
  const rotateUC = new RotateRefreshToken({ users, refreshTokens, signer, ids, clock, config: ttl });
  const authoriseUC = new Authorise();

  return {
    signer,
    register: (input) => withTransaction(() => registerUC.execute(input)),
    login: (input) => withTransaction(() => loginUC.execute(input)),
    rotate: (input) => withTransaction(() => rotateUC.execute(input)),
    authorise: (input) => authoriseUC.execute(input),
    async ensureDefaultTenant() {
      const id = TenantId.of(DEFAULT_TENANT_ID);
      if (await tenants.findById(id)) return;
      const tenant = Tenant.create({
        id,
        name: 'Default',
        region: config.NODE_ENV === 'production' ? 'unknown' : 'local',
        now: clock.now(),
      });
      try {
        await withTransaction(() => tenants.save(tenant, 0));
      } catch (err) {
        // A concurrent boot may have created it first; that is fine.
        if (!(err instanceof AggregateVersionConflict)) throw err;
      }
    },
    async close() {
      if (getPool() === pool) await closePool();
      else await pool.end();
    },
  };
}
