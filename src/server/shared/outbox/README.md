# Transactional Outbox

Implements the outbox pattern described in
[ADR-0012](../../../../docs/adr/0012-event-driven-analysis-pipeline.md)
and [docs/ddd/13-tactical-patterns.md](../../../../docs/ddd/13-tactical-patterns.md).

## Why

Two writes inside one use case — "mutate the aggregate" and "publish the
event" — must not produce a dual-write anomaly. The outbox solves this by
writing both in the **same database transaction**:

1. Application service mutates the aggregate (one PostgreSQL row + child
   rows).
2. *Within the same transaction*, application service writes one or more
   rows to the `domain_event_outbox` table.
3. Commit.

A separate **relay** process polls (or tails logical replication) the
outbox table and publishes rows onto Redis Streams. Consumers in other
contexts (in-process or in the Python ML sidecar) receive the events with
at-least-once delivery and idempotent handlers
([§08](../../../../docs/ddd/08-domain-events.md) — idempotency keys).

## What's here

- `port.ts` — the `OutboxStore` port consumed by application services.
- `domain-event-publisher.ts` — `OutboxDomainEventPublisher` adapter that
  implements the per-context `DomainEventPublisher` port by writing to
  the outbox.
- `in-memory.ts` — `InMemoryOutboxStore` used in tests and during local
  dev when running without PostgreSQL.
- `envelope.ts` — `wrapEvent` and the canonical envelope shape used to
  marshal a domain event into an outbox row.
- `ddl/0001_domain_event_outbox.sql` — the PostgreSQL schema for the
  outbox table, with the indices required for the relay.

The relay implementation itself is deferred — it requires a running
PostgreSQL + Redis pair and is wired in Phase 4 of the implementation
roadmap when cross-process delivery becomes necessary.
