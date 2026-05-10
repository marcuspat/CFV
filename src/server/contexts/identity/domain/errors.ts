/**
 * Identity & Access — domain errors.
 *
 * The application service maps these into a small canonical set
 * (docs/ddd/11-application-services.md § "Error Surface"); the
 * controller layer maps that set onto HTTP status codes.
 *
 * The domain itself does not know about HTTP.
 */

export class IdentityDomainError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'IdentityDomainError';
  }
}

export class UserAlreadyDisabled extends IdentityDomainError {
  constructor(public readonly userId: string) {
    super(`User ${userId} is already disabled`);
    this.name = 'UserAlreadyDisabled';
  }
}

export class UserDisabled extends IdentityDomainError {
  constructor(public readonly userId: string) {
    super(`User ${userId} is disabled`);
    this.name = 'UserDisabled';
  }
}

export class InvalidRoleAssignment extends IdentityDomainError {
  constructor(role: string) {
    super(`Invalid role: ${role}`);
    this.name = 'InvalidRoleAssignment';
  }
}

export class RefreshTokenAlreadyRotated extends IdentityDomainError {
  constructor(public readonly tokenId: string) {
    super(`Refresh token ${tokenId} has already been rotated`);
    this.name = 'RefreshTokenAlreadyRotated';
  }
}

export class RefreshTokenRevoked extends IdentityDomainError {
  constructor(public readonly tokenId: string) {
    super(`Refresh token ${tokenId} has been revoked`);
    this.name = 'RefreshTokenRevoked';
  }
}

export class RefreshTokenExpired extends IdentityDomainError {
  constructor(public readonly tokenId: string) {
    super(`Refresh token ${tokenId} has expired`);
    this.name = 'RefreshTokenExpired';
  }
}

export class TenantMismatch extends IdentityDomainError {
  constructor() {
    super('Tenant mismatch — cross-tenant access is forbidden');
    this.name = 'TenantMismatch';
  }
}
