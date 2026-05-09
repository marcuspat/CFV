# 2. Adopt Domain-Driven Design

- **Status:** Accepted
- **Date:** 2024-04-15
- **Deciders:** Core maintainers
- **Related:** ADR-0003, ADR-0016, ADR-0017

## Context

CFV operates in a knowledge-rich domain. Cognitive science vocabulary
("factual retrieval", "logical inference", "creative synthesis", "meta-
cognition") interacts with engineering vocabulary ("graph node", "embedding",
"thread"). The codebase already mixes the two — sometimes inconsistently —
across `src/ml/`, `src/server/`, and `src/client/`. Without a shared model
between the cognitive scientists who define the analytical targets and the
engineers who build the system, requirements are translated multiple times
and meaning is lost in translation. Defects often trace back to vocabulary
drift (e.g. "thread" meaning a conversation segment in one module and a graph
trajectory in another).

The system also has clearly distinct subdomains with different rates of
change and different stakeholders: the cognitive analysis pipeline evolves
with research findings; the visualization evolves with UX feedback; identity
and access evolve with compliance requirements.

## Decision

We adopt **Domain-Driven Design (DDD)** as the primary modelling discipline:

1. Establish and maintain a **Ubiquitous Language** in
   `docs/ddd/01-ubiquitous-language.md`. Code, tests, documentation, and
   user-facing copy must use the same terms.
2. Partition the system into **Bounded Contexts** with explicit context
   boundaries and integration patterns documented in
   `docs/ddd/03-strategic-design-context-map.md`.
3. Use **tactical DDD patterns** (Aggregates, Entities, Value Objects, Domain
   Events, Domain Services, Repositories, Application Services) for the
   *core* subdomains. Supporting and generic subdomains may use lighter-
   weight patterns where DDD overhead is not justified.
4. Treat the cognitive analysis pipeline as the **core domain**: it is the
   primary differentiator and must receive the most modelling investment.

## Consequences

### Positive

- Shared vocabulary reduces translation cost between research and
  engineering.
- Clear bounded-context boundaries enable independent evolution and team
  ownership.
- Aggregates encapsulate invariants, making concurrency and consistency
  reasoning local.
- Domain events provide a natural integration mechanism between contexts.

### Negative

- Up-front modelling cost; some teams perceive DDD as ceremony.
- Risk of "DDD-washing": copying patterns without internalizing the
  modelling discipline.
- Some patterns (Aggregates, Repositories) need adaptation in Python ML code
  where the abstraction style differs from idiomatic data-science code.

### Neutral

- The non-core ML pipelines (e.g. multimodal pre-processing) are modelled
  more loosely because they have no rich domain invariants.

## Alternatives Considered

### Pure layered architecture (controllers / services / DAOs)

Rejected: collapses domain language, encourages anaemic models, and produces
implicit boundaries that drift as the codebase grows.

### CQRS + Event Sourcing from day one

Rejected for v1: too much accidental complexity for the current scale. We
keep the door open via domain events (ADR-0012); event sourcing can be
introduced later for specific aggregates without restructuring the system.

## Compliance and Verification

- New modules are reviewed against the bounded-context map. Cross-context
  imports trigger a review challenge.
- Linting rule (planned): forbid imports from one bounded context's
  `domain/` package by another context's `application/` or `infrastructure/`
  package.
- Onboarding includes reading `docs/ddd/`.

## References

- Eric Evans, *Domain-Driven Design* (2003).
- Vaughn Vernon, *Implementing Domain-Driven Design* (2013).
- `docs/ddd/README.md`
