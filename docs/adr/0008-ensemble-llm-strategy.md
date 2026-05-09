# 8. Ensemble LLM Strategy (GPT-4 + Claude-3)

- **Status:** Accepted
- **Date:** 2024-05-02
- **Deciders:** Core maintainers, ML lead
- **Related:** ADR-0009, ADR-0013, ADR-0017, ADR-0022

## Context

The product's headline accuracy claims — 92% factual retrieval, 85% logical
inference precision, 0.60 ROUGE-L for creative synthesis, 0.96 F1 for
meta-cognition — exceed what any single contemporary general-purpose LLM
delivers reliably across the four cognitive dimensions. Internal evaluations
showed that different frontier models have systematically different strengths
across the dimensions, and that a calibrated ensemble outperforms each
individual model on every dimension.

Ensembling also addresses a second concern: provider risk. A single-vendor
strategy creates outage risk and price/policy risk that we cannot mitigate.

## Decision

We adopt an **ensemble strategy** for cognitive analysis with at least two
frontier providers as first-class participants:

1. **Members.** OpenAI GPT-4 (or successor) and Anthropic Claude-3 (or
   successor) are the production members. Members can be added or removed by
   updating the model registry; the system must work with N≥2 members.
2. **Decomposition prompts.** Each cognitive dimension has a per-member
   prompt template versioned with the ensemble. Templates are stored in the
   model registry, not hard-coded.
3. **Aggregation.** Per-dimension outputs are fused by a calibrated voting /
   averaging strategy (`src/ml/fusion_engine.py`). Disagreements above a
   configured threshold trigger a tie-break pass with a designated arbiter
   model.
4. **Confidence.** Every ensemble output carries a confidence score derived
   from inter-member agreement and per-member self-reported confidence
   (ADR-0013).
5. **Provider isolation.** All provider interaction goes through the
   anti-corruption layer (ADR-0017). Domain code never sees a provider-
   specific response shape.
6. **Cost / latency budgets.** The ensemble is bounded by a per-request
   budget; if a member exceeds its share, its contribution is dropped and
   the result is flagged as degraded.

## Consequences

### Positive

- Higher accuracy than any single model.
- Provider redundancy at the analysis layer.
- Confidence scoring becomes principled rather than heuristic.

### Negative

- Higher per-request cost and latency than single-model inference.
- More complex prompt management; prompt drift across providers must be
  controlled.
- Disagreement adjudication adds tail latency.

### Neutral

- We pin frontier-model versions and treat upgrades as model-registry
  events with re-evaluation, not silent rolling upgrades.

## Alternatives Considered

### Single best-in-class model

Rejected: per-dimension accuracy targets cannot be met by a single current
model in our internal evaluations.

### Self-hosted open-weight model only

Rejected for v1: accuracy gap is currently too wide for the headline
metrics; revisit when open-weight models close the gap.

### Cascade (cheap model first, escalate on low confidence)

Considered as a complement, not a replacement: we may layer cascading on
top of the ensemble for cost optimisation in a future ADR.

## Compliance and Verification

- A shadow evaluation suite runs daily against a held-out conversation set
  and reports per-dimension accuracy.
- Provider keys are managed in the secrets store; no provider key may be
  hard-coded.
- The fusion engine is deterministic given fixed member outputs; tests
  pin a seeded fixture.

## References

- ADR-0009: Neuro-symbolic cognitive decomposition
- ADR-0013: Confidence scoring and uncertainty
- ADR-0017: Anti-corruption layer for LLM providers
- `src/ml/ensemble_llm.py`, `src/ml/fusion_engine.py`
