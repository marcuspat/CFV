# 09. Domain Services

A **domain service** encapsulates a domain operation that does not
naturally belong on an entity or a value object — typically because it
involves several aggregates, an external policy, or a stateless
calculation that has its own meaning in the ubiquitous language. Domain
services are stateless and live in the `domain/` layer of their bounded
context.

## When to Use a Domain Service

Use one when:

1. The operation produces a result that is not the change of state of a
   single aggregate.
2. The operation involves coordinating across aggregates and you can
   express it without orchestrating infrastructure (orchestration of
   infrastructure belongs in **application services** — [§11](11-application-services.md)).
3. The operation has a name in the ubiquitous language that does not
   correspond to a noun (e.g. *Fuse* member outputs, *Calibrate*
   confidence, *Resolve* a span across modalities).

Do **not** use a domain service:

- For straightforward CRUD — that's repository work.
- For external integration — that's an adapter ([§12](12-anti-corruption-layers.md)).
- To work around an anaemic aggregate — fix the aggregate instead.

## Catalogue

### Cognitive Analysis

#### `CognitiveDecomposer`
Coordinates the per-segment ensemble invocation.
- **Inputs:** `Segment`, `AnalysisBundle`.
- **Output:** array of candidate `CognitiveElement`s with per-member
  confidence.
- **Why a service:** the operation is cross-aggregate (it reads
  `AnalysisBundle` and produces elements bound for `CognitiveGraph`)
  and has a name in the ubiquitous language.
- **Implementation seam:** `src/ml/cognitive_decomposer.py`.

#### `FusionEngine`
Combines per-member candidate elements into a single fused element with
calibrated confidence.
- **Inputs:** array of candidate elements with `EnsembleAgreement`.
- **Output:** fused `CognitiveElement` with composite `Confidence`.
- **Why a service:** stateless, pure, but central enough to the domain to
  warrant its own name. See [ADR-0008](../adr/0008-ensemble-llm-strategy.md).
- **Implementation seam:** `src/ml/fusion_engine.py`.

#### `SymbolicReasoner`
Applies the symbolic rule pack: hard constraints, soft weighted rules,
overlap resolution.
- **Inputs:** fused candidate elements, `RulePack`.
- **Output:** filtered/refined `CognitiveElement`s with rule-trace
  evidence.
- **Why a service:** rule application is the domain operation that
  underwrites explainability ([ADR-0009](../adr/0009-neuro-symbolic-cognitive-decomposition.md)).
- **Implementation seam:** `src/ml/symbolic_reasoning.py`.

#### `ConfidenceCalibrator`
Maps raw model probabilities to calibrated `Confidence` using the
parameters in the `AnalysisBundle`.
- **Inputs:** raw probability, `CalibrationParameters`.
- **Output:** `Confidence`.
- **Why a service:** central to the system's truthfulness ([ADR-0013](../adr/0013-confidence-scoring-and-uncertainty.md)).
- **Implementation seam:** `src/ml/confidence_scorer.py`.

#### `UncertaintyQuantifier`
Computes a `ConfidenceInterval` from member-variance and historical
calibration.
- **Implementation seam:** `src/ml/uncertainty_quantification.py`.

### Cognitive Graph

#### `EdgeFormer`
Decides whether two cognitive elements should be connected and with what
edge type and weight, given the current graph state and the DGNN model.
- **Inputs:** current graph snapshot, new cognitive elements.
- **Output:** sequence of new `GraphEdge`s and `PredictedEdge`s.
- **Why a service:** the edge-formation rules are a first-class domain
  concept; encapsulating them keeps the graph aggregate clean.

#### `ThreadDetector`
Clusters nodes into threads using the DGNN's outputs and emits
`ThreadEvolved` events when membership changes.
- **Implementation seam:** `src/ml/thread_predictor.py`.

#### `GraphEvolver`
Applies a batch of element-detected events to the graph aggregate as a
single coordinated update (add nodes, then form edges, then recompute
threads), respecting the aggregate's invariants.

### Conversation Ingestion

#### `DialogueSegmenter`
Translates Rasa output (or fallback heuristic output) into
`SegmentBoundary` value objects.
- **Why a service:** straddles Rasa adapter output and the
  `Conversation` aggregate; its result is a value object, not a state
  change ([ADR-0014](../adr/0014-rasa-for-dialogue-segmentation.md)).

#### `SpanResolver`
Maps token-level / word-timestamp offsets (from multimodal preprocessing)
to character-level `Span`s on the canonical `Conversation`.

### Multimodal Ingestion

#### `MediaCanonicaliser`
Coordinates ASR + diarisation + non-verbal feature extraction and emits a
single canonical `Conversation` and `NonVerbalFeatureSet`.
- **Why a service:** multi-step pure transformation; no aggregate
  naturally owns it.

### Identity & Access

#### `AuthorisationPolicy`
Pure domain rule: given an `actor`, an `action`, and a `resource`,
returns `Allowed | Denied(reason)`. The single point at which RBAC and
scope evaluation happens ([ADR-0007](../adr/0007-jwt-authentication-and-rbac.md)).

#### `TokenIssuer`
Constructs `AccessTokenClaims` and signs them. Sits in the domain because
the contents of the claims are domain decisions; the actual signing
adapter is infrastructure.

### Visualization

#### `LayoutPlanner`
Decides node positions in the 3D scene given graph topology and
viewport constraints. Pure function, runs off-thread (Web Worker per
ADR-0011).

#### `ExportComposer`
Composes a `VisualizationSnapshot` (or data export) from the cognitive
graph state plus provenance. Format-specific renderers are infrastructure
adapters; the composer is the domain coordinator.

### Insights & Reporting

#### `PatternDetector`
Searches a cognitive graph for recurring structural patterns (cycles of
factual-retrieval ↔ creative-synthesis, "innovation breakthroughs" as
high-confidence creative-synthesis nodes after meta-cognition runs).
- **Output:** `Insight` value objects.

#### `ReportComposer`
Combines analyses and patterns into a `Report` aggregate using a
`ReportTemplate`.

### Model Management

#### `BundlePromotionPolicy`
Pure rule: given a `ShadowDeployment`'s metrics, returns whether the
bundle is eligible to be promoted to active. Used by the application
service that performs the promotion.

#### `DriftDetector`
Compares production accuracy/distribution metrics to the active bundle's
baseline and emits a drift signal when the threshold is crossed
([ADR-0022](../adr/0022-feedback-loop-and-model-retraining.md)).

### Feedback & Learning

#### `FeedbackTriager`
Categorises a `FeedbackEntry` (e.g. mis-dimension vs. span correction
vs. evidence dispute) for downstream curation.

#### `EvalSetCurator`
Pure function from a batch of `FeedbackEntry`s and curation rules to a
proposed set of `EvalSetEntry`s for promotion.

### Real-time Streaming

This context is mostly orchestration; its only domain rule is the
**Subscription Authorization** check (resolved by `AuthorisationPolicy`
delegated from Identity & Access).

### Notifications & Webhooks

#### `DeliveryAttemptScheduler`
Pure rule that, given the prior `DeliveryAttempt` history, returns the
next attempt time using exponential backoff.

## Implementation Conventions

- Domain services are **stateless functions or singletons**. Constructors
  may take pure-function dependencies; they do not take repositories or
  HTTP clients.
- Inputs and outputs are **value objects or aggregate snapshots** —
  never DTOs from the public API.
- Each domain service has a **unit test** that exercises representative
  cases without touching infrastructure.
- The **application service** ([§11](11-application-services.md)) is
  responsible for fetching aggregates, calling the domain service, and
  saving aggregates.
