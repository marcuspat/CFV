# 1. Record Architecture Decisions

- **Status:** Accepted
- **Date:** 2024-04-12
- **Deciders:** Core maintainers
- **Related:** ADR-0002

## Context

The Cognitive Fabric Visualizer is a non-trivial, polyglot system that spans a
TypeScript web application, a Python machine-learning stack, and three
heterogeneous data stores (PostgreSQL, Neo4j, Redis). Multiple contributors
make decisions over time that shape the architecture, and without a durable
record those decisions are lost to chat history, commit messages, and tribal
knowledge. New contributors then re-litigate settled debates or, worse,
unknowingly violate constraints that were chosen for sound reasons.

## Decision

We will record every architecturally significant decision as an Architecture
Decision Record (ADR) in `docs/adr/`, using the [MADR][madr] format. ADRs are
sequentially numbered, immutable once accepted, and tracked through pull
request review.

[madr]: https://adr.github.io/madr/

A decision is *architecturally significant* when it:

1. Affects more than one bounded context.
2. Constrains a cross-cutting concern (security, performance, observability,
   data privacy).
3. Selects an external dependency that is hard to replace (databases,
   ML providers, frontend frameworks).
4. Defines an integration contract with a partner system.
5. Establishes a coding standard, testing standard, or architectural pattern
   that contributors are expected to follow.

## Consequences

### Positive

- Future contributors can understand the *why* behind the system.
- Discussions converge faster because settled debates are documented.
- Onboarding is accelerated through a curated reading list.
- The repository becomes self-documenting at the architectural level.

### Negative

- Authoring an ADR adds friction to architectural changes.
- ADRs can drift from the implementation if not periodically audited.

### Neutral

- ADRs are versioned alongside code; rebranching does not invalidate them.

## Alternatives Considered

### Confluence / wiki pages

Rejected: documentation lives outside the source tree, drifts faster, and
permissions limit access for new contributors.

### Long-form `ARCHITECTURE.md`

Rejected: a monolithic document does not capture the *evolution* of decisions
and tends to collapse multiple decisions into a single narrative.

## Compliance and Verification

- Pull requests that change the architecture (a new bounded context, a new
  data store, a new cross-cutting library) require an accompanying ADR.
- The reviewer checklist in `docs/CONTRIBUTING.md` enforces this.
- Quarterly architecture audit verifies that the implementation reflects the
  set of `Accepted` ADRs.

## References

- Michael Nygard, [*Documenting Architecture Decisions*][nygard].

[nygard]: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
