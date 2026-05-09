# 05. Subdomains

A subdomain is a problem space within the overall domain. DDD distinguishes
**core**, **supporting**, and **generic** subdomains because the right
investment level differs sharply across them. Investing core-domain effort
in a generic subdomain (e.g. building bespoke auth from scratch) is one of
the most common ways teams burn budget without moving customer-visible
metrics.

This document classifies CFV's subdomains, justifies the classification,
and gives explicit investment guidance.

## Classification Summary

| Subdomain                        | Classification | Bounded Contexts                                  |
|----------------------------------|----------------|---------------------------------------------------|
| Cognitive Decomposition          | **Core**       | Cognitive Analysis                                |
| Cognitive Graph Evolution        | **Core**       | Cognitive Graph                                   |
| Conversation Lifecycle           | Supporting     | Conversation Ingestion                            |
| Multimodal Preprocessing         | Supporting     | Multimodal Ingestion                              |
| 3D Visualization                 | Supporting     | Visualization                                     |
| Real-time Delivery               | Supporting     | Real-time Streaming                               |
| Pattern Insights & Reporting     | Supporting     | Insights & Reporting                              |
| Model Lifecycle Management       | Supporting     | Model Management                                  |
| Feedback Capture & Curation      | Supporting     | Feedback & Learning                               |
| Identity & Access                | Generic        | Identity & Access                                 |
| Notifications & Webhooks         | Generic        | Notifications & Webhooks                          |

## Core Subdomains

### Cognitive Decomposition

> Decomposing a conversation into the four cognitive dimensions with
> calibrated confidence is the single thing CFV does that no commodity
> product does.

**Why core.** Differentiation test (no competitor offers this with our
accuracy and explainability commitments). Investment-yield test (every 1%
of accuracy improvement directly improves the headline metric).

**Investment guidance.**
- Apply the strongest DDD modelling.
- Maintain the richest test coverage (unit, integration, accuracy, chaos).
- Prefer building over buying. External providers are *components* hidden
  behind ACLs (ADR-0017), not substitutes for the model.
- Highest documentation standard.

### Cognitive Graph Evolution

> Predicting and rendering the temporal evolution of cognitive threads is
> the second pillar of the product's differentiation.

**Why core.** Differentiation (DGNN-based threading is unusual in the
domain). Yield (better thread prediction → better visual narrative → user
retention).

**Investment guidance.**
- DGNN model is a first-party asset (ADR-0010), not a vendor commodity.
- Graph schema and edge-confidence semantics are stable contracts;
  changes require an ADR.
- Visual representation of confidence is non-negotiable (ADR-0013).

## Supporting Subdomains

These exist to make the core domains usable in production. They warrant
careful design but are **not** where we invent new patterns.

### Conversation Lifecycle

Standard CRUD-with-state-machine. Use straightforward DDD aggregates;
prefer well-known patterns over invention. The complexity is in
*correctness* (idempotent ingestion, segment boundaries, retention) not
in modelling novelty.

### Multimodal Preprocessing

ASR/diarisation pipeline with non-verbal feature extraction. The hard part
is integrating provider quirks (ADR-0017), not domain modelling. Push as
much logic as possible into well-tested adapters.

### 3D Visualization

The 3D experience is a major UX differentiator, but the *domain
modelling* is straightforward (a graph rendered in 3D). Engineering
complexity lives in performance, not in domain semantics. The
specialised expertise is in rendering and frontend state (ADR-0011,
ADR-0024), not in the domain layer.

### Real-time Delivery

Operationally critical, conceptually thin. Subscriptions, channels,
backpressure. Reuse existing patterns; do not invent.

### Pattern Insights & Reporting

Rich downstream domain that derives value from the core graph. Treat as a
read-side service consuming the open-host query API (ADR-0023). May grow
into a core differentiator later if "insights" becomes the headline
product surface.

### Model Lifecycle Management

Bundle versioning, shadow deployment, rollback. The shape is similar to
ML-platform tooling at other companies; we use the same patterns rather
than inventing.

### Feedback Capture & Curation

Standard CQRS-friendly write model with eventual eval-set promotion.
Discipline (privacy, consent — ADR-0021) matters more than novelty.

## Generic Subdomains

### Identity & Access

Use mature standards (JWT, OIDC future-compat) and a small policy layer.
Do not write a custom OAuth server. Buy or open-source-leverage where
sensible. The investment is in correctness and security review, not in
modelling.

### Notifications & Webhooks

Reliable outbound delivery is a solved problem. Use queue + retry
patterns; do not invent.

## How Classification Drives Decisions

| Decision                                  | Core                       | Supporting                 | Generic                     |
|-------------------------------------------|----------------------------|----------------------------|-----------------------------|
| Build vs buy                              | Build                      | Buy where commodity        | Buy / leverage standard     |
| Modelling depth                           | Maximum                    | Adequate                   | Minimum                     |
| Test coverage requirement                 | Highest tier               | Standard tier              | Standard tier               |
| ADR threshold                             | Lowest (most decisions)    | Medium                     | Only when truly novel       |
| Prefer pattern fidelity vs pragmatism     | Fidelity                   | Pragmatism                 | Pragmatism                  |
| Acceptable churn                          | Low                        | Medium                     | High                        |
| Documentation depth                       | High                       | Medium                     | Reference + standards       |

## Reclassification Triggers

Subdomains can move. Watch for these triggers and update this document
through an ADR:

- **Generic → Supporting.** If we discover the off-the-shelf solution is
  insufficient *for our problem* (e.g. JWT alone is not enough; we need
  fine-grained capability tokens). The Identity & Access subdomain has
  drifted toward Supporting in some companies; we'd reclassify if the
  same happens here.
- **Supporting → Core.** If a supporting subdomain becomes the
  differentiator (e.g. Insights becomes the headline product, eclipsing
  the visualisation).
- **Core → Supporting.** If commoditisation eats our differentiation
  (unlikely in this domain near-term, but worth monitoring).

A reclassification ADR must justify the change with at least one of:
customer evidence, competitor change, or a shift in the vision
([§02](02-domain-vision.md)).
