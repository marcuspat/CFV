# Domain-Driven Design Documentation

This directory contains the Domain-Driven Design (DDD) documentation for the
**Cognitive Fabric Visualizer (CFV)**. It is the canonical reference for the
domain model, the bounded-context map, the tactical patterns we use, and the
implementation roadmap that turns the model into code.

DDD adoption is itself an architectural commitment recorded in
[ADR-0002](../adr/0002-domain-driven-design-adoption.md).

## How to Read This Set

The documents progress from problem framing to model and finally to
implementation guidance. New contributors should read in order; experienced
contributors can jump to the relevant section.

| #   | Document                                                                          | Purpose                                                                |
|-----|-----------------------------------------------------------------------------------|------------------------------------------------------------------------|
| 01  | [Ubiquitous Language](01-ubiquitous-language.md)                                  | Canonical glossary of terms used in code, tests, and product copy.     |
| 02  | [Domain Vision](02-domain-vision.md)                                              | Why CFV exists, who it serves, what makes the core domain *core*.      |
| 03  | [Strategic Design — Context Map](03-strategic-design-context-map.md)              | Bounded contexts and their integration patterns.                       |
| 04  | [Bounded Contexts](04-bounded-contexts.md)                                        | Per-context responsibilities, owners, and APIs.                        |
| 05  | [Subdomains](05-subdomains.md)                                                    | Core / supporting / generic classification and investment guidance.    |
| 06  | [Aggregates and Entities](06-aggregates-and-entities.md)                          | Aggregate roots, invariants, transactional boundaries.                 |
| 07  | [Value Objects](07-value-objects.md)                                              | Catalogue of immutable, identity-less domain types.                    |
| 08  | [Domain Events](08-domain-events.md)                                              | Event catalogue, payload schemas, propagation rules.                   |
| 09  | [Domain Services](09-domain-services.md)                                          | Operations that don't fit naturally on an entity or value object.      |
| 10  | [Repositories](10-repositories.md)                                                | Repository contracts, persistence rules, query patterns.               |
| 11  | [Application Services](11-application-services.md)                                | Use-case orchestration, transaction boundaries, port catalogue.        |
| 12  | [Anti-Corruption Layers](12-anti-corruption-layers.md)                            | Boundary translations to external providers and the ML sidecar.        |
| 13  | [Tactical Patterns](13-tactical-patterns.md)                                      | Hexagonal, Specification, Saga, Outbox patterns as we use them.        |
| 14  | [Implementation Roadmap](14-implementation-roadmap.md)                            | Phased plan to bring the codebase in line with this model.             |

## Conventions

- **Naming.** PascalCase for aggregates, entities, and value objects;
  camelCase for fields; SNAKE_CASE for invariant constants. Domain events use
  past-tense names (`AnalysisCompleted`, never `CompleteAnalysis`).
- **Mermaid diagrams** are the default visual notation. Diagrams must be
  in-source; no binary images of model diagrams.
- **Stable identity.** Aggregate roots are identified by typed UUIDs
  (`ConversationId`, `AnalysisId`) — never by raw strings.
- **No anaemia.** Aggregates own their invariants. Application services
  coordinate; they do not implement business rules.

## Related ADRs

The DDD model and the architectural decisions are in continuous conversation:

- [ADR-0002](../adr/0002-domain-driven-design-adoption.md) — Adopt DDD.
- [ADR-0012](../adr/0012-event-driven-analysis-pipeline.md) — Domain events
  as integration backbone.
- [ADR-0016](../adr/0016-hexagonal-architecture-for-bounded-contexts.md) —
  Per-context structure for the model.
- [ADR-0017](../adr/0017-anti-corruption-layer-for-llm-providers.md) — ACLs
  at every external boundary.
