/**
 * Identity & Access — domain events.
 *
 * Past-tense, immutable, payload-only shapes. The application service
 * wraps each one in the standard envelope (see
 * docs/schemas/events/Envelope.v1.json) before publishing.
 *
 * Schema files: docs/schemas/events/UserRegistered.v1.json,
 *               docs/schemas/events/UserDisabled.v1.json
 */

import type { Role, TenantId, UserId } from './value-objects';

export interface UserRegistered {
  readonly type: 'UserRegistered';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly userId: UserId;
    readonly tenantId: TenantId;
    readonly email: string;
    readonly roles: ReadonlyArray<Role>;
  };
}

export interface UserDisabled {
  readonly type: 'UserDisabled';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly userId: UserId;
    readonly tenantId: TenantId;
    readonly reason: string;
  };
}

export interface RolesChanged {
  readonly type: 'RolesChanged';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly userId: UserId;
    readonly tenantId: TenantId;
    readonly before: ReadonlyArray<Role>;
    readonly after: ReadonlyArray<Role>;
  };
}

export interface TenantCreated {
  readonly type: 'TenantCreated';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly tenantId: TenantId;
    readonly name: string;
    readonly region: string;
  };
}

export type IdentityDomainEvent =
  | UserRegistered
  | UserDisabled
  | RolesChanged
  | TenantCreated;
