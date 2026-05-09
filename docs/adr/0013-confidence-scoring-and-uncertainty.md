# 13. Confidence Scoring and Uncertainty Quantification

- **Status:** Accepted
- **Date:** 2024-05-20
- **Deciders:** Core maintainers, ML lead
- **Related:** ADR-0008, ADR-0009, ADR-0010

## Context

Every cognitive element, every predicted edge, and every thread
classification is uncertain. Surfacing a single label without a confidence
qualifier mis-represents the analysis to users and silently propagates
spurious certainty into downstream visualisations and exports. Users have
told us in interviews that an *honest* analysis with confidence is more
trustworthy than a confident-but-wrong one.

The system already has multiple sources of signal that could feed a
confidence score: ensemble inter-member agreement (ADR-0008), per-member
self-reported confidence, symbolic-stage rule support (ADR-0009), DGNN
prediction probabilities (ADR-0010), and historical eval-set calibration.

## Decision

We treat **confidence** as a first-class value object on every analytical
artefact and adopt a unified scoring approach:

1. **Confidence is a float in [0, 1]** with documented semantics: it is a
   calibrated estimate of the probability that the assertion is correct on
   a held-out evaluation set.
2. **Composition.** Cognitive-element confidence combines ensemble
   agreement, per-member confidence, and symbolic rule support via a
   weighted aggregation function (`src/ml/confidence_scorer.py`).
3. **Calibration.** Raw model probabilities are calibrated (Platt scaling or
   isotonic regression) against the eval set; recalibration is a model-
   registry operation.
4. **Uncertainty band.** Where appropriate (e.g. predicted edges) we also
   expose an uncertainty band (low/median/high) via Bayesian or ensemble-
   variance estimation (`src/ml/uncertainty_quantification.py`).
5. **Visualisation.** Confidence drives line opacity, node halo, and a
   numeric tooltip. The 3D scene never renders a high-confidence and
   low-confidence assertion identically.
6. **API.** Every analytical DTO exposes `confidence` and, where
   applicable, `confidenceInterval`. Clients must display them.

## Consequences

### Positive

- Honest UX; trust is preserved when users encounter mistakes.
- Calibration creates a measurable quality lever separate from raw
  accuracy.
- Downstream systems (exports, alerts) can act on confidence thresholds.

### Negative

- Calibration must be maintained per dimension and per member; it is real
  ongoing ML work.
- Surfacing confidence everywhere increases UI complexity.

### Neutral

- We do not promise probabilistic correctness in the strict statistical
  sense (the ensemble + symbolic stack is not a single Bayesian model);
  we promise a calibrated, monotonically meaningful score.

## Alternatives Considered

### No confidence (single-label outputs)

Rejected: misrepresents the analysis and damages user trust on errors.

### Categorical confidence (low/medium/high)

Rejected: easy for the UI but loses information that downstream systems
need.

### Per-member confidence only, no fusion

Rejected: creates inconsistent behaviour across cognitive elements
depending on which members fired.

## Compliance and Verification

- Reliability diagrams (calibration curves) are produced for every release
  and stored as build artefacts.
- A contract test asserts that every public analytical DTO exposes
  `confidence`.
- The visualisation has a snapshot test demonstrating distinct rendering
  for low- and high-confidence elements.

## References

- `src/ml/confidence_scorer.py`
- `src/ml/uncertainty_quantification.py`
- ADR-0008: Ensemble LLM strategy
