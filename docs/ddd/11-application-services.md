# 11. Application Services

Application services are the **use cases** of CFV. They sit between the
inbound interfaces (REST controllers, WebSocket gateway, event consumers)
and the domain. Their job is to **orchestrate**, not to implement
business rules. Each one represents a single user- or system-facing
intent: "ingest a conversation", "start an analysis", "promote a
bundle", "record feedback".

Application services live in `application/` of each bounded context
([ADR-0016](../adr/0016-hexagonal-architecture-for-bounded-contexts.md)).

## Responsibilities

An application service:

1. Validates input (typically already validated at the boundary, but
   re-asserts domain pre-conditions).
2. Loads the affected aggregate(s) via repository ports.
3. Calls domain methods or domain services to enact the business rule.
4. Saves aggregates atomically (one aggregate per transaction unless
   justified — [§06](06-aggregates-and-entities.md)).
5. Publishes the resulting domain events ([§08](08-domain-events.md)).
6. Returns a primitive or a small DTO to the caller.

It does **not**:

- Encode invariants — those belong on the aggregate or in a domain
  service.
- Perform persistence directly — it uses repository ports.
- Talk to external providers directly — it uses adapter ports
  ([§12](12-anti-corruption-layers.md)).
- Build query results across aggregates — that is a read model.

## Use-Case Catalogue

### Identity & Access

| Use Case                       | Inputs                                          | Outputs                          |
|--------------------------------|-------------------------------------------------|----------------------------------|
| `RegisterUser`                 | tenantId, email, password, roles                | userId                           |
| `Login`                        | email, password                                 | accessToken, refreshToken        |
| `RotateRefreshToken`           | refreshToken                                    | accessToken, newRefreshToken     |
| `Logout`                       | accessToken                                     | -                                |
| `ChangePassword`               | userId, currentPassword, newPassword            | -                                |
| `AssignRole` / `RevokeRole`    | userId, role                                    | -                                |
| `DisableUser`                  | userId, reason                                  | -                                |
| `Authorise`                    | actor, action, resource                         | Allowed | Denied(reason)        |
| `ExportMyData` / `EraseMyData` | userId                                          | dataBundle / -                   |

### Conversation Ingestion

| Use Case                  | Inputs                                                        | Outputs                       |
|---------------------------|---------------------------------------------------------------|-------------------------------|
| `IngestTextConversation`  | tenantId, userId, payload                                     | conversationId                |
| `IngestMediaConversation` | tenantId, userId, mediaUploadId                               | conversationId                |
| `RequestAnalysis`         | tenantId, userId, conversationId, parameters                  | analysisId                    |
| `DeleteConversation`      | tenantId, conversationId, reason                              | -                             |

### Multimodal Ingestion

| Use Case             | Inputs                                                   | Outputs                |
|----------------------|----------------------------------------------------------|------------------------|
| `UploadMedia`        | tenantId, userId, mimeType, bytes                        | uploadId               |
| `ProcessMedia`       | uploadId                                                 | conversationId         |
| `PurgeExpiredMedia`  | (scheduled)                                              | count                  |

### Cognitive Analysis (CORE)

| Use Case                  | Inputs                                          | Outputs              |
|---------------------------|-------------------------------------------------|----------------------|
| `StartAnalysis`           | analysisRequestEvent                            | analysisId           |
| `RunSegmentationStage`    | analysisId                                      | -                    |
| `RunDecompositionStage`   | analysisId, segmentId                           | -                    |
| `RunFusionStage`          | analysisId, segmentId                           | -                    |
| `RunSymbolicStage`        | analysisId, segmentId                           | -                    |
| `EmitElement`             | analysisId, fusedElement                        | -                    |
| `CompleteAnalysis`        | analysisId                                      | -                    |
| `RetryFailedAnalysis`     | analysisId                                      | newAnalysisId        |

The pipeline is implemented as a **Process Manager / Saga**
([§13](13-tactical-patterns.md)) that orchestrates stage application
services in response to events.

### Cognitive Graph (CORE)

| Use Case                | Inputs                                                  | Outputs                |
|-------------------------|---------------------------------------------------------|------------------------|
| `IngestElementsBatch`   | conversationId, elements[]                              | newGraphVersion        |
| `RunThreadDetection`    | conversationId                                          | newGraphVersion        |
| `RealisePredictedEdge`  | predictedEdgeId                                         | newGraphVersion        |
| `LoadGraphSnapshot`     | conversationId, asOfVersion?                            | CognitiveGraph         |

### Visualization

| Use Case                   | Inputs                                              | Outputs            |
|----------------------------|-----------------------------------------------------|--------------------|
| `RequestSnapshot`          | tenantId, userId, analysisId, format, options       | snapshotId         |
| `GetSnapshot`              | snapshotId                                          | bytes + provenance |
| `RequestExplanationBundle` | tenantId, analysisId                                | bundleId           |

### Insights & Reporting

| Use Case            | Inputs                                                     | Outputs    |
|---------------------|------------------------------------------------------------|------------|
| `DetectInsights`    | conversationId                                             | insights[] |
| `GenerateReport`    | userId, templateId, analysisIds[], parameters              | reportId   |

### Model Management

| Use Case                     | Inputs                                       | Outputs              |
|------------------------------|----------------------------------------------|----------------------|
| `CreateBundleDraft`          | author, components                           | bundleVersion        |
| `PromoteToShadow`            | bundleVersion                                | -                    |
| `RecordShadowAnalysisResult` | bundleVersion, analysisId, metrics           | -                    |
| `PromoteToActive`            | bundleVersion                                | -                    |
| `RollbackToBundle`           | bundleVersion, reason                        | -                    |
| `RecomputeCalibration`       | bundleVersion                                | newBundleVersion     |

### Feedback & Learning

| Use Case                    | Inputs                                                    | Outputs       |
|-----------------------------|-----------------------------------------------------------|---------------|
| `RecordFeedback`            | userId, analysisId, cognitiveElementId, correction        | feedbackId    |
| `CurateReviewBatch`         | criteria                                                  | batchId       |
| `PromoteEvalSetEntries`     | batchId                                                   | newVersion    |

### Real-time Streaming

| Use Case                 | Inputs                                       | Outputs        |
|--------------------------|----------------------------------------------|----------------|
| `OpenSubscription`       | accessToken, topics[]                        | subscriptionId |
| `CloseSubscription`      | subscriptionId                               | -              |
| `RouteEventToSubscribers`| domainEvent                                  | -              |

### Notifications & Webhooks

| Use Case                | Inputs                                                 | Outputs        |
|-------------------------|--------------------------------------------------------|----------------|
| `CreateSubscription`    | tenantId, url, eventTypes[]                            | subscriptionId |
| `DeliverEvent`          | subscriptionId, event                                  | attemptResult  |
| `RetryFailedDelivery`   | (scheduled)                                            | -              |

## Transaction Boundaries

- One application-service call = one transactional unit of work for the
  primary aggregate.
- The **outbox** for outbound domain events is written within the same
  transaction (ADR-0012).
- If the use case must update a second aggregate, justify the choice:
  - If the operation is idempotent and the second aggregate's mutation
    is recoverable, prefer two transactions linked by a domain event.
  - If true cross-aggregate atomicity is unavoidable, document the
    invariant in the use case and have a chaos test for the
    failure mode (ADR-0018).

## Error Surface

Application services raise a small set of typed errors:

| Error                          | Meaning                                             | Mapped HTTP |
|--------------------------------|-----------------------------------------------------|-------------|
| `InputInvalid(field, reason)`  | Domain pre-condition violated.                      | 400         |
| `Unauthorised`                 | No actor, or invalid token.                         | 401         |
| `Forbidden(reason)`            | Authenticated but `AuthorisationPolicy` denied.     | 403         |
| `NotFound(resource)`           | Aggregate or read-model entity does not exist.      | 404         |
| `Conflict(reason)`             | Optimistic-lock or duplicate request collision.     | 409         |
| `RateLimited`                  | Per-tenant or global rate limit exceeded.           | 429         |
| `UpstreamUnavailable(name)`    | A provider or sidecar is unreachable.               | 502         |
| `UpstreamRateLimited(name)`    | A provider returned rate-limit; surface to client.  | 503         |

Controllers ([§interfaces](04-bounded-contexts.md)) are responsible for
mapping these errors to HTTP/WebSocket responses; the domain does not
know about HTTP status codes.

## Testing

- Each application service has a unit test against in-memory fakes of the
  repository and adapter ports.
- Stage application services in the analysis pipeline have idempotency
  tests: invoking the same use case twice with the same idempotency key
  is a no-op on the second call.
- Integration tests cover the full chain
  (interface → application → domain → repository) against ephemeral
  engines (ADR-0018).
