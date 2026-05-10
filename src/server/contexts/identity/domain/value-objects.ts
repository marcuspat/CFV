/**
 * Identity & Access — value objects.
 *
 * Pure, immutable, identity-less domain types. See
 * docs/ddd/07-value-objects.md for the catalogue and design rules.
 *
 * NOTE: This module is in the `domain/` layer (ADR-0016) and must not
 * import any framework, persistence client, or HTTP library.
 */

// ---------------------------------------------------------------------------
// Branded ID types — prevents accidental cross-typing of opaque strings.
// ---------------------------------------------------------------------------

declare const idBrand: unique symbol;
type Brand<T, B extends string> = T & { readonly [idBrand]: B };

export type UserId = Brand<string, 'UserId'>;
export type TenantId = Brand<string, 'TenantId'>;
export type RefreshTokenId = Brand<string, 'RefreshTokenId'>;
export type Jti = Brand<string, 'Jti'>;

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function asId<T extends string>(raw: string, label: string): T {
  if (!ULID_RE.test(raw)) {
    throw new InvalidIdentifier(label, raw);
  }
  return raw as T;
}

export const UserId = {
  of: (raw: string): UserId => asId<UserId>(raw, 'UserId'),
};
export const TenantId = {
  of: (raw: string): TenantId => asId<TenantId>(raw, 'TenantId'),
};
export const RefreshTokenId = {
  of: (raw: string): RefreshTokenId =>
    asId<RefreshTokenId>(raw, 'RefreshTokenId'),
};
export const Jti = {
  of: (raw: string): Jti => asId<Jti>(raw, 'Jti'),
};

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(public readonly value: string) {}

  static of(raw: string): Email {
    const trimmed = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      throw new InvalidEmail(raw);
    }
    return new Email(trimmed);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

// ---------------------------------------------------------------------------
// PasswordHash — opaque; never serialised to outbound DTOs.
// ---------------------------------------------------------------------------

export class PasswordHash {
  private constructor(private readonly value: string) {}

  /**
   * Wrap an already-hashed value (e.g. from the database). The actual
   * hashing function is an infrastructure concern (bcrypt adapter) that
   * implements the `PasswordHasher` port — the domain never hashes.
   */
  static fromHashed(value: string): PasswordHash {
    if (!value || value.length < 20) {
      throw new InvalidPasswordHash();
    }
    return new PasswordHash(value);
  }

  reveal(): string {
    // For repository persistence only. UI/serialisers must not call this.
    return this.value;
  }

  toString(): string {
    return '<redacted>';
  }

  toJSON(): string {
    return '<redacted>';
  }
}

// ---------------------------------------------------------------------------
// Roles and Scopes (ADR-0007)
// ---------------------------------------------------------------------------

export const ROLES = [
  'viewer',
  'analyst',
  'admin',
  'developer',
  'service',
] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export type Scope = string; // e.g. "analysis:read", "analysis:start"

const ROLE_DEFAULT_SCOPES: Record<Role, ReadonlyArray<Scope>> = {
  viewer: ['conversation:read', 'analysis:read', 'visualization:read'],
  analyst: [
    'conversation:read',
    'conversation:write',
    'analysis:read',
    'analysis:start',
    'visualization:read',
    'feedback:write',
  ],
  developer: [
    'conversation:read',
    'analysis:read',
    'analysis:start',
    'bundle:read',
    'webhook:manage',
  ],
  admin: ['*'],
  service: ['analysis:start', 'analysis:read', 'graph:read'],
};

export function defaultScopesFor(roles: ReadonlyArray<Role>): ReadonlyArray<Scope> {
  const out = new Set<Scope>();
  for (const role of roles) {
    for (const scope of ROLE_DEFAULT_SCOPES[role]) {
      out.add(scope);
    }
  }
  return Array.from(out);
}

// ---------------------------------------------------------------------------
// AccessTokenClaims (ADR-0007)
// ---------------------------------------------------------------------------

export interface AccessTokenClaims {
  readonly sub: UserId;
  readonly org: TenantId;
  readonly roles: ReadonlyArray<Role>;
  readonly scopes: ReadonlyArray<Scope>;
  readonly jti: Jti;
  /** Seconds since epoch. */
  readonly exp: number;
  /** Seconds since epoch. */
  readonly iat: number;
}

// ---------------------------------------------------------------------------
// Errors raised from value object constructors
// ---------------------------------------------------------------------------

export class InvalidEmail extends Error {
  constructor(input: string) {
    super(`Invalid email: ${input}`);
    this.name = 'InvalidEmail';
  }
}

export class InvalidPasswordHash extends Error {
  constructor() {
    super('Invalid password hash');
    this.name = 'InvalidPasswordHash';
  }
}

export class InvalidIdentifier extends Error {
  constructor(label: string, input: string) {
    super(`Invalid ${label}: ${input}`);
    this.name = 'InvalidIdentifier';
  }
}
