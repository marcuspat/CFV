# 02. Domain Vision

A Domain Vision Statement (Evans, *Domain-Driven Design*, ch. 14) frames
*why* this product exists, *who* it is for, and *what about it warrants
deep modelling*. It is the single document that should change least over
the lifetime of the codebase. Everything else — bounded contexts,
aggregates, ADRs — derives from this vision.

## Vision Statement

> CFV makes the cognitive structure of human conversations **visible,
> auditable, and improvable**. By decomposing dialogue into a small,
> stable set of cognitive dimensions and weaving them into an interactive
> graph, CFV turns dialogue into evidence and evidence into insight — for
> teams that want to understand and improve how they think together.

## Who We Serve

Three primary audiences, in priority order:

1. **Knowledge workers and team leads** running meetings, interviews,
   workshops, and design reviews who want to understand *how the room
   thought*, not just *what was said*.
2. **Researchers** in education, organisational behaviour, and cognitive
   science who need quantitative scaffolding around qualitative
   conversational data.
3. **Process and innovation specialists** who need to identify
   bottlenecks, breakthroughs, and missing modes of thinking in
   collaborative work.

We are **not** primarily serving:

- Real-time speech analytics for sales/coaching (different latency and
  feature profile).
- General-purpose chatbots or assistants.
- Compliance-only meeting recording.

## The Core Insight

Human reasoning in groups is composed of a small number of recurring
cognitive moves — recalling facts, inferring conclusions, synthesising
new ideas, and reflecting on the process itself. These moves are
**weavable**: they connect across speakers and across time. The product's
unique contribution is to model and visualise that weave.

## What Makes the Core Domain *Core*

The **Cognitive Analysis** + **Cognitive Graph** pair is the core domain.
Two tests confirm this:

1. **Differentiation.** No competitor decomposes conversation into a
   stable, audited four-dimensional model with confidence-weighted
   thread prediction. Removing this would remove the product.
2. **Investment yield.** Each marginal improvement in decomposition
   accuracy or thread-prediction precision moves customer-visible
   metrics. Improvements elsewhere (auth, exports) yield diminishing
   returns.

We invest accordingly: the core domain receives the most modelling
discipline, the most ML investment, and the most thorough testing
([ADR-0018](../adr/0018-test-strategy-pyramid-and-chaos.md)).

## What is Supporting

These contexts exist to enable the core domain but are not where we
differentiate:

- **Conversation Ingestion** — how data gets in.
- **Multimodal Ingestion** — preprocessing audio/video into the canonical
  shape.
- **Visualization** — how the result is rendered. The 3D experience is
  customer-facing; the *modelling* of that experience is straightforward.
- **Real-time Streaming** — operationally important; not a domain
  differentiator.
- **Insights & Reporting** — derived views over the core artefacts.
- **Model Management** — managing bundles, calibration, shadow runs.
- **Feedback & Learning** — closing the loop.

## What is Generic

These can use commodity solutions or off-the-shelf libraries:

- **Identity & Access** — JWT + RBAC ([ADR-0007](../adr/0007-jwt-authentication-and-rbac.md)).
- **Notifications / Webhooks** — straightforward publish-subscribe.
- **Audit Log** — append-only table; no domain richness.

See [§05 Subdomains](05-subdomains.md) for the precise classification and
investment guidance.

## Stability Promises

The vision is the **least-volatile** part of this documentation set.
Substantive changes require an ADR and a re-evaluation of the core domain
classification. Tactical changes (new aggregate, new event, new
repository) do **not** require a vision update.

## Anti-Goals

To keep the vision honest, we name what we explicitly will *not* do, even
if the technical capability is adjacent:

- We will not become a generic conversational analytics platform.
- We will not auto-summarise meetings as the headline feature; summaries
  are a derivative of the cognitive graph, not the product.
- We will not promise "objective truth" — every analytical artefact is
  uncertainty-bearing ([ADR-0013](../adr/0013-confidence-scoring-and-uncertainty.md)).
- We will not collapse the four cognitive dimensions to fewer or expand
  to more without explicit research validation and an ADR.

## How to Use This Document

If you are about to start work and your task does not connect to the
vision in one or two sentences, escalate before starting. If you are
reviewing a change and you cannot connect it to the vision, ask the
author to do so. The vision is the smell test for whether work belongs in
this codebase.
