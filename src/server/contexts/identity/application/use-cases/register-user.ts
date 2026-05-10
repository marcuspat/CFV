/**
 * RegisterUser use case.
 *
 * Inputs: tenantId, email, password, roles.
 * Outputs: userId.
 *
 * Side effects:
 *   - persists a new User aggregate (single-aggregate transaction).
 *   - publishes UserRegistered.
 */

import { User } from '../../domain/user';
import { Email, TenantId, UserId, isRole, type Role } from '../../domain/value-objects';
import { InvalidEmail } from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type Clock,
  type DomainEventPublisher,
  type IdGenerator,
  type PasswordHasher,
  type TenantRepository,
  type UserRepository,
} from '../ports';

export interface RegisterUserInput {
  readonly tenantId: string;
  readonly email: string;
  readonly password: string;
  readonly roles: ReadonlyArray<string>;
}

export interface RegisterUserDeps {
  readonly users: UserRepository;
  readonly tenants: TenantRepository;
  readonly hasher: PasswordHasher;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
}

export class RegisterUser {
  constructor(private readonly deps: RegisterUserDeps) {}

  async execute(
    input: RegisterUserInput,
  ): Promise<Result<{ userId: string }, ApplicationError>> {
    let tenantId: TenantId;
    let email: Email;
    try {
      tenantId = TenantId.of(input.tenantId);
    } catch {
      return Result.err({
        kind: 'InputInvalid',
        field: 'tenantId',
        reason: 'invalid identifier',
      });
    }
    try {
      email = Email.of(input.email);
    } catch (e) {
      if (e instanceof InvalidEmail) {
        return Result.err({
          kind: 'InputInvalid',
          field: 'email',
          reason: 'invalid email format',
        });
      }
      throw e;
    }

    if (!input.password || input.password.length < 12) {
      return Result.err({
        kind: 'InputInvalid',
        field: 'password',
        reason: 'password must be at least 12 characters',
      });
    }

    const roles: Role[] = [];
    for (const r of input.roles) {
      if (!isRole(r)) {
        return Result.err({
          kind: 'InputInvalid',
          field: 'roles',
          reason: `unknown role: ${r}`,
        });
      }
      roles.push(r);
    }
    if (roles.length === 0) {
      return Result.err({
        kind: 'InputInvalid',
        field: 'roles',
        reason: 'at least one role is required',
      });
    }

    const tenant = await this.deps.tenants.findById(tenantId);
    if (!tenant) {
      return Result.err({ kind: 'NotFound', resource: 'tenant' });
    }

    const existing = await this.deps.users.findByEmail(tenantId, email);
    if (existing) {
      return Result.err({
        kind: 'Conflict',
        reason: 'email already registered for this tenant',
      });
    }

    const passwordHash = await this.deps.hasher.hash(input.password);
    const id = UserId.of(this.deps.ids.newId());
    const user = User.register({
      id,
      tenantId,
      email,
      passwordHash,
      roles,
      now: this.deps.clock.now(),
    });

    await this.deps.users.save(user, 0);
    await this.deps.publisher.publish(user.pullEvents());
    return Result.ok({ userId: user.id });
  }
}
