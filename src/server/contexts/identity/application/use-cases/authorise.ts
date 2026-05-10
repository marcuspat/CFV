/**
 * Authorise use case.
 *
 * Thin orchestration around the AuthorisationPolicy domain service so
 * the controller layer (and any other context) has a single application-
 * level entry point. The domain service is the actual rule engine
 * (ADR-0007).
 */

import { AuthorisationPolicy, type Actor, type Resource } from '../../domain/authorisation-policy';
import type { Scope } from '../../domain/value-objects';
import { Result, type ApplicationError } from '../ports';

export interface AuthoriseInput {
  readonly actor: Actor;
  readonly requiredScope: Scope;
  readonly resource: Resource;
}

export class Authorise {
  // Stateless — no deps. Class form chosen for symmetry with the other
  // use cases and to allow future cross-cutting concerns (audit, metrics)
  // to be wired in via constructor dependencies.

  async execute(input: AuthoriseInput): Promise<Result<void, ApplicationError>> {
    const decision = AuthorisationPolicy.decide(
      input.actor,
      input.requiredScope,
      input.resource,
    );
    if (decision.allowed) return Result.ok(undefined);
    if (input.actor.tenantId !== input.resource.tenantId) {
      // Cross-tenant attempts are surfaced as NotFound rather than
      // Forbidden to avoid existence leaks across tenants.
      return Result.err({ kind: 'NotFound', resource: input.resource.kind ?? 'resource' });
    }
    return Result.err({ kind: 'Forbidden', reason: decision.reason });
  }
}
