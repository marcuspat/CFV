# 14. Rasa for Dialogue Segmentation

- **Status:** Accepted
- **Date:** 2024-05-23
- **Deciders:** Core maintainers, ML lead
- **Related:** ADR-0008, ADR-0017

## Context

Cognitive analysis operates on *segments* — coherent units of conversation
on a single topic or sub-task — not on raw turns. Reliable segmentation
materially improves downstream accuracy because the LLM ensemble (ADR-0008)
performs better with bounded, focused context windows. Pure-LLM
segmentation works but is expensive (one extra LLM pass per turn) and
sometimes inconsistent across runs. A dedicated dialogue framework with
intent recognition, dialogue state tracking, and configurable segmentation
policies offered a better cost/quality trade-off in our evaluations.

## Decision

We use **Rasa** for dialogue segmentation and intent recognition as a
preprocessor to the cognitive decomposer:

1. **Scope.** Rasa is responsible only for: intent classification per turn,
   dialogue-act tagging, topic boundary detection, and speaker turn-taking
   normalisation. It does **not** perform cognitive decomposition.
2. **Custom NLU model.** A domain-specific Rasa NLU model is trained on
   our labelled corpus; the model is versioned in the model registry.
3. **Integration.** Rasa runs in the Python sidecar (ADR-0003). Output is
   converted to a stable internal `Segment` value object before crossing
   into the application services. No Rasa-specific types leak across
   that boundary (anti-corruption layer, ADR-0017).
4. **Fallback.** If Rasa is unavailable or returns low confidence, the
   pipeline falls back to a heuristic segmenter (turn-window with topic-
   shift detection) and flags the segment with `segmentationSource =
   "fallback"`.

## Consequences

### Positive

- Cheaper and more deterministic than an LLM-only segmentation pass.
- Segmentation quality is independently measurable and improvable.
- The intent and dialogue-act tags become useful features for the
  symbolic stage (ADR-0009).

### Negative

- Adds another ML dependency with its own training data, model registry
  entries, and operational profile.
- Rasa's release cadence is independent of ours; major upgrades require
  re-evaluation.

### Neutral

- We do not expose Rasa internals to the frontend or external API.

## Alternatives Considered

### LLM-only segmentation

Rejected: cost and consistency. Considered as a fallback only.

### Spacy + custom rules

Rejected: insufficient for dialogue-act tagging; Rasa's pipeline composes
better with domain-specific training.

### Cloud NLU service (provider X / Y)

Rejected: data residency and cost concerns; first-party Rasa fits better.

## Compliance and Verification

- Segmentation accuracy is reported in the daily eval suite alongside the
  cognitive metrics.
- A contract test verifies the boundary mapping from Rasa output to the
  internal `Segment` value object.
- Fallback path has a chaos test (ADR-0018) that disables Rasa.

## References

- ADR-0008: Ensemble LLM strategy
- ADR-0017: Anti-corruption layer
- `src/ml/conversation_analyzer.py`
