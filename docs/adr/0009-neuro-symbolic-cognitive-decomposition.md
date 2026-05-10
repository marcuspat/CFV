# 9. Neuro-Symbolic Cognitive Decomposition

- **Status:** Accepted
- **Date:** 2024-05-06
- **Deciders:** Core maintainers, ML lead
- **Related:** ADR-0008, ADR-0010, ADR-0013, ADR-0023

## Context

Pure LLM-based decomposition is opaque, unstable across runs, and difficult
to audit. Pure symbolic decomposition (rule-based or knowledge-graph driven)
is brittle and does not capture the linguistic richness of free-form
conversation. The product requires both **accuracy** (to hit the per-
dimension targets) and **explainability** (users must be able to understand
why a passage was tagged as creative synthesis rather than logical
inference).

A neuro-symbolic approach pairs an LLM-based neural component for natural-
language interpretation with a symbolic component for constraint
satisfaction, evidence linking, and rule application. The symbolic component
is the source of truth for explanations.

## Decision

We adopt a **neuro-symbolic decomposition pipeline** with the following
shape:

1. **Neural stage.** The ensemble (ADR-0008) classifies each conversation
   turn into one or more cognitive dimensions, returning per-dimension
   confidence and supporting spans.
2. **Symbolic stage** (`src/ml/symbolic_reasoning.py`).
   - Applies hard constraints (e.g. "factual retrieval must reference an
     entity in the knowledge graph or external source").
   - Applies soft rules with weights (e.g. "meta-cognition often follows
     uncertainty markers").
   - Resolves overlapping tags using a constraint-solver pass.
3. **Cognitive elements** are emitted as immutable value objects with a
   stable identity, supporting span, dimension, confidence, and a list of
   evidence references (ADR-0023).
4. **Explainability** (`src/ml/explainability.py`,
   `src/ml/explanation_exporter.py`) renders the symbolic derivation as a
   human-readable trace: which rules fired, which evidence was cited, which
   members agreed.

## Consequences

### Positive

- Hits accuracy targets that pure neural cannot.
- Explanations are first-class outputs, not post-hoc rationalisations.
- The symbolic layer is the natural place to encode domain expertise from
  cognitive scientists.

### Negative

- Two pipelines to maintain.
- Symbolic rules must be versioned and tested; rule drift is a real risk.
- Constraint solving adds latency; we cap its budget per request.

### Neutral

- The symbolic layer is decoupled from the neural ensemble, so each can
  evolve independently.

## Alternatives Considered

### Pure LLM with chain-of-thought

Rejected: explanations are not faithful to the underlying decision; users
cannot audit them.

### Pure symbolic / rules engine

Rejected: brittle on free-form conversation; cannot reach accuracy
targets.

### Distillation of neural outputs into a single model

Considered for future cost optimisation; not adopted for v1.

## Compliance and Verification

- Per-dimension accuracy is reported by the daily eval suite (ADR-0008).
- Each rule has an associated test case; rule changes require a regression
  baseline update.
- Explainability outputs are checked by a frontend snapshot test in
  `src/client/`.

## References

- `src/ml/cognitive_decomposer.py`
- `src/ml/symbolic_reasoning.py`
- `src/ml/explainability.py`
