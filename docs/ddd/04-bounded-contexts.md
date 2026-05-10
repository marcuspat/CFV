# 04. Bounded Contexts

This document is the per-context reference. Each section describes one
bounded context: its purpose, the domain language it owns, the aggregates
inside it, the integration patterns it uses to talk to its neighbours, and
the public ports it exposes. Use this together with [§03 Context
Map](03-strategic-design-context-map.md).

> Each context follows the hexagonal directory layout from
> [ADR-0016](../adr/0016-hexagonal-architecture-for-bounded-contexts.md):
> `domain/`, `application/`, `infrastructure/`, `interfaces/`.

---

## 1. Identity & Access

**Classification:** Generic.

**Purpose.** Authenticate users and machine clients; authorise actions
against resources; manage tenants, roles, and tokens.

**Owns.** `User`, `Tenant`, `Role`, `Scope`, `AccessToken`, `RefreshToken`,
`AuditEntry`.

**Doesn't own.** Anything about conversations, analyses, or graphs.

**Inbound integrations.**
- REST routes under `/api/v1/auth/*` and `/api/v1/admin/users/*`.

**Outbound integrations.**
- Issues domain events `UserRegistered`, `UserDeleted`, `TenantCreated`.
- Provides a published port `Authenticator` consumed by every other
  context's middleware.

**Key invariants.**
- A token's `tenantId` claim must match the resource's tenant on every
  authorised access.
- Refresh-token rotation is one-shot: a used refresh token cannot be
  reused.

**Persistence.** PostgreSQL only. Token denylist in Redis (TTL-bound).

**Related ADRs.** ADR-0007, ADR-0021.

---

## 2. Conversation Ingestion

**Classification:** Supporting.

**Purpose.** Receive, validate, segment, and persist conversations as the
canonical input for cognitive analysis.

**Owns.** `Conversation`, `Turn`, `Speaker`, `Segment`, `AnalysisSession`.

**Inbound integrations.**
- REST routes under `/api/v1/conversations/*`.
- WebSocket subscription to per-conversation channels (presence, etc.).

**Outbound integrations.**
- Emits `ConversationIngested`, `ConversationSegmented`,
  `AnalysisRequested`.
- Calls **Multimodal Ingestion**'s application port for media inputs.

**Key invariants.**
- A `Conversation` is immutable once `status = INGESTED`. Edits create a
  new `Conversation` linked by `derivedFrom`.
- Turns within a conversation are total-order by `(timestamp, turnIndex)`.
- A `Segment`'s span is contained within a single `Conversation`.

**Persistence.** PostgreSQL (system of record). Raw media in object
storage (with retention rules — ADR-0021).

**Related ADRs.** ADR-0014, ADR-0015, ADR-0021.

---

## 3. Multimodal Ingestion

**Classification:** Supporting.

**Purpose.** Convert audio/video uploads into the canonical Conversation
shape, attaching non-verbal features.

**Owns.** `MediaUpload`, `Transcription`, `DiarisationResult`,
`NonVerbalFeatureSet`.

**Inbound integrations.**
- Application port called by Conversation Ingestion.

**Outbound integrations.**
- Calls ASR and diarisation providers via ACL adapters (ADR-0017).
- Returns a canonical `Conversation` to Conversation Ingestion.

**Key invariants.**
- A `MediaUpload` is purged after processing unless tenant retention is
  enabled.
- Transcription word offsets are required for downstream span
  resolution.

**Persistence.** PostgreSQL for metadata; object storage for transient
media.

**Related ADRs.** ADR-0015, ADR-0021.

---

## 4. Cognitive Analysis (CORE)

**Classification:** Core.

**Purpose.** Decompose a conversation into Cognitive Elements with
calibrated confidence using the Ensemble + symbolic stack.

**Owns.** `Analysis`, `CognitiveElement`, `Confidence`, `Evidence`,
`Dimension`, `EnsembleInvocation`.

**Inbound integrations.**
- Domain event `AnalysisRequested` from Conversation Ingestion.
- REST routes under `/api/v1/analyses/*` for queries (no direct mutate).

**Outbound integrations.**
- Emits `AnalysisStarted`, `CognitiveElementDetected`,
  `AnalysisCompleted`, `AnalysisFailed`.
- Calls Ensemble providers via ACL (ADR-0017).
- Calls Model Management for the active `Analysis Bundle`.
- Forwards detected elements to Cognitive Graph via events.

**Key invariants.**
- An `Analysis` is keyed by `(conversationId, bundleVersion, parameters
  hash)`. Re-running with the same key returns the same `analysisId`.
- Every `CognitiveElement` carries `confidence ∈ [0, 1]`.
- Dimensions are exactly the four canonical dimensions; rejecting any
  output with an unknown dimension.

**Persistence.** PostgreSQL for `Analysis`/`AnalysisStage` records;
emitted Cognitive Elements flow into Cognitive Graph (Neo4j).

**Related ADRs.** ADR-0008, ADR-0009, ADR-0013, ADR-0017, ADR-0022.

---

## 5. Cognitive Graph (CORE)

**Classification:** Core.

**Purpose.** Maintain the evolving graph of Cognitive Elements, their
relationships, and the threads that emerge.

**Owns.** `CognitiveGraph`, `GraphNode`, `GraphEdge`, `Thread`,
`PredictedEdge`.

**Inbound integrations.**
- Consumes `CognitiveElementDetected` events from Cognitive Analysis.
- Open-host query API consumed by Visualization and Insights.

**Outbound integrations.**
- Emits `GraphNodeAdded`, `GraphEdgeFormed`, `ThreadEvolved`,
  `PredictedEdgeProposed`.
- Calls Model Management for the active DGNN model.

**Key invariants.**
- Every `GraphEdge` references two existing `GraphNode`s with the same
  `conversationId`.
- A `PredictedEdge` is converted to a `GraphEdge` only when an observed
  cross-turn reference materialises.
- A `Thread` consists of nodes with monotonically non-decreasing turn
  indices.

**Persistence.** Neo4j as system of record. Per-conversation snapshots
cached in Redis.

**Related ADRs.** ADR-0005, ADR-0010.

---

## 6. Visualization

**Classification:** Supporting.

**Purpose.** Render the Fabric Map and produce visualization snapshots
(PNG, SVG, interactive HTML).

**Owns.** `FabricMap`, `Layout`, `VisualizationSnapshot`,
`ExportArtifact`.

**Inbound integrations.**
- Open-host queries to Cognitive Graph for current state.
- WebSocket subscription for live mutations (Real-time Streaming).
- REST routes under `/api/v1/visualizations/*` and `/api/v1/exports/*`.

**Outbound integrations.**
- Emits `VisualizationExported`.
- Stores artefacts in object storage.

**Key invariants.**
- The 3D scene is **derived state**, not a source of truth (ADR-0024).
- A `VisualizationSnapshot` includes provenance: `analysisId`,
  `bundleVersion`, exporting user, timestamp (ADR-0023).

**Persistence.** PostgreSQL for snapshot metadata; object storage for
artefacts.

**Related ADRs.** ADR-0011, ADR-0023, ADR-0024.

---

## 7. Real-time Streaming

**Classification:** Supporting.

**Purpose.** Translate domain events into authenticated WebSocket frames
to subscribed clients.

**Owns.** `Subscription`, `Channel`, `Frame`.

**Inbound integrations.**
- Subscribes to in-process and Redis-Streams domain events.

**Outbound integrations.**
- WebSocket frames to clients (ADR-0006).

**Key invariants.**
- A subscription is bound to an authenticated session and a tenant; cross-
  tenant frames are unreachable by construction.
- Backpressure: a slow client is disconnected after a configurable
  buffer threshold; reconnection retrieves missed state via REST.

**Persistence.** Redis (subscription state, fan-out).

**Related ADRs.** ADR-0006, ADR-0012, ADR-0019.

---

## 8. Insights & Reporting

**Classification:** Supporting.

**Purpose.** Derive higher-order patterns from cognitive graphs (recurring
patterns, team dynamics, breakthrough moments) and generate reports.

**Owns.** `Pattern`, `Report`, `ReportTemplate`, `Insight`.

**Inbound integrations.**
- Open-host queries to Cognitive Graph.
- REST routes under `/api/v1/insights/*` and `/api/v1/reports/*`.

**Outbound integrations.**
- Emits `ReportGenerated`, `InsightDetected`.
- Notifications & Webhooks consume these.

**Key invariants.**
- A `Report` references the `bundleVersion` and `analysisIds` it was
  generated from.

**Persistence.** PostgreSQL.

**Related ADRs.** ADR-0023.

---

## 9. Model Management

**Classification:** Supporting.

**Purpose.** Govern the lifecycle of model artefacts (Ensemble prompts,
symbolic rule packs, DGNN checkpoints, calibration parameters) as
versioned `Analysis Bundles`.

**Owns.** `AnalysisBundle`, `Member`, `RulePack`, `DgnnModel`,
`CalibrationParameters`, `ShadowDeployment`.

**Inbound integrations.**
- Admin REST routes under `/api/v1/admin/bundles/*`.

**Outbound integrations.**
- Provides the active bundle to Cognitive Analysis and Cognitive Graph
  via published port.
- Emits `BundlePromoted`, `BundleRolledBack`, `ShadowAnalysisCompleted`.

**Key invariants.**
- A bundle is immutable once published; promotion is a separate event.
- Rollback is a re-pin to a prior bundle; never a mutation of an existing
  bundle.

**Persistence.** PostgreSQL (metadata); object storage for large
artefacts (DGNN checkpoints).

**Related ADRs.** ADR-0008, ADR-0009, ADR-0010, ADR-0022.

---

## 10. Feedback & Learning

**Classification:** Supporting.

**Purpose.** Capture user corrections and weak signals; feed curated
batches into the eval set used by Model Management.

**Owns.** `FeedbackEntry`, `ReviewBatch`, `EvalSetEntry`.

**Inbound integrations.**
- REST routes under `/api/v1/feedback/*`.

**Outbound integrations.**
- Emits `FeedbackRecorded`, `EvalSetUpdated`.
- Notifies Model Management when an eval set version is promoted.

**Key invariants.**
- Feedback is tenant-scoped; cross-tenant use requires explicit opt-in
  (ADR-0021, ADR-0022).
- An `EvalSetEntry` is immutable once promoted.

**Persistence.** PostgreSQL.

**Related ADRs.** ADR-0021, ADR-0022.

---

## 11. Notifications & Webhooks

**Classification:** Generic.

**Purpose.** Reliable outbound delivery of selected domain events to
external subscribers (webhook URLs, email, in-app inbox).

**Owns.** `WebhookSubscription`, `DeliveryAttempt`.

**Inbound integrations.**
- Subscribes to a curated subset of domain events.

**Outbound integrations.**
- HTTP POST to subscriber URLs with retries and exponential backoff.
- Emits `WebhookDelivered`, `WebhookDeliveryFailed`.

**Key invariants.**
- At-least-once delivery; subscribers must be idempotent (we publish a
  delivery key).
- Per-tenant subscription limits.

**Persistence.** PostgreSQL.

**Related ADRs.** ADR-0006, ADR-0012.
