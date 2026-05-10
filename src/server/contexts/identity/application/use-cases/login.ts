/**
 * Login use case.
 *
 * Inputs: email, password (and a tenantId — multi-tenant by construction).
 * Outputs: { accessToken, refreshTokenId, expiresIn }.
 *
 * Side effects:
 *   - Issues a fresh access token (JWT) and a refresh token aggregate.
 *   - Persists the refresh token via RefreshTokenRepository.put.
 *
 * Failures: Unauthorised on missing user, wrong password, or disabled user.
 * The error message is intentionally non-specific to limit user-enumeration
 * (ADR-0021 is a privacy posture; this is a hardening detail aligned with it).
 */

import { Email, Jti, RefreshTokenId, TenantId } from '../../domain/value-objects';
import { RefreshToken } from '../../domain/refresh-token';
import {
  Result,
  type AccessTokenSigner,
  type ApplicationError,
  type Clock,
  type IdGenerator,
  type PasswordHasher,
  type RefreshTokenRepository,
  type UserRepository,
} from '../ports';

export interface LoginInput {
  readonly tenantId: string;
  readonly email: string;
  readonly password: string;
}

export interface LoginOutput {
  readonly accessToken: string;
  readonly refreshTokenId: string;
  readonly accessTokenExpiresAt: Date;
  readonly refreshTokenExpiresAt: Date;
}

export interface LoginConfig {
  readonly accessTokenTtlSeconds: number;   // ADR-0007: 15 minutes
  readonly refreshTokenTtlSeconds: number;  // ADR-0007: 30 days
}

export interface LoginDeps {
  readonly users: UserRepository;
  readonly refreshTokens: RefreshTokenRepository;
  readonly hasher: PasswordHasher;
  readonly signer: AccessTokenSigner;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly config: LoginConfig;
}

export class Login {
  constructor(private readonly deps: LoginDeps) {}

  async execute(
    input: LoginInput,
  ): Promise<Result<LoginOutput, ApplicationError>> {
    let tenantId: TenantId;
    let email: Email;
    try {
      tenantId = TenantId.of(input.tenantId);
      email = Email.of(input.email);
    } catch {
      // Surface a uniform Unauthorised, not a validation error, to avoid
      // user-enumeration via differential responses.
      return Result.err({ kind: 'Unauthorised' });
    }

    const user = await this.deps.users.findByEmail(tenantId, email);
    if (!user) return Result.err({ kind: 'Unauthorised' });
    if (user.isDisabled) return Result.err({ kind: 'Unauthorised' });

    const ok = await this.deps.hasher.verify(input.password, user.passwordHash);
    if (!ok) return Result.err({ kind: 'Unauthorised' });

    const now = this.deps.clock.now();
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

    const refresh = RefreshToken.issue({
      id: RefreshTokenId.of(this.deps.ids.newId()),
      userId: user.id,
      tenantId: user.tenantId,
      now,
      ttlSeconds: this.deps.config.refreshTokenTtlSeconds,
    });
    await this.deps.refreshTokens.put(refresh);

    return Result.ok({
      accessToken,
      refreshTokenId: refresh.id,
      accessTokenExpiresAt: accessExp,
      refreshTokenExpiresAt: refresh.expiresAt,
    });
  }
}
