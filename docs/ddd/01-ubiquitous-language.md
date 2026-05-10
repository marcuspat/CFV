# 01. Ubiquitous Language

The Ubiquitous Language is the shared vocabulary of cognitive scientists,
analysts, product managers, and engineers working on CFV. Code, tests,
documentation, UI copy, and conversation between team members must use these
terms consistently. When a term changes, every surface changes.

If you find a term in code that is not in this glossary, you have found
either a missing entry to add or a misuse to fix.

## Conventions

- Terms are listed alphabetically within each category.
- Each entry has: **definition**, **synonyms (deprecated)**, and **where it
  lives** (which bounded context primarily owns it).
- "(deprecated)" terms must not appear in new code.

## Domain Concepts

### Analysis
A single, end-to-end run of the cognitive analysis pipeline over one
conversation, producing cognitive elements, a cognitive graph, and a
confidence-scored set of threads. An Analysis is an aggregate (see §06) and
a long-running process (see ADR-0012).
Synonyms (deprecated): "run", "job".
Owner: **Cognitive Analysis** context.

### Analysis Bundle
A frozen, versioned set of model artefacts (ensemble prompt templates,
symbolic rule pack, DGNN checkpoint, calibration parameters) used by an
Analysis. Recorded on every analytical artefact for auditability. See
[ADR-0022](../adr/0022-feedback-loop-and-model-retraining.md).
Owner: **Model Management** context.

### Analysis Session
A user-facing handle to one or more Analyses on the same conversation,
typically used when re-running with different parameters.
Owner: **Conversation Ingestion** context.

### Cognitive Dimension
One of the four axes along which conversations are decomposed:
- **Factual Retrieval** — information and data sharing.
- **Logical Inference** — reasoning and conclusion-drawing.
- **Creative Synthesis** — novel ideas and innovations.
- **Meta-Cognition** — self-reflection and strategy.

These four are the only dimensions; new dimensions require an explicit ADR.
Owner: **Cognitive Analysis** context.

### Cognitive Element
An immutable assertion that a particular **Span** of a conversation
exhibits a particular **Cognitive Dimension** with an associated
**Confidence**. Cognitive Elements are the atomic units that flow into the
Cognitive Graph.
Owner: **Cognitive Analysis** context.

### Cognitive Fabric
The metaphorical name for the woven structure of cognitive threads through
a conversation; the product is named for it. Used in marketing copy and
domain conversation; not directly modelled as a code type.
Owner: shared.

### Cognitive Graph
The graph whose nodes are Cognitive Elements and whose edges are typed
relationships (`SUPPORTS`, `CONTRADICTS`, `EXTENDS`, `REFERENCES`).
Persisted in Neo4j. See ADR-0005.
Owner: **Cognitive Graph** context.

### Confidence
A calibrated estimate, in [0, 1], that an analytical assertion is correct
on a held-out evaluation set. See
[ADR-0013](../adr/0013-confidence-scoring-and-uncertainty.md).
Synonyms (deprecated): "score", "probability".
Owner: shared, defined in **Cognitive Analysis**.

### Conversation
The unit of input. May be sourced from text, audio, or video and is
normalised into a sequence of **Turns**. Conversations are persisted in
PostgreSQL; their cognitive analysis lives in Neo4j.
Owner: **Conversation Ingestion** context.

### Dimension
Shorthand for **Cognitive Dimension**. Acceptable in code (`dimension`,
`Dimension`) but never alone in user-facing copy, where the full term
prevents ambiguity with mathematical "dimensions" of embeddings.

### Element
Shorthand for **Cognitive Element**. Acceptable in code; full term
preferred in documentation.

### Ensemble
The set of language-model members participating in cognitive
decomposition. See [ADR-0008](../adr/0008-ensemble-llm-strategy.md). Always
"the Ensemble" in UI copy when referring to ours; "an ensemble" generally.
Owner: **Cognitive Analysis** context.

### Evidence
The supporting Span(s) and any cited external references that justify a
Cognitive Element. Required for the explainability bundle (ADR-0023).
Owner: **Cognitive Analysis** context.

### Fabric Map
The canonical 3D rendering of a Cognitive Graph. The product UI uses
"Fabric Map" in headings.
Owner: **Visualization** context.

### Fusion
The process of combining Ensemble member outputs into a single Cognitive
Element with a fused confidence. Implemented by the
[Fusion Engine](../adr/0008-ensemble-llm-strategy.md).
Owner: **Cognitive Analysis** context.

### Member
A single language-model participant in the Ensemble (e.g. GPT-4, Claude-3).
Owner: **Cognitive Analysis** / **Model Management**.

### Multimodal Input
Audio, video, or other non-text input that the Multimodal Pipeline
preprocesses into the canonical Conversation shape.
Synonyms (deprecated): "media".
Owner: **Multimodal Ingestion** context.

### Non-Verbal Feature
Annotation derived from audio/video preprocessing — silence durations,
overlap, prosodic emphasis, optional facial-expression tags. Fed into the
symbolic stage as features.
Owner: **Multimodal Ingestion**.

### Predicted Edge
An edge proposed by the DGNN thread predictor that has not yet been
realised by an observed cross-turn reference. Always rendered with a
visually distinct style and a confidence.
Owner: **Cognitive Graph**.

### Segment
A coherent sub-stretch of a Conversation, typically a topic or sub-task
boundary. Produced by the Dialogue Segmenter (ADR-0014). The Cognitive
Decomposer operates on Segments, not raw Turns.
Owner: **Conversation Ingestion**.

### Span
A `(turnId, startOffset, endOffset)` triple identifying a specific stretch
of conversation text. The atom of evidence.
Owner: shared.

### Speaker
The identified author of one or more Turns. May be a real user or a
diarisation-derived synthetic speaker label.
Owner: **Conversation Ingestion**.

### Symbolic Rule
A weighted, declarative rule applied during the symbolic stage of cognitive
decomposition (ADR-0009). Versioned in the Analysis Bundle.
Owner: **Cognitive Analysis** / **Model Management**.

### Tenant
An organisation in a multi-tenant deployment. All data is scoped by
`tenantId`. Cross-tenant access is forbidden at the repository layer
(ADR-0021).
Owner: **Identity & Access**.

### Thread
A coherent trajectory through the Cognitive Graph: a sequence of
Cognitive Elements connected by edges that the DGNN identifies as
belonging to the same line of reasoning. **Not** the same as an OS thread.
Synonyms (deprecated): "trajectory", "path".
Owner: **Cognitive Graph**.

### Turn
A single contiguous utterance attributed to one Speaker within a
Conversation. The smallest unit of conversation we attribute.
Owner: **Conversation Ingestion**.

### Visualization Snapshot
A point-in-time export of a Fabric Map (PNG, SVG, interactive HTML) plus
provenance metadata (ADR-0023). Stable, shareable artefact.
Owner: **Visualization** context.

## Process Concepts

### Cognitive Analysis Pipeline
The end-to-end flow from ingestion through preprocessing, segmentation,
decomposition, fusion, symbolic pass, graph update, and thread prediction.
Modelled as an event-driven saga (ADR-0012, §13).
Owner: **Cognitive Analysis** context.

### Analysis Stage
A discrete step within the pipeline (Ingest, Segment, Decompose, Fuse,
Symbolic, GraphUpdate, ThreadPredict, Notify).
Owner: **Cognitive Analysis**.

### Shadow Analysis
A re-run of the pipeline using a different Analysis Bundle without
displacing the active one. Used for evaluating release candidates
(ADR-0022).
Owner: **Model Management**.

### Feedback Loop
The closed cycle from user correction through `FeedbackEntry`, eval-set
curation, and bundle re-training (ADR-0022).
Owner: **Feedback & Learning** context.

## Quality and Health Concepts

### Calibration
The mapping from raw model probability to a meaningful Confidence value
(ADR-0013). Recomputed weekly.
Owner: **Cognitive Analysis** / **Model Management**.

### Drift
Statistical change in input distribution or output accuracy versus the
release baseline. Monitored continuously; >2% triggers an alert.
Owner: **Model Management**.

### Degraded Analysis
An Analysis whose Ensemble lost a Member to budget or outage and is
therefore returned with a `degraded` flag and reduced confidence
(ADR-0008).
Owner: **Cognitive Analysis**.

## Forbidden Terms (do not use)

The following terms appeared in early prototypes and must not be used in
new code or documentation. They are listed here so that grep finds them.

- "intent" used for Cognitive Dimension — use **Dimension**.
- "thought" — too vague; use **Cognitive Element** or **Thread**.
- "node" outside a graph context — use **Cognitive Element** in domain
  prose; "node" is acceptable in graph/Neo4j code.
- "score" without qualification — say what kind of score
  (**Confidence**, ROUGE-L, F1).
- "model" without qualification — say **Ensemble Member**, **DGNN Model**,
  **Analysis Bundle**, etc.
