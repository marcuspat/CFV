/**
 * Identity & Access — AuthorisationPolicy domain service.
 *
 * The single point at which RBAC and scope evaluation happens
 * (ADR-0007). Keeping authorisation in one place makes audit tractable
 * and is the primary defence against accidentally permissive routes.
 *
 * Inputs are pure value objects; the service has no I/O.
 */

import type { Role, Scope, TenantId, UserId } from './value-objects';

export interface Actor {
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly roles: ReadonlyArray<Role>;
  readonly scopes: ReadonlyArray<Scope>;
}

/** A resource the actor wishes to act on. `tenantId` is required for
 *  cross-tenant isolation (ADR-0021). */
export interface Resource {
  readonly tenantId: TenantId;
  readonly kind?: string;
  readonly id?: string;
}

export type Decision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

const ALLOW: Decision = Object.freeze({ allowed: true });
const ADMIN_WILDCARD: Scope = '*';

export const AuthorisationPolicy = {
  /**
   * Decide whether `actor` may perform `requiredScope` on `resource`.
   *
   * Algorithm:
   *   1. Reject cross-tenant access outright (ADR-0021).
   *   2. Admin wildcard `*` short-circuits to allow.
   *   3. Otherwise the scope must be present in the actor's scope set,
   *      either exactly or as a parent ("analysis:*" matches "analysis:read").
   */
  decide(
    actor: Actor,
    requiredScope: Scope,
    resource: Resource,
  ): Decision {
    if (actor.tenantId !== resource.tenantId) {
      return deny('cross-tenant access forbidden');
    }
    if (actor.scopes.includes(ADMIN_WILDCARD)) {
      return ALLOW;
    }
    for (const granted of actor.scopes) {
      if (granted === requiredScope) return ALLOW;
      if (granted.endsWith(':*')) {
        const prefix = granted.slice(0, -1); // keep trailing ':'
        if (requiredScope.startsWith(prefix)) return ALLOW;
      }
    }
    return deny(`missing scope ${requiredScope}`);
  },
};

function deny(reason: string): Decision {
  return Object.freeze({ allowed: false, reason });
}
