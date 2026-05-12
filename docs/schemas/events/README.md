# Domain Event Schemas

Canonical JSON Schema definitions for the CFV domain events documented in
[`docs/ddd/08-domain-events.md`](../../ddd/08-domain-events.md). These
schemas are the **published-language contract** between bounded contexts
and between the application monolith and external subscribers (webhooks,
WebSocket clients).

## Naming Convention

`<EventName>.v<schemaVersion>.json`

Example: `AnalysisStarted.v1.json`. A breaking change requires a new
`.vN.json` file; the old file is kept for one major-version cycle per
[ADR-0025](../../adr/0025-versioning-and-release-strategy.md).

## Envelope

Every event uses the common envelope (`Envelope.v1.json`). Per-event
schemas describe only the `payload` shape; the envelope wraps it.

## Verification

`tests/contract/event-schemas.test.ts` asserts:

1. Every schema file is a valid JSON Schema (Draft 2020-12).
2. Sample fixtures in `fixtures/<EventName>.v<N>.example.json` validate
   against the corresponding schema.
3. Aggregate `emit*` calls in `src/server/contexts/**/domain/` reference
   only event names that have a schema.

## Coverage Status

This is an initial slice covering the highest-traffic events. The full
catalogue from `docs/ddd/08-domain-events.md` will be added incrementally
during Phase 4–9 of the implementation roadmap.

| Event                       | Schema present | Notes                              |
|-----------------------------|----------------|------------------------------------|
| (envelope)                  | yes            | shared by all events               |
| `UserRegistered`            | yes            | Identity & Access — Phase 1        |
| `UserDisabled`              | yes            | Identity & Access — Phase 1        |
| `ConversationIngested`      | yes            | Conversation Ingestion — Phase 2   |
| `ConversationSegmented`     | yes            | Conversation Ingestion — Phase 2   |
| `ConversationDeleted`       | yes            | Conversation Ingestion — Phase 2   |
| `AnalysisRequested`         | yes            | Conversation Ingestion — Phase 2   |
| `MediaUploaded`             | yes            | Multimodal Ingestion — Phase 2     |
| `MediaProcessed`            | yes            | Multimodal Ingestion — Phase 2     |
| `MediaPurged`               | yes            | Multimodal Ingestion — Phase 2     |
| `BundleDraftCreated`        | yes            | Model Management — Phase 3         |
| `BundlePromotedToShadow`    | yes            | Model Management — Phase 3         |
| `ShadowAnalysisCompleted`   | yes            | Model Management — Phase 3         |
| `BundlePromotedToActive`    | yes            | Model Management — Phase 3         |
| `BundleRolledBack`          | yes            | Model Management — Phase 3         |
| `CalibrationRecomputed`     | yes            | Model Management — Phase 3         |
| `AnalysisStarted`           | yes            | Cognitive Analysis                 |
| `AnalysisCompleted`         | yes            | Cognitive Analysis                 |
| `CognitiveElementDetected`  | yes            | Cognitive Analysis                 |
| `GraphNodeAdded`            | yes            | Cognitive Graph                    |
| `GraphEdgeFormed`           | yes            | Cognitive Graph                    |
| (others)                    | pending        | added per phase                    |
