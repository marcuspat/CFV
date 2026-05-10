# 16. Hexagonal Architecture for Bounded Contexts

- **Status:** Accepted
- **Date:** 2024-05-30
- **Deciders:** Core maintainers
- **Related:** ADR-0002, ADR-0003, ADR-0017

## Context

Each bounded context (DDD docs) has its own domain model, application
services, and infrastructure adapters (PostgreSQL repositories, Neo4j
repositories, REST controllers, WebSocket emitters, ML clients). Without a
disciplined separation, infrastructure concerns (ORM mapping, HTTP
deserialisation, ML library types) leak into the domain and make refactor
or test impossible. A consistent inside-out structure also makes onboarding
faster: every context looks the same.

## Decision

Each bounded context is structured using the **Hexagonal (Ports & Adapters)
architecture**:

```
src/server/contexts/<context-name>/
├── domain/             # entities, aggregates, value objects, domain events
├── application/        # application services (use cases), input/output ports
├── infrastructure/     # adapters: repositories, HTTP clients, message brokers
└── interfaces/         # inbound adapters: REST controllers, WS emitters, CLI
```

1. **Direction of dependencies.** `interfaces` and `infrastructure` depend
   on `application`; `application` depends on `domain`; `domain` depends on
   nothing.
2. **Ports.** Application services define ports as pure interfaces
   (TypeScript `interface`, Python `Protocol`). Infrastructure implements
   them.
3. **Cross-context calls.** A context consumes another context's
   application service through a published port. There are no direct
   imports of another context's `domain/` or `infrastructure/`.
4. **Persistence.** Aggregates are persisted through repository ports; ORM
   models live only in `infrastructure/` and are mapped to/from domain
   types at the adapter boundary.
5. **Testing.** Domain and application layers are tested with hand-written
   in-memory adapters; infrastructure adapters have their own integration
   tests against real engines (ADR-0018).

## Consequences

### Positive

- Domain logic is testable without spinning up databases or HTTP servers.
- Infrastructure can be swapped (e.g. switch a repository implementation)
  without touching the domain.
- Bounded contexts have a uniform shape, so contributors orient quickly.

### Negative

- More files per feature than a layered architecture.
- Mapping between domain and persistence/transport types adds boilerplate.
- Discipline is required to keep `domain/` free of infrastructure imports.

### Neutral

- The Python ML sidecar is *one* hexagonal context for ML inference. Inside
  it, the `domain/` is small (mostly value objects); the heavy lifting is
  in adapters around models and providers.

## Alternatives Considered

### Layered architecture (controllers / services / DAOs)

Rejected: ADR-0002 already discusses; encourages anaemic domain models and
collapses bounded-context boundaries.

### Clean Architecture (Uncle Bob)

Considered equivalent in practice; we prefer the hexagonal naming because
it puts ports/adapters front and centre, which matches how integration
between contexts actually works in this codebase.

## Compliance and Verification

- A dependency-cruiser ruleset (TypeScript) and `import-linter` config
  (Python) enforce the dependency direction.
- A pull-request checklist item asks whether new code respects the
  inside-out structure.
- A new context starts from a base template generator (`base-template-
  generator` agent) that scaffolds the four directories and a sample
  port/adapter pair.

## References

- Alistair Cockburn, *Hexagonal Architecture* (2005).
- ADR-0002: Domain-Driven Design adoption
- `docs/ddd/04-bounded-contexts.md`
