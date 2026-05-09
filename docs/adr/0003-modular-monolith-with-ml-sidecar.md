# 3. Modular Monolith with Python ML Sidecar

- **Status:** Accepted
- **Date:** 2024-04-18
- **Deciders:** Core maintainers
- **Related:** ADR-0004, ADR-0012, ADR-0016, ADR-0020

## Context

CFV must serve real-time interactive workloads (web UI, WebSocket streaming)
and batch-style workloads (cognitive analysis on full conversations, model
training, multimodal preprocessing). The interactive surface is JavaScript-
native and expressed in TypeScript; the analysis surface is Python-native and
relies on the Python ML ecosystem (PyTorch, transformers, NetworkX,
scikit-learn).

Three deployment shapes were considered: a single TypeScript monolith
embedding ML over a child-process bridge; a fully decomposed microservice
architecture with one service per bounded context; a modular monolith with a
single ML sidecar. Team size, operational maturity, and the strong cohesion
between identity, conversations, and analysis all argue against premature
microservice decomposition.

## Decision

We adopt a **modular monolith** for the TypeScript application layer with a
**single Python ML sidecar** for cognitive analysis.

1. The TypeScript runtime exposes the public REST API, the WebSocket gateway,
   and the static frontend. Bounded contexts are physically separated by
   directory and TypeScript module boundaries (ADR-0016) but deploy as one
   process.
2. The Python service runs the ML stack (`src/ml/` and `src/api/`) and
   exposes an internal HTTP/gRPC API consumed only by the TypeScript
   application.
3. Cross-language communication uses a versioned contract (ADR-0017). No
   shared databases between the TypeScript and Python processes for
   transactional state — each process is the system of record for its own
   tables; cross-process reads go through the API.
4. The path to extract a service from the monolith must be *cheap*: each
   bounded context already exposes a stable application interface, so a
   given context can become its own deployable unit when scale demands.

## Consequences

### Positive

- One deployable for the application layer reduces operational complexity in
  the early phase.
- Shared TypeScript build, lint, test, and dependency management.
- Clear seam between transactional (TS) and analytical (Python) workloads.
- Future microservice extraction is incremental — bounded contexts already
  carry the right boundaries.

### Negative

- A bug in one bounded context can affect the whole TypeScript process.
- Teams must enforce module boundaries with discipline, not deployment
  topology.
- The Python sidecar adds a network hop for every analysis call.

### Neutral

- The frontend is bundled separately and served either as static assets or
  via the TypeScript app — orthogonal to the back-end topology.

## Alternatives Considered

### Pure microservices

Rejected for v1: with current team size, the operational tax (per-service
CI/CD, observability, schema management) outweighs the autonomy benefits.

### Embedded Python (Pyodide / shelling out)

Rejected: hard to scale ML workloads, no GPU access, brittle dependency
management.

### Single language (Python all the way)

Rejected: Three.js, the React ecosystem, and our preferred WebSocket and
HTTP stacks live in TypeScript; ML productivity gains from Python are
material.

## Compliance and Verification

- CI enforces the bounded-context module boundaries via dependency-cruiser
  (TypeScript) and `import-linter` (Python).
- The Python sidecar is treated as an internal dependency: it has its own
  health endpoint and SLO (ADR-0019).
- Architectural fitness functions check that no TypeScript bounded context
  reaches across boundaries except through documented integration ports.

## References

- Sam Newman, *Monolith to Microservices*.
- Simon Brown, [*Modular Monoliths*][modmono].

[modmono]: https://www.codingthearchitecture.com/presentations/sa2015-modular-monoliths
