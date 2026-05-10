/**
 * RotateRefreshToken use case.
 *
 * Inputs: an existing refresh token id.
 * Outputs: { newRefreshTokenId, accessToken, expiry timestamps }.
 *
 * Behaviour: per ADR-0007, refresh tokens are one-shot. Calling this
 * with the same id twice succeeds the first time and returns
 * Unauthorised the second time (RefreshTokenAlreadyRotated).
 */

import { Jti, RefreshTokenId, UserId } from '../../domain/value-objects';
import { RefreshToken } from '../../domain/refresh-token';
import {
  RefreshTokenAlreadyRotated,
  RefreshTokenExpired,
  RefreshTokenRevoked,
} from '../../domain/errors';
import {
  Result,
  type AccessTokenSigner,
  type ApplicationError,
  type Clock,
  type IdGenerator,
  type RefreshTokenRepository,
  type UserRepository,
} from '../ports';
import type { LoginConfig } from './login';

export interface RotateRefreshTokenInput {
  readonly refreshTokenId: string;
}

export interface RotateRefreshTokenOutput {
  readonly accessToken: string;
  readonly newRefreshTokenId: string;
  readonly accessTokenExpiresAt: Date;
  readonly refreshTokenExpiresAt: Date;
}

export interface RotateRefreshTokenDeps {
  readonly users: UserRepository;
  readonly refreshTokens: RefreshTokenRepository;
  readonly signer: AccessTokenSigner;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly config: LoginConfig;
}

export class RotateRefreshToken {
  constructor(private readonly deps: RotateRefreshTokenDeps) {}

  async execute(
    input: RotateRefreshTokenInput,
  ): Promise<Result<RotateRefreshTokenOutput, ApplicationError>> {
    let tokenId: RefreshTokenId;
    try {
      tokenId = RefreshTokenId.of(input.refreshTokenId);
    } catch {
      return Result.err({ kind: 'Unauthorised' });
    }
    const existing = await this.deps.refreshTokens.findActive(tokenId);
    if (!existing) return Result.err({ kind: 'Unauthorised' });

    const now = this.deps.clock.now();
    try {
      existing.assertUsable(now);
    } catch (e) {
      if (
        e instanceof RefreshTokenAlreadyRotated ||
        e instanceof RefreshTokenRevoked ||
        e instanceof RefreshTokenExpired
      ) {
        return Result.err({ kind: 'Unauthorised' });
      }
      throw e;
    }

    const user = await this.deps.users.findById(existing.userId);
    if (!user || user.isDisabled) {
      return Result.err({ kind: 'Unauthorised' });
    }

    existing.rotate(now);
    const next = RefreshToken.issue({
      id: RefreshTokenId.of(this.deps.ids.newId()),
      userId: existing.userId,
      tenantId: existing.tenantId,
      now,
      ttlSeconds: this.deps.config.refreshTokenTtlSeconds,
      rotatedFromId: existing.id,
    });
    await this.deps.refreshTokens.rotate(existing, next);

    const jti = Jti.of(this.deps.ids.newId());
    const accessExp = new Date(
      now.getTime() + this.deps.config.accessTokenTtlSeconds * 1000,
    );
    const accessToken = await this.deps.signer.sign({
      sub: user.id,
      org: user.tenantId,
      roles: user.roles,
      scopes: user.defaultScopes(),
      jti,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(accessExp.getTime() / 1000),
    });

    return Result.ok({
      accessToken,
      newRefreshTokenId: next.id,
      accessTokenExpiresAt: accessExp,
      refreshTokenExpiresAt: next.expiresAt,
    });
  }
}

// Imported to keep TS happy about the unused type parameter when
// optimistic-lock errors propagate as exceptions (handled higher up).
export type { UserId };
