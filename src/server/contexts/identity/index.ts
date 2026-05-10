/**
 * Identity & Access — public surface.
 *
 * Other contexts and the composition root import from here, never from
 * domain/, application/use-cases/, or infrastructure/ directly. This is
 * the published port for this bounded context (ADR-0016, docs/ddd/).
 */

// Domain (read-only types and the AuthorisationPolicy domain service).
export {
  ROLES,
  Email,
  PasswordHash,
  TenantId,
  UserId,
  RefreshTokenId,
  Jti,
  defaultScopesFor,
  isRole,
  type Role,
  type Scope,
  type AccessTokenClaims,
} from './domain/value-objects';
export { AuthorisationPolicy, type Actor, type Resource, type Decision } from './domain/authorisation-policy';
export { type IdentityDomainEvent } from './domain/events';

// Application — use cases.
export { RegisterUser, type RegisterUserInput } from './application/use-cases/register-user';
export { Login, type LoginInput, type LoginOutput, type LoginConfig } from './application/use-cases/login';
export {
  RotateRefreshToken,
  type RotateRefreshTokenInput,
  type RotateRefreshTokenOutput,
} from './application/use-cases/rotate-refresh-token';
export { Authorise, type AuthoriseInput } from './application/use-cases/authorise';

// Application — ports (consumed by the composition root to bind adapters).
export type {
  UserRepository,
  TenantRepository,
  RefreshTokenRepository,
  PasswordHasher,
  AccessTokenSigner,
  IdGenerator,
  Clock,
  DomainEventPublisher,
  Result,
  ApplicationError,
} from './application/ports';
