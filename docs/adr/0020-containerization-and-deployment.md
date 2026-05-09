# 20. Containerization and Deployment Topology

- **Status:** Accepted
- **Date:** 2024-06-13
- **Deciders:** Core maintainers, DevOps lead
- **Related:** ADR-0003, ADR-0004, ADR-0005

## Context

The system has multiple processes (TS app, Python ML sidecar, Postgres,
Neo4j, Redis), and contributors must run a faithful copy locally. The
repository ships `Dockerfile`, `Dockerfile.dev`, `docker-compose.yml`, and
`docker-compose.dev.yml`; we want to formalise what those represent and
what production deployment looks like.

## Decision

We adopt **container-based deployment** with the following topology:

1. **Two first-party images.**
   - `cfv-app` (TypeScript): API gateway, WebSocket server, static
     frontend bundle.
   - `cfv-ml` (Python): ML sidecar with prediction API.
2. **Three managed-or-self-hosted backing stores.** PostgreSQL, Neo4j,
   Redis. We do not bake them into our images; they are dependencies.
3. **Local development** uses `docker-compose.dev.yml` with hot reload
   (volumes mount the source tree into both images); ML model weights are
   downloaded on first run and cached in a named volume.
4. **Production** uses immutable image tags pinned by digest. Migrations
   for PostgreSQL and Neo4j are run by a one-shot job before the app
   image is rolled out (init container in Kubernetes; equivalent step in
   Compose).
5. **Configuration** comes exclusively from environment variables, sourced
   from `.env` locally and from the platform's secret manager in production
   (ADR-0021).
6. **Health endpoints.** Both first-party images expose
   `/health/live` and `/health/ready` consumed by the orchestrator.
7. **Secrets** never appear in images, environment dumps, or logs
   (ADR-0019).

## Consequences

### Positive

- Reproducible local development that closely mirrors production.
- Independent scaling of `cfv-app` and `cfv-ml`.
- Backing stores remain managed where possible (RDS / Neo4j Aura /
  ElastiCache).

### Negative

- Two images to build, sign, and patch.
- Local startup is heavier than a single-process app.

### Neutral

- We are orchestrator-agnostic in v1: Compose is good enough for small
  deployments; the same images run on Kubernetes / ECS / Nomad without
  modification.

## Alternatives Considered

### Single image bundling Python and Node

Rejected: violates the runtime split (ADR-0004), produces heavy images,
and conflates failure domains.

### VM images / non-container deployment

Rejected: mature container tooling outweighs marginal benefits.

## Compliance and Verification

- Image build is reproducible (pinned base images, locked dependency
  manifests).
- A container image is scanned for CVEs in CI; high/critical findings
  block the release.
- Health endpoints are exercised by the synthetic monitor (ADR-0019).

## References

- `Dockerfile`, `Dockerfile.dev`
- `docker-compose.yml`, `docker-compose.dev.yml`
- ADR-0003: Modular monolith with ML sidecar
