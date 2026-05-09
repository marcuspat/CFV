# 13. Tactical Patterns

This document collects the **tactical patterns** CFV uses across bounded
contexts. Each section explains the pattern, when to apply it, and how
it shows up in this codebase.

## Hexagonal (Ports & Adapters)

**Why we use it.** Keeps the domain free of infrastructure concerns and
makes adapter swaps local. See
[ADR-0016](../adr/0016-hexagonal-architecture-for-bounded-contexts.md).

**Shape per bounded context.**

```
src/server/contexts/<name>/
├── domain/          # entities, aggregates, value objects, domain events
├── application/     # use cases (application services), input/output ports
├── infrastructure/  # adapters: repositories, HTTP clients, message brokers
└── interfaces/      # inbound: REST controllers, WS emitters, CLI handlers
```

Dependency rule: arrows point inward. `domain/` depends on nothing.

## Specification Pattern

**Why we use it.** Reusable, composable predicates over aggregates and
value objects — particularly useful in the Insights & Reporting context
and in the symbolic stage of cognitive analysis.

**Examples.**
- `IsBreakthroughInsight = HighConfidence(0.8) AND DimensionIs(CREATIVE_SYNTHESIS) AND PrecededBy(MetaCognition)`
- `IsHighDriftAnalysis = AccuracyDeltaBelow(-0.02) OR LatencyP95Above(15s)`

**Implementation.** Each `Specification<T>` exposes
`isSatisfiedBy(t: T): boolean` and combinators `and`, `or`, `not`.

## Saga / Process Manager

**Why we use it.** The cognitive analysis pipeline is a multi-stage
workflow with retries, fallbacks, and parallel branches across a process
boundary (TS ↔ Python sidecar). A saga makes the *order* and the
*compensations* explicit. See
[ADR-0012](../adr/0012-event-driven-analysis-pipeline.md).

**The Analysis Saga.**

```
AnalysisRequested
        │
        ▼
StartAnalysis ──► AnalysisStarted
        │
        ▼
RunSegmentation ──► AnalysisStageCompleted(SEGMENT)
        │
        ▼
For each Segment:
  ├─ RunDecomposition (parallel per Member)
  ├─ RunFusion        ──► CognitiveElementDetected*
  └─ RunSymbolic
        │
        ▼
IngestElementsBatch ──► GraphNodeAdded*, GraphEdgeFormed*
        │
        ▼
RunThreadDetection ──► ThreadEvolved*
        │
        ▼
CompleteAnalysis ──► AnalysisCompleted
```

**Compensations.** A failed stage can:
- Retry transparently (bounded retries, exponential backoff).
- Fall back (e.g. heuristic segmenter for Rasa failure — ADR-0014).
- Emit `AnalysisDegraded` and continue with reduced confidence (e.g.
  Ensemble member dropped — ADR-0008).
- Emit `AnalysisFailed` and stop.

The saga is implemented in code (a `ProcessAnalysis` coordinator), not
in a separate saga engine — the coordinator handles state transitions
and dispatches per-stage application services.

## Transactional Outbox

**Why we use it.** Avoid dual-write inconsistency between the database
and the event bus. See ADR-0005 and ADR-0012.

**How.**

1. The application-service transaction writes the aggregate **and** the
   event row to a PostgreSQL `outbox` table within the same transaction.
2. A **relay** process polls (or uses logical replication) to publish
   outbox rows to **Redis Streams**.
3. Consumers run in a consumer group; idempotency keys prevent duplicate
   processing on retries.
4. The relay marks rows as published once acknowledged.

A failure between aggregate write and event emission is impossible —
they happen in the same transaction. A failure during relay is benign —
unpublished rows are republished on the next pass.

## CQRS-lite (Read Models)

**Why we use it.** Aggregate-by-id reads are easy via repositories;
list views, dashboards, and full-text searches require denormalised
projections. Splitting reads from writes lets each be optimised
independently.

**Shape.**

- **Write side.** Repositories + aggregates + domain events.
- **Read side.** Per-view projections in PostgreSQL (and Neo4j where the
  natural query is graph-shaped). Projections are kept in sync via
  domain-event consumers.

**Examples.**
- `analysis_dashboard` projection holds `(analysisId, status, dimensionsCount, lastUpdate)`.
- `tenant_recent_insights` projection holds the most recent `Insight`s
  per tenant for the feed.

We do **not** adopt full Event Sourcing in v1 (ADR-0012). Aggregates
remain state-stored.

## Domain Events as Published Language

Domain events are how bounded contexts integrate. The event vocabulary
is part of the public contract; see
[§08](08-domain-events.md) for the catalogue and versioning rules.

## Optimistic Concurrency

Each aggregate row has a `version` column. Application services pass
the expected version on save; a mismatch raises `AggregateVersionConflict`.
The application service either retries (when the operation is idempotent
and safe to recompute) or surfaces a `Conflict` error to the caller.

## Idempotency Keys

External-facing operations that mutate expensive resources accept an
optional `Idempotency-Key` header. The application service stores the
key alongside the resulting aggregate id. A repeated request with the
same key returns the original result.

Internal stage handlers in the analysis saga use natural idempotency
keys (e.g. `(analysisId, stage)` for stage handlers,
`(conversationId, cognitiveElementId)` for graph nodes — see [§08](08-domain-events.md)).

## Result Type for Errors

Application services return `Result<Ok, Err>` rather than throwing for
expected error paths (validation failures, conflicts, upstream
degradation). Unexpected errors (programming bugs, infrastructure
faults) propagate as exceptions and are caught by the controller layer.

## Specification of "Degraded"

A first-class domain concept across multiple contexts:

- **Degraded Analysis.** Pipeline finished but with at least one Member
  dropped or one stage falling back; flagged on the aggregate.
- **Degraded Snapshot.** Visualization rendered without an optional
  enrichment (e.g. predicted edges suppressed because the DGNN was
  unavailable).
- **Degraded Subscription.** Real-time stream missed frames because of
  client backpressure; the client receives a `STATE_RESYNC_REQUIRED`
  signal.

Degraded does not mean "wrong"; it means "with disclosed limitations".
The UI surfaces this explicitly (ADR-0013).

## Domain Exceptions vs. Domain Errors

| Kind of failure                        | Mechanism                | Caller awareness  |
|----------------------------------------|--------------------------|-------------------|
| Expected business outcome (conflict, validation, forbidden) | `Result.Err(typedError)` | Yes |
| Programming bug (unreachable code, broken invariant) | exception (`InvariantViolated`) | No (alerted) |
| Infrastructure transient                | exception (`Transient`)  | Retried by service |
| External upstream                       | `Result.Err(UpstreamX)`  | Yes |

## Pattern Anti-Patterns to Avoid

- **Anaemic Domain Model.** If aggregates are bags of getters/setters
  while application services hold all the rules, fix the aggregate. The
  business rule lives where the data does.
- **Repository as DAO.** Repositories return aggregates, not rows. If
  you find yourself wanting `findThirdElementOfTwentiethThread`, you
  want a read model.
- **Cross-context domain imports.** Importing another context's
  `domain/` types is forbidden; use the published port or a published-
  language event payload.
- **God Application Service.** A use case should fit on a screen. If
  it doesn't, it's probably two use cases or a missing domain service.
- **Catch-and-rethrow ladders.** Map external errors **once** in the
  ACL and let the canonical error flow.
