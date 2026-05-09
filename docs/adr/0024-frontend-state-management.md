# 24. Frontend State Management

- **Status:** Accepted
- **Date:** 2024-06-28
- **Deciders:** Frontend lead, core maintainers
- **Related:** ADR-0006, ADR-0011

## Context

The frontend juggles three concurrent state shapes:

1. **Server state** — paginated lists, conversation metadata, analysis
   results fetched over REST (ADR-0006). Cacheable, shared across views,
   refreshed on subscription events.
2. **Real-time state** — incremental analysis events delivered via
   WebSocket (ADR-0006), graph mutations, presence cursors.
3. **Local UI state** — selections, modals, camera position in the 3D
   scene (ADR-0011), filter toggles. Ephemeral, view-local.

Mixing these in a single global store, as early prototypes did, produced
re-render storms (camera moves triggered list refetches) and made
testability poor.

## Decision

We split frontend state by *kind*:

1. **Server state: TanStack Query** (or equivalent). All HTTP fetches
   route through query keys; cache invalidation is explicit and
   subscription-driven.
2. **Real-time state: a thin WebSocket adapter** writes incremental events
   into the same TanStack Query cache (server state convergence) and into
   a small Zustand store for ephemeral signals (cursors, "user is
   typing").
3. **Local UI state: component state + Zustand** for cross-component UI
   state such as the active visualisation tab, filter toggles, and 3D
   camera state.
4. **Three.js scene** (ADR-0011) is *derived* from query/store state. The
   scene never owns truth; selectors compute the props it needs.
5. **Type safety.** Server-state types are generated from the OpenAPI
   schema (ADR-0006). WebSocket event payloads use the same generated
   types.
6. **No Redux.** Redux remains a fine choice in larger apps; for our scope
   the server-state / real-time / UI-state split is cleaner with the
   above libraries.

## Consequences

### Positive

- Re-renders are localised; the 3D scene does not re-render on a list
  refetch.
- Cache and live-update converge into one cache, simplifying reconciliation.
- Each kind of state has the right tool for the job.

### Negative

- Three libraries instead of one; contributors must understand which to
  use when.
- TanStack-Query–WebSocket adapter is custom code we maintain.

### Neutral

- We adopt React Suspense progressively as it stabilises in our target
  React version.

## Alternatives Considered

### Redux Toolkit + RTK Query

Reasonable; rejected primarily because Zustand is a lighter ergonomic fit
for our small UI-state surface and TanStack Query has stronger
caching/invalidation defaults for our access patterns.

### Apollo Client

Rejected: not aligned with our REST-first surface (ADR-0006).

### Plain `useState` / context

Rejected: scales poorly for the 3D scene + live updates combination.

## Compliance and Verification

- A lint rule forbids importing the WebSocket adapter outside the
  designated module.
- A snapshot test asserts that 3D-scene re-renders are bounded when
  unrelated server state changes.

## References

- `src/client/`
- ADR-0006: REST + WebSocket API surface
- ADR-0011: Three.js for 3D visualization
