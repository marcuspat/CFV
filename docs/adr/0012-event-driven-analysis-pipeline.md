# 12. Event-Driven Cognitive Analysis Pipeline

- **Status:** Accepted
- **Date:** 2024-05-16
- **Deciders:** Core maintainers
- **Related:** ADR-0003, ADR-0005, ADR-0006, ADR-0010

## Context

A cognitive analysis is a long-running, multi-stage workflow: ingest →
segment → decompose (per ensemble member) → fuse → symbolic-pass → graph
update → thread prediction → notify subscribers. Each stage has different
latency characteristics, error modes, and retry semantics. Modelling this
synchronously (one HTTP request that does everything) makes the request
cycle long, brittle, and impossible to stream incremental progress to
clients.

The bounded-context map (DDD docs) further argues for asynchronous
integration between contexts: the **Conversation Ingestion** context should
not depend on the **Cognitive Analysis** context being available *right now*.

## Decision

We adopt an **event-driven pipeline** with **domain events** as the
integration backbone:

1. **Domain events** are first-class, stable, versioned messages emitted by
   aggregates (e.g. `ConversationIngested`, `AnalysisStarted`,
   `CognitiveElementDetected`, `AnalysisCompleted`,
   `GraphNodeAdded`, `GraphEdgeFormed`, `ThreadEvolved`,
   `AnalysisFailed`).
2. **Transport.**
   - In-process: events are dispatched through an internal event bus during
     a single transactional unit of work.
   - Cross-process (TS ↔ Python ML sidecar): events flow over a
     transactional outbox in PostgreSQL plus a relay that publishes to
     Redis Streams. This avoids dual-write anomalies (ADR-0005).
3. **Stage handlers** are idempotent, keyed on `(analysisId, stageName)`.
   Reprocessing the same event must not double-write graph state.
4. **Backpressure.** Each stage has a bounded queue; if the bound is
   exceeded, ingestion returns `429` and the client retries with backoff.
5. **Streaming to clients.** WebSocket broadcasts are derived from domain
   events (ADR-0006). Subscribers receive `analysis.element.detected`,
   `graph.node.added`, etc. with the same payload schema as the internal
   events, mapped through a public-facing DTO layer.
6. **Observability.** Every event carries a `correlationId` (traceparent)
   and a `causationId` (parent event) for distributed tracing.

## Consequences

### Positive

- Stages can scale and fail independently.
- Clients receive incremental updates with low latency.
- Replay and reconciliation are cheap because events are persisted.
- The same event vocabulary is used for internal coordination and external
  streaming.

### Negative

- "Eventually consistent" semantics across stages must be communicated to
  clients (the analysis result is *complete* only when
  `AnalysisCompleted` is observed).
- Idempotency requires care; a slow handler combined with a retry can
  produce duplicate writes if the idempotency key is wrong.

### Neutral

- We do not adopt full Event Sourcing in v1: events are integration
  artefacts, not the system of record. Aggregates still persist their
  current state.

## Alternatives Considered

### Synchronous orchestration only

Rejected: long requests, no streaming, hard to scale stages
independently.

### Kafka as the transport

Rejected for v1: operational overhead disproportionate to scale; Redis
Streams suffices and we already operate Redis (ADR-0005).

### Saga / Process Manager pattern

Adopted in spirit: a `ProcessAnalysisCommand` saga coordinates stage
ordering and compensations, expressed in code rather than a separate
saga engine.

## Compliance and Verification

- Every aggregate that emits events has a contract test against the event
  schema.
- The outbox relay has an integration test verifying at-least-once delivery
  and idempotency.
- A consumer-driven contract test verifies that the WebSocket DTO
  matches the internal event payload.

## References

- `src/ml/conversation_analyzer.py`
- ADR-0005: Polyglot persistence (PostgreSQL outbox)
- ADR-0006: REST + WebSocket API surface
- `docs/ddd/08-domain-events.md`
