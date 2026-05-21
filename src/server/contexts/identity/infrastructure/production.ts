/**
 * Production implementations of the Identity adapter ports.
 *
 *   - BcryptPasswordHasher  — wraps bcryptjs (ADR-0007).
 *   - JwtAccessTokenSigner  — wraps jsonwebtoken; signs/verifies the
 *                             AccessTokenClaims shape.
 *   - UlidIdGenerator       — monotonic-ish ULID (Crockford base32).
 *   - SystemClock           — wall-clock time.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import {
  Jti,
  PasswordHash,
  TenantId,
  UserId,
  type AccessTokenClaims,
  type Role,
  type Scope,
} from '../domain/value-objects';
import type { AccessTokenSigner, Clock, IdGenerator, PasswordHasher } from '../application/ports';

export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly rounds = 12) {}

  async hash(plaintext: string): Promise<PasswordHash> {
    return PasswordHash.fromHashed(await bcrypt.hash(plaintext, this.rounds));
  }

  async verify(plaintext: string, hash: PasswordHash): Promise<boolean> {
    return bcrypt.compare(plaintext, hash.reveal());
  }
}

export class JwtAccessTokenSigner implements AccessTokenSigner {
  constructor(private readonly secret: string) {
    if (!secret || secret.length < 32) {
      throw new Error('JWT secret must be at least 32 characters');
    }
  }

  async sign(claims: AccessTokenClaims): Promise<string> {
    // exp/iat are already present on the claims; do not let jsonwebtoken
    // recompute them.
    return jwt.sign(
      {
        sub: claims.sub,
        org: claims.org,
        roles: claims.roles,
        scopes: claims.scopes,
        jti: claims.jti,
        iat: claims.iat,
        exp: claims.exp,
      },
      this.secret,
    );
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    const decoded = jwt.verify(token, this.secret) as Record<string, unknown>;
    return {
      sub: UserId.of(String(decoded.sub)),
      org: TenantId.of(String(decoded.org)),
      roles: (decoded.roles as ReadonlyArray<Role>) ?? [],
      scopes: (decoded.scopes as ReadonlyArray<Scope>) ?? [],
      jti: Jti.of(String(decoded.jti)),
      exp: Number(decoded.exp),
      iat: Number(decoded.iat),
    };
  }
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export class UlidIdGenerator implements IdGenerator {
  private lastTime = 0;

  newId(): string {
    let now = Date.now();
    // Ensure strictly non-decreasing timestamps for lexicographic ordering.
    if (now < this.lastTime) now = this.lastTime;
    this.lastTime = now;
    return encodeTime(now) + encodeRandom();
  }
}

function encodeTime(time: number): string {
  let out = '';
  for (let i = 9; i >= 0; i--) {
    out = CROCKFORD[time % 32] + out;
    time = Math.floor(time / 32);
  }
  return out;
}

function encodeRandom(): string {
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += CROCKFORD[bytes[i] % 32];
  }
  return out;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
