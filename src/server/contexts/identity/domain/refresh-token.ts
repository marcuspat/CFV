/**
 * Identity & Access — RefreshToken aggregate.
 *
 * Per ADR-0007 (JWT + RBAC) and docs/ddd/06-aggregates-and-entities.md:
 *   - One-shot rotation: a used refresh token cannot be reused.
 *   - Rotation produces a successor and revokes the predecessor.
 */

import {
  RefreshTokenAlreadyRotated,
  RefreshTokenExpired,
  RefreshTokenRevoked,
} from './errors';
import type { RefreshTokenId, TenantId, UserId } from './value-objects';

interface RefreshTokenState {
  readonly id: RefreshTokenId;
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly rotatedFromId: RefreshTokenId | null;
  readonly rotatedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly version: number;
}

export class RefreshToken {
  public get id(): RefreshTokenId { return this.state.id; }
  public get userId(): UserId { return this.state.userId; }
  public get tenantId(): TenantId { return this.state.tenantId; }
  public get expiresAt(): Date { return this.state.expiresAt; }
  public get version(): number { return this.state.version; }
  public get isRotated(): boolean { return this.state.rotatedAt !== null; }
  public get isRevoked(): boolean { return this.state.revokedAt !== null; }

  private constructor(private state: RefreshTokenState) {}

  static issue(args: {
    id: RefreshTokenId;
    userId: UserId;
    tenantId: TenantId;
    now: Date;
    ttlSeconds: number;
    rotatedFromId?: RefreshTokenId | null;
  }): RefreshToken {
    if (args.ttlSeconds <= 0) {
      throw new Error('RefreshToken TTL must be positive');
    }
    return new RefreshToken({
      id: args.id,
      userId: args.userId,
      tenantId: args.tenantId,
      issuedAt: args.now,
      expiresAt: new Date(args.now.getTime() + args.ttlSeconds * 1000),
      rotatedFromId: args.rotatedFromId ?? null,
      rotatedAt: null,
      revokedAt: null,
      version: 1,
    });
  }

  static rehydrate(state: RefreshTokenState): RefreshToken {
    return new RefreshToken(state);
  }

  /**
   * Check the token can be used to mint an access token / be rotated.
   * Throws a typed domain error otherwise.
   */
  assertUsable(now: Date): void {
    if (this.isRotated) {
      throw new RefreshTokenAlreadyRotated(this.state.id);
    }
    if (this.isRevoked) {
      throw new RefreshTokenRevoked(this.state.id);
    }
    if (now >= this.state.expiresAt) {
      throw new RefreshTokenExpired(this.state.id);
    }
  }

  rotate(now: Date): void {
    this.assertUsable(now);
    this.state = {
      ...this.state,
      rotatedAt: now,
      version: this.state.version + 1,
    };
  }

  revoke(now: Date): void {
    if (this.isRevoked) return;
    this.state = {
      ...this.state,
      revokedAt: now,
      version: this.state.version + 1,
    };
  }

  snapshot(): RefreshTokenState {
    return this.state;
  }
}
