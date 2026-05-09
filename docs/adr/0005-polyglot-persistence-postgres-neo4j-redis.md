# 5. Polyglot Persistence: PostgreSQL, Neo4j, Redis

- **Status:** Accepted
- **Date:** 2024-04-22
- **Deciders:** Core maintainers
- **Related:** ADR-0010, ADR-0012

## Context

CFV stores three categorically different shapes of data:

1. **Relational, transactional state** — users, conversations, analysis
   sessions, audit trails. Reads are point-lookups and small joins; writes
   require ACID guarantees.
2. **Graph state** — cognitive elements connected by typed relationships,
   conversation-spanning threads, predicted edges. The natural query is
   multi-hop traversal ("show me how creative-synthesis nodes connect to
   meta-cognition nodes through factual-retrieval bridges over the last
   30 minutes of conversation"). Doing this in SQL produces unbounded recursive
   CTEs that are slow and brittle.
3. **Ephemeral, high-throughput state** — session tokens, hot analysis
   caches, real-time pub/sub fan-out for WebSocket subscribers.

Forcing all three shapes into one engine optimises one workload and
cripples the others.

## Decision

We adopt **polyglot persistence** with three engines, each owning a
specific class of state:

1. **PostgreSQL 15+** — system of record for users, conversations, analysis
   sessions, model registry metadata, audit log, feedback entries.
2. **Neo4j 5+** — system of record for the cognitive graph: `CognitiveElement`
   nodes, typed relationships, conversation-spanning threads, predicted
   edges with confidence weights.
3. **Redis 7+** — operational cache and pub/sub: JWT denylist, hot analysis
   results keyed by conversation hash, WebSocket channel fan-out, rate-
   limit counters.

Each piece of data has exactly one system of record. Cross-engine projections
(e.g. denormalising a graph trait into PostgreSQL for a dashboard) must
commit through a domain event (ADR-0012); never via direct dual writes.

## Consequences

### Positive

- Each query shape uses the right engine.
- Failure of Redis degrades performance but not correctness; failure of
  Neo4j affects analysis but not authentication; failure of PostgreSQL stops
  writes globally — blast radius is well-defined and matches the
  criticality of each store.
- Operational tools (backups, replication, monitoring) are mature in each
  ecosystem.

### Negative

- Three operational targets to back up, restore, monitor, secure, and patch.
- No native distributed transactions across engines; we rely on outbox-style
  event publishing to avoid dual-write inconsistency.
- Schema changes happen in three places.

### Neutral

- Object storage for exported visualization artefacts is *not* counted here;
  it is treated as an external integration (ADR-0023).

## Alternatives Considered

### PostgreSQL + `pg_graph` / `AGE` extension

Rejected: graph traversal performance and tooling ergonomics are
significantly weaker than Neo4j for our query patterns; vendor maturity is
also weaker.

### Neo4j as the single store

Rejected: Neo4j is excellent at graph workloads but a poor fit for
high-volume tabular data, and its operational profile (single-leader, JVM
memory tuning) is a worse match for transactional API traffic.

### MongoDB as a general document store

Rejected: cognitive elements have rich relationships that we want first-
class, not encoded as embedded references.

## Compliance and Verification

- Repository pattern (ADR-0016) hides each engine behind a domain port.
- Integration tests run against ephemeral instances of all three engines.
- Backup-restore drills exercise each engine quarterly.
- Observability dashboards expose per-engine SLOs (ADR-0019).

## References

- Martin Fowler, *Polyglot Persistence*.
- Neo4j, *Cypher Query Language Reference*.
- ADR-0012: Event-driven analysis pipeline.
