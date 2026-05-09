# 25. Versioning and Release Strategy

- **Status:** Accepted
- **Date:** 2024-07-02
- **Deciders:** Core maintainers, release manager
- **Related:** ADR-0006, ADR-0017, ADR-0022

## Context

CFV has multiple, independently versioned surfaces: the public REST API,
the WebSocket event protocol, the internal TS↔Python contract, the model
bundle, and the deployable container images. Without an explicit policy,
versioning becomes ad-hoc and breaking changes leak to clients.

## Decision

We adopt **SemVer** plus explicit, surface-specific compatibility windows:

1. **Application version** (`cfv-app`, `cfv-ml`): SemVer `MAJOR.MINOR.PATCH`.
   - `MAJOR`: breaking changes to *any* public surface.
   - `MINOR`: backwards-compatible feature additions.
   - `PATCH`: bug fixes.
2. **Public REST API** (ADR-0006): URL-prefixed (`/api/v1`, `/api/v2`).
   Breaking changes require a new prefix and a **two-release
   deprecation window** during which both versions are served.
3. **WebSocket event protocol** (ADR-0006, ADR-0012): each event has a
   `schemaVersion` field. Servers emit the highest version a client
   handshake declares it supports.
4. **Internal TS↔Python contract** (ADR-0017): contracts are versioned;
   a minor bump is backwards compatible, a major bump requires a
   coordinated rollout where both sides ship a translation layer.
5. **Model bundle** (ADR-0022): bundles have their own monotonically
   increasing version, distinct from the application version. A model
   bundle is recorded on every analytical artefact.
6. **Database schema**: forward-only migrations; every release ships its
   migrations and is tested against the prior release's schema for safe
   rollback within the patch level.
7. **Release cadence.**
   - Patch releases: as needed.
   - Minor releases: roughly fortnightly.
   - Major releases: roughly twice a year, with a published roadmap.
8. **Changelog.** A `CHANGELOG.md` entry is required for any user-visible
   change. A release notes document is generated from the changelog at
   tag time.
9. **Deprecation.** A deprecated feature is announced in release notes,
   surfaced in API responses via a `Deprecation` header, and supported
   for at least one major-version cycle before removal.

## Consequences

### Positive

- Clients have predictable upgrade paths.
- Internal and external surfaces evolve at appropriate cadences.
- Rollback is bounded and tested.

### Negative

- Multi-surface versioning has overhead; a release cuts must check more
  boxes.
- Maintaining two REST versions simultaneously costs engineering.

### Neutral

- We do not yet publish a feature flag taxonomy; ADR-0001 reminders that
  cross-cutting flag policy is a future ADR if we scale up flag use.

## Alternatives Considered

### Single monotonic version for everything

Rejected: forces a major bump for any breaking change in any surface,
even ones unrelated to the rest of the system.

### Calendar-based versioning

Rejected: does not communicate compatibility, which is the primary
purpose of SemVer for our consumers.

## Compliance and Verification

- CI fails if a PR touches a public-API route schema without a
  corresponding version bump.
- A contract test runs against the prior REST version on every release.
- The model bundle version is recorded on every artefact, asserted in
  tests.

## References

- `package.json`
- ADR-0006: REST + WebSocket API surface
- ADR-0017: Anti-corruption layer
- ADR-0022: Feedback loop and model retraining
