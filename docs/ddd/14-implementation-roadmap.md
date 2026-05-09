# 14. Implementation Roadmap

This roadmap turns the model in §01–§13 into an executable plan for
aligning the codebase with DDD. It is sequenced so that each phase
delivers value on its own, never blocks on a later phase, and can be
paused without leaving the codebase in a worse state than it started.

The roadmap is not a schedule. It assigns shape, not dates.

## Guiding Principles

1. **Strangler-fig, not big-bang.** Introduce new structure alongside
   existing code; migrate one bounded context at a time; delete the old
   shape only after the new one is proven.
2. **Core first.** Cognitive Analysis and Cognitive Graph are the
   highest-yield contexts to model deeply ([§05](05-subdomains.md)).
3. **No new functionality during structural moves.** Refactor and
   feature work do not mix in the same change.
4. **Tests are the contract.** Every move is fenced by characterisation
   tests written *before* the move.
5. **Each phase has an exit criterion.** Phases close on observable
   facts, not on calendar.

## Phase 0 — Foundations (Documentation and Tooling)

**Goal.** Make the model discoverable and the standards enforceable.

- [ ] Land `docs/adr/` and `docs/ddd/` (this set).
- [ ] Add `dependency-cruiser` (TS) and `import-linter` (Python) configs
      that enforce the dependency-direction rule from ADR-0016 — initially
      in **warn** mode.
- [ ] Add an OpenAPI generator step in CI; commit the schema; fail on
      drift.
- [ ] Add a JSON Schema directory `docs/schemas/events/` and a contract
      test that asserts every emitted domain event matches its schema.
- [ ] Set up the canonical TS↔Python contract (Protobuf or JSON Schema
      decision documented in an implementation ADR).
- [ ] Pre-commit hook that flags first-party code in unsupported
      languages (ADR-0004).

**Exit criterion.** A new contributor can read `docs/ddd/README.md` and
arrive at a coherent mental model in under an hour.

## Phase 1 — Identity & Access (Generic, Lowest Risk)

**Goal.** Migrate the simplest bounded context first to validate the
hexagonal layout end-to-end.

- [ ] Create `src/server/contexts/identity/{domain,application,infrastructure,interfaces}/`.
- [ ] Move `src/server/middleware/auth.ts` and `src/server/routes/auth.ts`
      into the new layout.
- [ ] Introduce `User`, `Tenant`, `RefreshToken` aggregates and the
      `UserRepository`, `TenantRepository`, `RefreshTokenRepository`
      ports.
- [ ] Implement `AuthorisationPolicy` and the `@requires(scope)`
      decorator (ADR-0007).
- [ ] Add the per-repository tenant-isolation test.

**Exit criterion.** All `/api/v1/auth/*` routes are served from the new
context; the dependency-cruiser rule for this context is in **error**
mode.

## Phase 2 — Conversation Ingestion + Multimodal Ingestion

**Goal.** Stabilise the input side; emit canonical events the rest of
the system can consume.

- [ ] Move conversation routes and ML preprocessing entry points into
      `contexts/conversation-ingestion/` and `contexts/multimodal/`.
- [ ] Define `Conversation`, `Turn`, `Speaker`, `Segment`,
      `MediaUpload` aggregates.
- [ ] Implement the **transactional outbox** in PostgreSQL.
- [ ] Wire the `DialogueSegmenter` port with a Rasa adapter and a
      heuristic fallback adapter (ADR-0014).
- [ ] Emit `ConversationIngested`, `ConversationSegmented`,
      `AnalysisRequested`, `MediaProcessed`, `MediaPurged`.
- [ ] PII redaction at the logging boundary (ADR-0019, ADR-0021).

**Exit criterion.** All conversation lifecycle is observable as events
in the outbox; chaos test for "Rasa unavailable" passes.

## Phase 3 — Model Management (Foundation for Analysis Bundles)

**Goal.** Make `AnalysisBundle` a first-class object so the next phases
can record bundle versions on every artefact.

- [ ] Create `contexts/model-management/`.
- [ ] Define the `AnalysisBundle` aggregate (DRAFT/SHADOW/ACTIVE/RETIRED).
- [ ] Build the admin REST routes for bundle lifecycle.
- [ ] Implement the `ModelRegistry` port that Cognitive Analysis will
      consume.
- [ ] Backfill: every existing analysis is associated with a
      `legacy-baseline` bundle.

**Exit criterion.** Cognitive Analysis can read the active bundle via a
port; bundle promotion / rollback is tested end-to-end.

## Phase 4 — Cognitive Analysis (CORE)

**Goal.** Land the deepest model in the codebase. Do this only after
Phases 0–3 are stable.

- [ ] Create `contexts/cognitive-analysis/`.
- [ ] Define the `Analysis` aggregate with stages and the saga
      coordinator (§13).
- [ ] Implement the domain services: `CognitiveDecomposer`,
      `FusionEngine`, `SymbolicReasoner`, `ConfidenceCalibrator`,
      `UncertaintyQuantifier`.
- [ ] Move `src/ml/cognitive_decomposer.py`, `fusion_engine.py`,
      `symbolic_reasoning.py`, `confidence_scorer.py` behind their
      respective ports; ML adapters live in `infrastructure/`.
- [ ] LLM provider ACL adapters (`OpenAiLlmClient`,
      `AnthropicLlmClient`) implementing `LanguageModelClient`.
- [ ] Saga error handling with degraded-completion path.
- [ ] Emit the full event catalogue (§08) for analysis.

**Exit criterion.** `AnalysisStarted` → `AnalysisCompleted` traces are
observable end-to-end with `correlationId` (ADR-0019); shadow eval set
is pinned and reproducible.

## Phase 5 — Cognitive Graph (CORE)

**Goal.** Apply the same discipline to the Neo4j-backed graph context.

- [ ] Create `contexts/cognitive-graph/`.
- [ ] Define the `CognitiveGraph` aggregate with optimistic-concurrency
      versioning across PostgreSQL metadata + Neo4j data.
- [ ] Implement domain services: `EdgeFormer`, `ThreadDetector`,
      `GraphEvolver`.
- [ ] DGNN adapter implementing the model port (ADR-0010).
- [ ] Predicted-edge lifecycle (`ProposePredictedEdge` →
      `RealisePredictedEdge`).
- [ ] Per-conversation Redis snapshot cache with explicit invalidation
      on `GraphNodeAdded` / `GraphEdgeFormed`.

**Exit criterion.** All graph mutations are event-driven; predicted
edges and observed edges are visually distinguishable in the snapshot
contract test.

## Phase 6 — Visualization

**Goal.** Make the visualisation a derived view (ADR-0024) and
formalise the export catalogue (ADR-0023).

- [ ] Create `contexts/visualization/`.
- [ ] Define `VisualizationSnapshot` aggregate and `Provenance` value
      object.
- [ ] Implement `LayoutPlanner` and `ExportComposer` domain services.
- [ ] Format adapters (PNG/SVG/Interactive HTML/JSON/CSV) in
      `infrastructure/`.
- [ ] Frontend: introduce TanStack Query, the WebSocket adapter, and
      Zustand stores per ADR-0024. Three.js scene becomes derived.

**Exit criterion.** Snapshot tests prove that scene re-renders are
bounded; round-trip JSON export ↔ import preserves the graph.

## Phase 7 — Real-time Streaming

**Goal.** Replace any direct WebSocket emission with the event-derived
DTO layer (§08).

- [ ] Create `contexts/streaming/`.
- [ ] Implement `Subscription`, `Channel`, `Frame` and the consumer that
      routes domain events to subscribers.
- [ ] Backpressure with bounded buffers and `STATE_RESYNC_REQUIRED`
      signals.
- [ ] Token-based authorisation on handshake; connection close on token
      expiry (ADR-0007).

**Exit criterion.** Every public WebSocket frame has an upstream domain
event with a deterministic mapping.

## Phase 8 — Insights & Reporting

**Goal.** Build the read-side context as a CQRS projection consumer.

- [ ] Create `contexts/insights/`.
- [ ] Define `Pattern`, `Insight`, `Report`, `ReportTemplate`.
- [ ] Implement `PatternDetector` and `ReportComposer` domain services.
- [ ] Projections kept in sync via domain-event consumers.

**Exit criterion.** A demo report can be generated from a real analysis;
contents are reproducible from `(analysisId[], bundleVersion)`.

## Phase 9 — Feedback & Learning + Notifications & Webhooks

**Goal.** Close the loop and add reliable outbound delivery.

- [ ] Create `contexts/feedback/` and `contexts/notifications/`.
- [ ] `FeedbackEntry`, `EvalSetEntry` aggregates.
- [ ] Eval-set promotion saga that hands off to Model Management.
- [ ] Webhook delivery with retries and HMAC signing.

**Exit criterion.** Feedback recorded by a user can be promoted to the
eval set, used for shadow analysis, and influence a bundle promotion —
all observable in events.

## Phase 10 — Hardening

**Goal.** Move the structural rules from **warn** to **error**, harden
operational posture, and audit the model.

- [ ] Dependency-cruiser / import-linter rules in **error** mode for
      every context.
- [ ] CI gate on event-schema drift, OpenAPI drift, and TS↔Python
      schema drift.
- [ ] Quarterly architecture audit
      ([ADR-0001](../adr/0001-record-architecture-decisions.md)) — first run.
- [ ] Chaos suite (ADR-0018) added to weekly cadence.
- [ ] GDPR erasure end-to-end test added to CI (ADR-0021).

**Exit criterion.** A new contributor can implement a feature spanning
two contexts using *only* the published ports and events, without
needing tribal knowledge.

## Cross-Cutting Tasks (Run Throughout)

- **Documentation upkeep.** Each merged ADR or DDD change updates the
  index and any back-references in the same change.
- **Onboarding deck.** Maintain a one-page overview that links to
  `docs/ddd/02-domain-vision.md` and `docs/ddd/03-strategic-design-context-map.md`.
- **Quarterly model review.** Walk the bounded-context map, look for
  drift, schedule splits/merges per [§03](03-strategic-design-context-map.md).
- **Definition of Done.** Each story closes with: aggregate(s) named,
  invariants documented, events emitted, ports defined, repository
  tests for tenant isolation, and a reviewer's confirmation that the
  ubiquitous language is respected.

## Risks and Mitigations

| Risk                                          | Mitigation                                           |
|-----------------------------------------------|------------------------------------------------------|
| Refactor backlog grows without delivering value | Each phase delivers an end-to-end vertical slice. |
| Tests still pass while domain language drifts | Add a glossary lint that scans code/docs for forbidden terms (§01). |
| Python-side rigour lags TS-side rigour        | `import-linter` and per-context import checks cover Python; ML team owns the Python side of the bundle. |
| Bundle promotion creates instability          | Shadow deployment + automated eligibility check + manual promotion gate (ADR-0022). |
| Observability gaps mask saga failures         | Every event carries `correlationId`; weekly chaos test exercises stage failures. |

## Done When

The roadmap is *done* when:

1. Every bounded context lives under `src/server/contexts/<name>/` (TS)
   or `src/ml/contexts/<name>/` (Python) with the four sub-folders.
2. Every aggregate listed in [§06](06-aggregates-and-entities.md) is
   loadable and savable through its repository port.
3. Every event listed in [§08](08-domain-events.md) is emitted, schema-
   validated, and consumable by at least one downstream context.
4. The dependency-direction rule is in **error** mode.
5. The four cognitive dimensions in [§01](01-ubiquitous-language.md)
   appear identically across code, tests, API responses, and UI.

The model never freezes; it should be revisited at every quarterly
audit. The roadmap, by contrast, is finite.
