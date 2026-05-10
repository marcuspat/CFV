/**
 * Identity & Access — User aggregate.
 *
 * Aggregate root: User. See docs/ddd/06-aggregates-and-entities.md.
 *
 * Invariants:
 *   - (tenantId, email) is unique. Enforced at the repository layer
 *     (docs/ddd/10-repositories.md) — the aggregate cannot see other
 *     aggregates.
 *   - A disabled user cannot transition back to enabled in v1; that is a
 *     separate use case (re-register).
 *   - Roles are drawn from the closed Role vocabulary (ADR-0007).
 */

import {
  defaultScopesFor,
  Email,
  PasswordHash,
  TenantId,
  UserId,
  type Role,
  type Scope,
  isRole,
} from './value-objects';
import {
  InvalidRoleAssignment,
  UserAlreadyDisabled,
  UserDisabled,
} from './errors';
import type { RolesChanged, UserDisabled as UserDisabledEvent, UserRegistered } from './events';

interface UserState {
  readonly id: UserId;
  readonly tenantId: TenantId;
  readonly email: Email;
  readonly passwordHash: PasswordHash;
  readonly roles: ReadonlyArray<Role>;
  readonly createdAt: Date;
  readonly disabledAt: Date | null;
  readonly version: number;
}

type EmittedEvent = UserRegistered | UserDisabledEvent | RolesChanged;

export class User {
  /** Aggregate version for optimistic concurrency. */
  public get version(): number {
    return this.state.version;
  }
  public get id(): UserId {
    return this.state.id;
  }
  public get tenantId(): TenantId {
    return this.state.tenantId;
  }
  public get email(): Email {
    return this.state.email;
  }
  public get passwordHash(): PasswordHash {
    return this.state.passwordHash;
  }
  public get roles(): ReadonlyArray<Role> {
    return this.state.roles;
  }
  public get createdAt(): Date {
    return this.state.createdAt;
  }
  public get isDisabled(): boolean {
    return this.state.disabledAt !== null;
  }

  private readonly pending: EmittedEvent[] = [];

  private constructor(private state: UserState) {}

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  /**
   * Create a brand-new user. Rehydration from persistence uses
   * {@link User.rehydrate} instead so that no domain event is emitted.
   */
  static register(args: {
    id: UserId;
    tenantId: TenantId;
    email: Email;
    passwordHash: PasswordHash;
    roles: ReadonlyArray<Role>;
    now: Date;
  }): User {
    const roles = User.normaliseRoles(args.roles);
    const user = new User({
      id: args.id,
      tenantId: args.tenantId,
      email: args.email,
      passwordHash: args.passwordHash,
      roles,
      createdAt: args.now,
      disabledAt: null,
      version: 1,
    });
    user.pending.push({
      type: 'UserRegistered',
      schemaVersion: 1,
      payload: {
        userId: args.id,
        tenantId: args.tenantId,
        email: args.email.value,
        roles,
      },
    });
    return user;
  }

  /** Reconstruct an aggregate from persisted state (no events emitted). */
  static rehydrate(state: UserState): User {
    return new User(state);
  }

  // -------------------------------------------------------------------------
  // Behaviour
  // -------------------------------------------------------------------------

  assignRoles(roles: ReadonlyArray<Role>): void {
    this.guardEnabled();
    const next = User.normaliseRoles(roles);
    const prev = this.state.roles;
    if (sameRoles(prev, next)) return;
    this.state = { ...this.state, roles: next, version: this.state.version + 1 };
    this.pending.push({
      type: 'RolesChanged',
      schemaVersion: 1,
      payload: {
        userId: this.state.id,
        tenantId: this.state.tenantId,
        before: prev,
        after: next,
      },
    });
  }

  disable(reason: string, now: Date): void {
    if (this.isDisabled) {
      throw new UserAlreadyDisabled(this.state.id);
    }
    this.state = {
      ...this.state,
      disabledAt: now,
      version: this.state.version + 1,
    };
    this.pending.push({
      type: 'UserDisabled',
      schemaVersion: 1,
      payload: {
        userId: this.state.id,
        tenantId: this.state.tenantId,
        reason,
      },
    });
  }

  defaultScopes(): ReadonlyArray<Scope> {
    return defaultScopesFor(this.state.roles);
  }

  /** Snapshot for repository persistence. */
  snapshot(): UserState {
    return this.state;
  }

  /** Drain pending events for outbox publication. Idempotent on empty. */
  pullEvents(): ReadonlyArray<EmittedEvent> {
    const drained = this.pending.slice();
    this.pending.length = 0;
    return drained;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private guardEnabled(): void {
    if (this.isDisabled) {
      throw new UserDisabled(this.state.id);
    }
  }

  private static normaliseRoles(roles: ReadonlyArray<string>): ReadonlyArray<Role> {
    if (roles.length === 0) {
      throw new InvalidRoleAssignment('<empty>');
    }
    const seen = new Set<Role>();
    for (const r of roles) {
      if (!isRole(r)) {
        throw new InvalidRoleAssignment(r);
      }
      seen.add(r);
    }
    return Array.from(seen).sort();
  }
}

function sameRoles(a: ReadonlyArray<Role>, b: ReadonlyArray<Role>): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((r, i) => r === sb[i]);
}
