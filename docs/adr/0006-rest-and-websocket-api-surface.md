# 6. REST + WebSocket API Surface

- **Status:** Accepted
- **Date:** 2024-04-25
- **Deciders:** Core maintainers
- **Related:** ADR-0007, ADR-0012

## Context

CFV's clients (the React frontend and any external integrators) need two
modes of interaction:

1. **Request/response** for canonical operations: upload a conversation,
   start an analysis, fetch the cognitive graph, list past sessions, manage
   account state. These are well-served by HTTP.
2. **Streaming** for real-time analysis progress, live cognitive-element
   detection during long-running analyses, and collaborative cursors in the
   3D visualization. Polling these is wasteful and yields a poor UX at our
   target latency (<50 ms for live updates).

A single transport could not optimise both. GraphQL subscriptions could
notionally fit, but the canonical operations are simple enough that a REST
surface is cheaper to evolve and document.

## Decision

We expose two coordinated transports:

1. **REST API** at `/api/v1/*`, JSON over HTTPS, versioned in the path.
   - Resource-oriented routes mirroring the bounded contexts: `/auth`,
     `/conversations`, `/analyses`, `/visualizations`, `/exports`,
     `/health`, `/monitoring`.
   - OpenAPI 3.1 schema generated from the route handlers. The schema is the
     contract; clients are generated from it.
   - Idempotency keys for any operation that mutates expensive ML resources.
2. **WebSocket gateway** at `/ws`, with an authenticated handshake and
   topic-based subscriptions:
   - `analysis:{analysisId}` — progress and incremental cognitive elements.
   - `graph:{conversationId}` — live graph mutations.
   - `presence:{conversationId}` — collaborative cursors and selections.
3. The WebSocket protocol is *not* a free-form duplex channel. It is a
   one-way fan-out from server to client, with a small set of typed events
   (`analysis.started`, `analysis.element.detected`, `analysis.completed`,
   `graph.node.added`, `graph.edge.formed`, `presence.cursor`). Mutations
   from the client always go through REST.
4. Both surfaces share the same authentication scheme (ADR-0007) and the
   same domain-event vocabulary (ADR-0012).

## Consequences

### Positive

- Each transport plays to its strengths.
- WebSocket events are derived from domain events, so they evolve together.
- Generated clients keep frontend and external integrators in sync.

### Negative

- Two transports to authenticate, rate-limit, and observe.
- Replay semantics differ between transports; clients must reconcile state
  on reconnect.

### Neutral

- gRPC was considered for the internal Python sidecar contract (ADR-0017),
  separate from this external surface.

## Alternatives Considered

### GraphQL with subscriptions

Rejected: the canonical operations are simple enough that a REST surface
is cheaper. GraphQL's schema flexibility is also a downside for
external integrators who prefer stable, versioned endpoints.

### Server-Sent Events (SSE)

Rejected: only unidirectional from server, but more importantly the
operational tooling (proxies, load balancers, mobile clients) is more
mature for WebSocket in our deployment targets.

### Long polling

Rejected: latency does not meet the <50 ms live-update target.

## Compliance and Verification

- OpenAPI schema is generated and committed; CI fails if drift is detected.
- WebSocket events have JSON Schema definitions; a contract test verifies
  every emitted event matches its schema.
- Both surfaces participate in the rate-limit budget and the auth
  middleware (ADR-0007).

## References

- `src/server/routes/*` — current REST routes.
- `src/server/services/websocket.ts` — current WebSocket gateway.
- ADR-0012: Event-driven analysis pipeline.
