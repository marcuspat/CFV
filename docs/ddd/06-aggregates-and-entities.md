# 06. Aggregates and Entities

This document is the catalogue of CFV's aggregates and entities. An
**aggregate** is a cluster of objects treated as a single unit for
consistency: it has a single root, enforces its own invariants, and is
loaded and saved atomically. An **entity** is an object with identity that
participates in an aggregate.

## Aggregate Design Rules

Adopted as project-wide rules (Vernon, *Implementing DDD*, ch. 10):

1. **Protect true invariants.** An aggregate boundary exists to enforce
   business invariants that *must* hold at all times. If two pieces of
   data don't share an invariant, they probably belong in separate
   aggregates.
2. **Small aggregates.** Prefer small aggregates that load and save
   quickly. Avoid the "everything reachable from the root" anti-pattern.
3. **Reference other aggregates by identity.** Cross-aggregate
   relationships are stored as IDs (`ConversationId`,
   `AnalysisId`, `BundleVersion`), not object pointers.
4. **Update one aggregate per transaction.** Multi-aggregate consistency
   is achieved via domain events
   ([§08](08-domain-events.md), [ADR-0012](../adr/0012-event-driven-analysis-pipeline.md)).
5. **Eventual consistency between aggregates.** Code that modifies more
   than one aggregate within a single use case must justify the choice
   in review.

## Aggregate Catalogue

For each aggregate we describe: **root**, **child entities**, **invariants**,
**bounded context**, **persistence engine**, and the **commands** that act
on it.

---

### Conversation

- **Bounded Context:** Conversation Ingestion
- **Root:** `Conversation` — `ConversationId`, `tenantId`, `title`,
  `sourceModality`, `status`, `createdAt`, `derivedFrom?`
- **Child entities:** `Turn` (with `TurnId`, `speakerId`, `text`,
  `timestamp`, `turnIndex`), `Speaker` (synthetic when diarised).
- **Persistence:** PostgreSQL.
- **Invariants.**
  - `status` transitions follow the state machine `RECEIVED → INGESTED →
    SEGMENTED` (one-way).
  - Once `INGESTED`, turns are immutable; edits require a new
    `Conversation` linked via `derivedFrom`.
  - All turns share `conversationId`; total order on `(timestamp,
    turnIndex)`.
- **Commands.** `IngestConversation`, `MarkSegmented`, `Soft-delete`
  (with cascade to dependent aggregates via events).

### AnalysisSession

- **Bounded Context:** Conversation Ingestion
- **Root:** `AnalysisSession` — `SessionId`, `conversationId`, `userId`,
  `parameters`, `status`, `createdAt`.
- **Persistence:** PostgreSQL.
- **Invariants.** A session references exactly one conversation. Re-runs
  with identical parameters return the same `analysisId` (idempotency).
- **Commands.** `StartSession`, `RequestAnalysis`, `CloseSession`.

### Analysis (CORE)

- **Bounded Context:** Cognitive Analysis
- **Root:** `Analysis` — `AnalysisId`, `conversationId`, `bundleVersion`,
  `parameterHash`, `status`, `startedAt`, `completedAt?`,
  `degradedReason?`, `correlationId`.
- **Child entities:** `AnalysisStage` (Ingest, Segment, Decompose, Fuse,
  Symbolic, GraphUpdate, ThreadPredict, Notify), each with `status`,
  `startedAt`, `completedAt`, `errorClass?`.
- **Persistence:** PostgreSQL.
- **Invariants.**
  - `(conversationId, bundleVersion, parameterHash)` is unique.
  - Stage transitions follow the saga order; out-of-order completion is
    rejected.
  - `status = COMPLETED` only when every required stage is `COMPLETED`.
  - A failed stage transitions the aggregate to `FAILED` with a
    `degradedReason`.
- **Commands.** `Start`, `RecordStageStarted`, `RecordStageCompleted`,
  `RecordStageFailed`, `Complete`, `Fail`.
- **Emits.** `AnalysisStarted`, `AnalysisCompleted`, `AnalysisFailed`,
  `AnalysisDegraded`.

### CognitiveElement

> Note: a Cognitive Element is *emitted* as a value object during analysis
> (it is immutable and identified by its content + provenance) but is
> *stored* as a node in the Cognitive Graph (where it has a
> `CognitiveElementId` for graph traversal). We model it as a value
> object on the analysis side and as a graph node on the graph side.

- **As VO (Cognitive Analysis):** see [§07](07-value-objects.md).
- **As entity (Cognitive Graph):** `CognitiveElementId`, `analysisId`,
  `dimension`, `span`, `confidence`, `evidence[]`, `bundleVersion`.

### CognitiveGraph (CORE)

- **Bounded Context:** Cognitive Graph
- **Root:** `CognitiveGraph` — `GraphId` ≡ `conversationId`, `version`,
  `lastUpdatedAt`.
- **Child entities (in Neo4j):** `GraphNode` (subtype `CognitiveElement`),
  `GraphEdge` (typed: `SUPPORTS` | `CONTRADICTS` | `EXTENDS` |
  `REFERENCES`), `Thread` (clustering of nodes), `PredictedEdge`.
- **Persistence:** Neo4j (system of record); PostgreSQL stores the
  `CognitiveGraph` aggregate metadata; Redis caches snapshots.
- **Invariants.**
  - Every `GraphEdge` references two existing nodes within the same
    graph.
  - A node's `turnIndex` is monotonically present in any thread that
    contains it.
  - `PredictedEdge` is converted to `GraphEdge` only on observed
    realisation, never silently rewritten.
  - `version` increments on any mutation; events carry the resulting
    version.
- **Commands.** `AddNode`, `AddEdge`, `ProposePredictedEdge`,
  `RealisePredictedEdge`, `RecomputeThreads`.
- **Emits.** `GraphNodeAdded`, `GraphEdgeFormed`,
  `PredictedEdgeProposed`, `ThreadEvolved`.

### MediaUpload

- **Bounded Context:** Multimodal Ingestion
- **Root:** `MediaUpload` — `UploadId`, `tenantId`, `mimeType`,
  `byteSize`, `status`, `retentionPolicy`, `createdAt`.
- **Child entities.** `Transcription`, `DiarisationResult`,
  `NonVerbalFeatureSet`.
- **Persistence:** PostgreSQL (metadata); object storage (transient bytes).
- **Invariants.**
  - The bytes are deleted after `status = PROCESSED` unless
    `retentionPolicy.retain = true`.
  - Transcription requires word-level timestamps for span resolution.
- **Commands.** `Upload`, `Process`, `Purge`.
- **Emits.** `MediaProcessed`, `MediaPurged`.

### User

- **Bounded Context:** Identity & Access
- **Root:** `User` — `UserId`, `tenantId`, `email`, `passwordHash`,
  `roles`, `createdAt`, `disabledAt?`.
- **Persistence:** PostgreSQL.
- **Invariants.**
  - `(tenantId, email)` is unique.
  - A disabled user cannot authenticate; existing tokens are denylisted
    on disable.
- **Commands.** `Register`, `ChangePassword`, `AssignRole`,
  `RevokeRole`, `Disable`.
- **Emits.** `UserRegistered`, `UserDisabled`, `UserDeleted`.

### Tenant

- **Bounded Context:** Identity & Access
- **Root:** `Tenant` — `TenantId`, `name`, `region`, `retentionPolicy`,
  `featureFlags`, `createdAt`.
- **Persistence:** PostgreSQL.
- **Invariants.** Region is set at creation and never changed; cross-
  region migration requires an explicit deletion + recreation flow.

### AccessToken / RefreshToken

- **Bounded Context:** Identity & Access
- **Root:** `RefreshToken` — `TokenId`, `userId`, `tenantId`, `issuedAt`,
  `expiresAt`, `rotatedFrom?`, `revokedAt?`.
- **Persistence:** PostgreSQL (refresh); Redis (access-token denylist).
- **Invariants.** A refresh token is single-use; rotation produces a
  successor and revokes the predecessor atomically.

### AnalysisBundle

- **Bounded Context:** Model Management
- **Root:** `AnalysisBundle` — `BundleVersion`, `createdBy`, `createdAt`,
  `status` (`DRAFT` | `SHADOW` | `ACTIVE` | `RETIRED`).
- **Child entities.** `Member` (per-LLM prompts and config), `RulePack`,
  `DgnnModel`, `CalibrationParameters`.
- **Persistence:** PostgreSQL (metadata); object storage (large
  artefacts).
- **Invariants.**
  - A bundle is **immutable** once `status ≠ DRAFT`.
  - There is at most one `ACTIVE` bundle at any time.
  - Promotion requires `status = SHADOW` and passing eval criteria.
- **Commands.** `CreateDraft`, `PromoteToShadow`, `PromoteToActive`,
  `Retire`, `Rollback` (re-pin to a prior `ACTIVE`).

### FeedbackEntry

- **Bounded Context:** Feedback & Learning
- **Root:** `FeedbackEntry` — `FeedbackId`, `tenantId`, `userId`,
  `analysisId`, `cognitiveElementId`, `originalDimension`,
  `correctedDimension?`, `comment?`, `createdAt`.
- **Persistence:** PostgreSQL.
- **Invariants.** Feedback references an existing `Analysis` and
  `CognitiveElement`; `correctedDimension` (when present) is one of the
  four canonical dimensions.

### EvalSetEntry

- **Bounded Context:** Feedback & Learning
- **Root:** `EvalSetEntry` — `EvalEntryId`, `version`, `span`,
  `goldDimension`, `source`, `createdAt`.
- **Persistence:** PostgreSQL.
- **Invariants.** Once promoted to a versioned eval set, an entry is
  immutable. New labels require a new entry.

### VisualizationSnapshot

- **Bounded Context:** Visualization
- **Root:** `VisualizationSnapshot` — `SnapshotId`, `analysisId`,
  `format`, `provenance`, `createdAt`, `createdBy`.
- **Persistence:** PostgreSQL (metadata); object storage (artefact bytes).
- **Invariants.** Snapshots are immutable. Re-export creates a new
  snapshot.

### Report

- **Bounded Context:** Insights & Reporting
- **Root:** `Report` — `ReportId`, `templateId`, `analysisIds[]`,
  `bundleVersion`, `generatedAt`, `parameters`.
- **Persistence:** PostgreSQL (metadata); object storage (artefact
  bytes).
- **Invariants.** A report references a fixed list of analyses; updating
  an underlying analysis does not change the report.

### WebhookSubscription

- **Bounded Context:** Notifications & Webhooks
- **Root:** `WebhookSubscription` — `SubscriptionId`, `tenantId`, `url`,
  `eventTypes[]`, `secret`, `status`.
- **Persistence:** PostgreSQL.
- **Invariants.** `url` validated; per-tenant subscription cap.

---

## Concurrency and Versioning

- Each aggregate row in PostgreSQL has a `version` column for optimistic
  locking. Application services pass the expected version on save; a
  conflict raises a domain-defined `AggregateVersionConflict`.
- The `CognitiveGraph` aggregate uses Neo4j's transaction semantics
  (single-write writer at a time per graph). Concurrent writes from the
  pipeline are serialised by routing per-`conversationId` events to the
  same handler partition (Redis Streams consumer group key on
  `conversationId`).

## Identifiers

All aggregate identifiers are typed UUIDv7 (lexicographically sortable).
Codebase types live in `src/types/` (TS) and the Python ML side mirrors
them. Raw `string` IDs in domain code are a review-stop bug.
