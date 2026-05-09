# 7. JWT Authentication with RBAC

- **Status:** Accepted
- **Date:** 2024-04-28
- **Deciders:** Core maintainers
- **Related:** ADR-0006, ADR-0021

## Context

CFV serves authenticated users (analysts, researchers, admins) and external
integrators (machine clients calling the public API). It is also a
multi-tenant target: different organisations must be isolated from each
other.

Authentication must work uniformly across REST, WebSocket, and the Python
sidecar boundary. Authorisation must be expressive enough to distinguish
"can read a conversation", "can start an analysis", and "can manage the
model registry", without devolving into bespoke checks scattered through
controllers.

## Decision

We adopt **JWT-based authentication** with **role-based access control
(RBAC)** and a small set of resource-scoped claims:

1. **Tokens.** Short-lived access tokens (15 minutes) and long-lived refresh
   tokens (30 days, rotating). Tokens are signed with RS256; the public key
   is published at a well-known URL for the Python sidecar to verify.
2. **Claims.** Tokens carry `sub` (user id), `org` (tenant id), `roles`
   (string array drawn from a fixed vocabulary), `scopes` (resource-scoped
   capability strings), and `jti` (for denylisting).
3. **Roles.** `viewer`, `analyst`, `admin`, `developer`, plus a `service`
   role for machine clients. Roles map to coarse-grained capabilities; finer
   control comes from scopes.
4. **Authorisation.** A central `authorise(actor, action, resource)` policy
   layer is the only place that checks permissions. Controllers carry a
   declarative `@requires(scope)` decorator that delegates to the policy
   layer.
5. **Revocation.** Refresh tokens are stored in PostgreSQL with rotation;
   compromised access tokens are denylisted in Redis by `jti` until they
   expire naturally.
6. **WebSocket auth.** The handshake includes the access token; subsequent
   frames are trusted within that connection until the token expires, after
   which the server closes the socket and the client reconnects.

## Consequences

### Positive

- One auth model across all transports.
- The Python sidecar can verify tokens without round-tripping to the auth
  service.
- RBAC + scopes scales from internal users to external integrators.

### Negative

- Token revocation has a worst-case lag of one access-token lifetime unless
  denylisted.
- Asymmetric signing requires a key rotation policy.

### Neutral

- We do not implement OIDC federation in v1, but the JWT design is
  compatible with adding an OIDC provider later.

## Alternatives Considered

### Opaque session cookies + server-side store

Rejected: requires a network call per request to validate, breaks the
Python sidecar's stateless model.

### OAuth2 fully delegated to a third party

Rejected for v1: ties launch timing to provider procurement; we plan to
front the JWT scheme with an OIDC layer later.

### Per-controller imperative permission checks

Rejected: scatters policy decisions, makes audit difficult, and is the
primary source of authorisation regressions in our experience.

## Compliance and Verification

- All routes go through the auth middleware in `src/server/middleware/`.
- CI runs an authorisation matrix test that asserts every endpoint rejects
  unauthorised actors and admits authorised ones.
- Security review (`/security-review`) is required for any change to the
  policy layer or claim shape.

## References

- ADR-0006: REST + WebSocket API surface
- ADR-0021: Data privacy and GDPR posture
- RFC 7519 (JWT), RFC 8725 (JWT BCP).
