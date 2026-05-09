# 08. Domain Events

Domain events are the **published language** of CFV
([§03](03-strategic-design-context-map.md)). They are the integration
backbone within the modular monolith
([ADR-0012](../adr/0012-event-driven-analysis-pipeline.md)) and the source
of truth for the WebSocket DTOs streamed to clients
([ADR-0006](../adr/0006-rest-and-websocket-api-surface.md)). Events are
emitted by aggregates and consumed by other contexts; they never carry
domain logic.

## Properties of a Good Domain Event

1. **Past tense.** Events represent things that *have* happened
   (`AnalysisCompleted`, not `CompleteAnalysis`).
2. **Self-contained.** A consumer should be able to act on the event
   without re-fetching most of the related state. Carry IDs and the
   minimum useful payload; avoid carrying the entire aggregate.
3. **Immutable.** Once emitted, the payload of an event is part of the
   public contract (§ "Versioning" below).
4. **Authoritative origin.** Each event has exactly one emitting
   aggregate — its system of record.
5. **Causal chain.** Every event carries `correlationId` (root trace) and
   `causationId` (parent event id) (ADR-0019).

## Event Envelope

All events share a common envelope:

```json
{
  "eventId": "01H...",                  // ULID
  "eventType": "AnalysisCompleted",
  "schemaVersion": 1,
  "occurredAt": "2026-05-09T12:34:56Z",
  "tenantId": "01H...",
  "actor": {
    "type": "USER" | "SERVICE" | "SYSTEM",
    "id": "01H..."                      // UserId or ServiceId
  },
  "correlationId": "01H...",
  "causationId": "01H...",              // optional for the root event
  "payload": { ... }                    // event-specific
}
```

## Event Catalogue

Events are grouped by emitting bounded context. Payload fields below show
only the **payload** portion; the envelope is shared.

### Identity & Access

| Event             | Payload                                       | Notes                                |
|-------------------|-----------------------------------------------|--------------------------------------|
| `UserRegistered`  | `userId`, `tenantId`, `email`, `roles`        | Triggers initial provisioning.       |
| `UserDisabled`    | `userId`, `tenantId`, `reason`                | Triggers token denylist.             |
| `UserDeleted`     | `userId`, `tenantId`                          | Triggers GDPR erasure cascade.       |
| `TenantCreated`   | `tenantId`, `name`, `region`                  |                                      |
| `RolesChanged`    | `userId`, `tenantId`, `before[]`, `after[]`   |                                      |

### Conversation Ingestion

| Event                    | Payload                                                                      |
|--------------------------|------------------------------------------------------------------------------|
| `ConversationIngested`   | `conversationId`, `tenantId`, `sourceModality`, `turnCount`                  |
| `ConversationSegmented`  | `conversationId`, `segmentCount`, `segmentationSource` ("RASA"/"FALLBACK") |
| `ConversationDeleted`    | `conversationId`, `reason`                                                  |
| `AnalysisRequested`      | `conversationId`, `requestedBy`, `parameters`, `bundleVersion`              |

### Multimodal Ingestion

| Event              | Payload                                          |
|--------------------|--------------------------------------------------|
| `MediaUploaded`    | `uploadId`, `tenantId`, `mimeType`, `byteSize`   |
| `MediaProcessed`   | `uploadId`, `conversationId`, `durationMs`       |
| `MediaPurged`      | `uploadId`, `policy` ("DEFAULT"/"USER_REQUEST")|

### Cognitive Analysis (CORE)

| Event                       | Payload                                                                            |
|-----------------------------|------------------------------------------------------------------------------------|
| `AnalysisStarted`           | `analysisId`, `conversationId`, `bundleVersion`, `parameters`                      |
| `AnalysisStageStarted`      | `analysisId`, `stage`                                                              |
| `AnalysisStageCompleted`    | `analysisId`, `stage`, `durationMs`                                                |
| `AnalysisStageFailed`       | `analysisId`, `stage`, `errorClass`, `retryable`                                   |
| `CognitiveElementDetected`  | `analysisId`, `cognitiveElementId`, `dimension`, `span`, `confidence`, `evidence`  |
| `AnalysisDegraded`          | `analysisId`, `reason`, `dropped` (e.g. dropped Ensemble member)                   |
| `AnalysisCompleted`         | `analysisId`, `elementCount`, `bundleVersion`, `durationMs`                        |
| `AnalysisFailed`            | `analysisId`, `errorClass`, `recoverable`                                          |

### Cognitive Graph (CORE)

| Event                     | Payload                                                                  |
|---------------------------|--------------------------------------------------------------------------|
| `GraphNodeAdded`          | `conversationId`, `cognitiveElementId`, `dimension`, `version`           |
| `GraphEdgeFormed`         | `conversationId`, `from`, `to`, `edgeType`, `weight`, `version`          |
| `PredictedEdgeProposed`   | `conversationId`, `from`, `to`, `edgeType`, `confidenceInterval`         |
| `PredictedEdgeRealised`   | `conversationId`, `predictedEdgeId`, `becameEdgeId`                      |
| `ThreadEvolved`           | `conversationId`, `threadId`, `addedNodes[]`, `dominantDimension`        |

### Visualization

| Event                        | Payload                                                            |
|------------------------------|--------------------------------------------------------------------|
| `VisualizationRendered`      | `analysisId`, `format`, `renderMs`                                 |
| `VisualizationExported`      | `snapshotId`, `analysisId`, `format`, `provenance`, `byteSize`     |

### Insights & Reporting

| Event              | Payload                                                |
|--------------------|--------------------------------------------------------|
| `InsightDetected`  | `insightId`, `analysisIds[]`, `kind`, `confidence`     |
| `ReportGenerated`  | `reportId`, `templateId`, `analysisIds[]`, `byteSize`  |

### Model Management

| Event                         | Payload                                          |
|-------------------------------|--------------------------------------------------|
| `BundleDraftCreated`          | `bundleVersion`, `createdBy`                     |
| `BundlePromotedToShadow`      | `bundleVersion`                                  |
| `ShadowAnalysisCompleted`     | `bundleVersion`, `analysisId`, `metrics`         |
| `BundlePromotedToActive`      | `bundleVersion`, `previousActive`                |
| `BundleRolledBack`            | `from`, `to`, `reason`                           |
| `CalibrationRecomputed`       | `bundleVersion`, `effectiveAt`                   |

### Feedback & Learning

| Event                | Payload                                                                            |
|----------------------|------------------------------------------------------------------------------------|
| `FeedbackRecorded`   | `feedbackId`, `tenantId`, `analysisId`, `cognitiveElementId`, `correctedDimension?` |
| `EvalSetUpdated`     | `version`, `addedCount`, `effectiveAt`                                              |

### Notifications & Webhooks

| Event                      | Payload                                                       |
|----------------------------|---------------------------------------------------------------|
| `WebhookSubscriptionCreated` | `subscriptionId`, `tenantId`, `eventTypes[]`, `url`         |
| `WebhookDelivered`         | `subscriptionId`, `eventId`, `attemptNumber`, `responseStatus`|
| `WebhookDeliveryFailed`    | `subscriptionId`, `eventId`, `attemptNumber`, `errorClass`    |

## Versioning Rules

Adopted from
[ADR-0025](../adr/0025-versioning-and-release-strategy.md):

- **Additive changes** (new optional field) bump nothing; consumers must
  ignore unknown fields.
- **Renames or removals** bump `schemaVersion` and require a new event
  type for the breaking shape (`AnalysisCompletedV2`); both versions are
  emitted for one major-version cycle.
- The schema for every event lives in `docs/schemas/events/<EventName>.<v>.json`
  (planned) and is asserted by a contract test.

## Idempotency Keys

Consumers must be idempotent. The natural idempotency key per event:

| Event                       | Idempotency Key                       |
|-----------------------------|---------------------------------------|
| `AnalysisStageCompleted`    | `(analysisId, stage)`                 |
| `GraphNodeAdded`            | `(conversationId, cognitiveElementId)`|
| `GraphEdgeFormed`           | `(conversationId, from, to, edgeType)`|
| `AnalysisCompleted`         | `analysisId`                          |
| `WebhookDelivered`          | `(subscriptionId, eventId, attemptNumber)` |

## Mapping to WebSocket DTOs

Public WebSocket frames are derived from domain events through a dedicated
DTO layer:

| Domain Event                | WebSocket Frame                  | Notes                                      |
|-----------------------------|----------------------------------|--------------------------------------------|
| `CognitiveElementDetected`  | `analysis.element.detected`      | Full element minus internal provenance.    |
| `GraphNodeAdded`            | `graph.node.added`               | Adds layout coordinates from worker.       |
| `GraphEdgeFormed`           | `graph.edge.formed`              |                                            |
| `PredictedEdgeProposed`     | `graph.edge.predicted`           | Marked visually distinct in the UI.        |
| `ThreadEvolved`             | `graph.thread.evolved`           |                                            |
| `AnalysisCompleted`         | `analysis.completed`             | End-of-stream signal for that analysis.    |

The DTO layer ([§12](12-anti-corruption-layers.md)) is the only place that
shapes outbound payloads; aggregates emit raw domain events.

## Storage and Transport

- **In-process bus.** TypeScript bounded contexts use an in-process event
  dispatcher within the same transactional unit of work.
- **Outbox.** Events crossing process boundaries (TS → Python ML sidecar
  or external subscribers) are written to a transactional outbox in
  PostgreSQL within the same transaction that mutates the aggregate
  (ADR-0005, ADR-0012).
- **Relay.** A relay process publishes outbox rows to **Redis Streams**;
  consumers run a consumer-group with idempotent handlers.
