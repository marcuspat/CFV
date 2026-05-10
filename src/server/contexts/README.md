# Bounded Contexts (Hexagonal)

Each subdirectory here is one bounded context as defined in
[`docs/ddd/04-bounded-contexts.md`](../../../docs/ddd/04-bounded-contexts.md),
laid out per the hexagonal structure adopted in
[ADR-0016](../../../docs/adr/0016-hexagonal-architecture-for-bounded-contexts.md):

```
contexts/<name>/
├── domain/         # entities, aggregates, value objects, domain events.
│                   # depends on nothing.
├── application/    # use cases and ports. depends on domain only.
├── infrastructure/ # adapters (DB, HTTP clients, etc.). depends on
│                   # application + domain.
└── interfaces/     # inbound (REST controllers, WebSocket emitters) —
                    # populated as contexts are wired into the running app.
```

## Migration Status (strangler-fig)

| Context              | Status     | Notes                                          |
|----------------------|------------|------------------------------------------------|
| identity             | scaffold   | Domain + application + in-memory infra.        |
|                      |            | Existing `src/server/middleware/auth.ts` and   |
|                      |            | `src/server/routes/auth.ts` keep running.      |
| (others)             | pending    | See `docs/ddd/14-implementation-roadmap.md`.   |

Old code remains the live path until each context's `interfaces/` adapter
replaces it. Do not delete the old code in the same change that
introduces the new structure.

## Architectural Rules (enforced by `.dependency-cruiser.cjs`)

1. `domain/` may not import `application/`, `infrastructure/`, or
   `interfaces/`, nor any framework (Express, pg, neo4j-driver, jwt, …).
2. `application/` may not import `infrastructure/` — it depends on
   `domain/` and on its own ports only.
3. No bounded context may reach into another context's `domain/` or
   `infrastructure/`. Cross-context calls go through the published port
   (`application/`) or via a published-language domain event.

The lint rules are currently in **warn** mode (Phase 0 exit criterion).
They graduate to **error** in Phase 10 of the implementation roadmap.
