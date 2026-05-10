# 22. Feedback Loop and Model Retraining

- **Status:** Accepted
- **Date:** 2024-06-21
- **Deciders:** Core maintainers, ML lead
- **Related:** ADR-0008, ADR-0009, ADR-0010, ADR-0013

## Context

Cognitive analysis is not a static problem. Domain conventions evolve, new
conversation styles emerge, and our calibration drifts as the underlying
model providers update their weights. Without a structured feedback loop,
the system's accuracy degrades silently between releases. The repository
already includes `src/ml/feedback_system.py`; we want to define the
discipline around it.

## Decision

We adopt a **closed feedback loop** with explicit data flows from user
interaction back into model improvement:

1. **Feedback channels.**
   - **Inline correction.** A user can mark a cognitive element as wrong
     and provide the corrected dimension; the correction becomes a
     `FeedbackEntry` aggregate.
   - **Bulk review.** Analysts can review and re-label batches of
     elements via a dedicated review UI.
   - **Implicit signals.** Hover dwell, edge-acceptance rate, and export
     selections are aggregated as weak signals.
2. **Storage and consent.** Feedback is stored per tenant and **never**
   used for cross-tenant model training without explicit opt-in
   (ADR-0021). Per-tenant fine-tuning is an explicit product surface, not
   a default.
3. **Eval set evolution.** Curated feedback batches are promoted to the
   global held-out evaluation corpus by the ML team, not automatically.
4. **Retraining cadence.**
   - Calibration recomputed weekly using fresh feedback.
   - Symbolic-rule weight tuning monthly.
   - DGNN model retrained quarterly or when accuracy drifts >2% from
     baseline.
5. **Model registry.** Every model artefact (ensemble prompt template,
   symbolic rule pack, DGNN checkpoint) is versioned and addressable. A
   release ships a frozen *bundle* of these versions; rollback is a
   bundle re-pin.
6. **Shadow deployment.** A new model bundle runs in shadow against
   production traffic, comparing outputs to the active bundle. Promotion
   to active requires meeting the per-dimension accuracy floor and
   passing manual review.
7. **Auditability.** Each analytical artefact carries the bundle version
   used. Re-running an analysis with a different bundle is supported and
   labelled as such.

## Consequences

### Positive

- Accuracy improves continuously rather than degrading silently.
- Users see their corrections taken seriously.
- Rollback is cheap and explicit.

### Negative

- Curating training data is real ongoing work.
- Shadow deployment adds inference cost.
- Privacy boundaries on training data are strict and limit some
  learning opportunities.

### Neutral

- We do not perform online learning in v1.

## Alternatives Considered

### Online learning

Rejected: hard to keep stable, hard to explain regressions, hard to roll
back.

### No feedback loop

Rejected: silent accuracy drift is incompatible with the product's
headline claims.

## Compliance and Verification

- Eval-set composition is tracked; growth from feedback is auditable.
- Shadow-deployment results are logged and reviewed before promotion.
- A test asserts that bundle version is recorded on every analytical
  artefact.

## References

- `src/ml/feedback_system.py`
- ADR-0008, ADR-0009, ADR-0010, ADR-0013
