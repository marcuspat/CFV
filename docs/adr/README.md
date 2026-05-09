# Architecture Decision Records (ADRs)

This directory contains the Architecture Decision Records for the **Cognitive
Fabric Visualizer (CFV)**. ADRs capture significant architectural decisions
together with their context and consequences so that future contributors can
understand *why* the system looks the way it does.

## What is an ADR?

An ADR is a short, immutable document that records a single architecturally
significant decision. We follow a slimmed-down [MADR][madr] format. New ADRs
are appended; superseded ADRs are kept for historical context and linked from
the replacement.

[madr]: https://adr.github.io/madr/

## Lifecycle and Status

Each ADR carries one of the following statuses:

| Status        | Meaning                                                         |
|---------------|-----------------------------------------------------------------|
| `Proposed`    | Authored, under discussion, not yet adopted.                    |
| `Accepted`    | Approved by maintainers and currently in force.                 |
| `Deprecated`  | No longer recommended but not yet replaced.                     |
| `Superseded`  | Replaced by a newer ADR (link required in the header).          |
| `Rejected`    | Considered and explicitly not adopted.                          |

## Authoring a New ADR

1. Copy `template.md` to `NNNN-short-title-in-kebab-case.md` using the next
   sequential number.
2. Fill in **Context**, **Decision**, **Consequences**, and **Alternatives**.
3. Open a pull request titled `ADR: <short title>`.
4. After review and approval, set the status to `Accepted` and merge.
5. If a future ADR supersedes this one, mark it `Superseded by ADR-NNNN` and
   add a back-link in the new ADR's `Supersedes` field.

ADRs must be **immutable** once accepted, except for status changes and
trivial editorial fixes (typos, broken links). Substantive revisions require a
new ADR that supersedes the old one.

## Index

| #   | Title                                                                | Status   |
|-----|----------------------------------------------------------------------|----------|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions                | Accepted |
| [0002](0002-domain-driven-design-adoption.md) | Adopt Domain-Driven Design                   | Accepted |
| [0003](0003-modular-monolith-with-ml-sidecar.md) | Modular monolith with Python ML sidecar   | Accepted |
| [0004](0004-polyglot-runtime-typescript-python.md) | Polyglot runtime: TypeScript and Python | Accepted |
| [0005](0005-polyglot-persistence-postgres-neo4j-redis.md) | Polyglot persistence: PostgreSQL, Neo4j, Redis | Accepted |
| [0006](0006-rest-and-websocket-api-surface.md) | REST + WebSocket API surface                | Accepted |
| [0007](0007-jwt-authentication-and-rbac.md) | JWT authentication with RBAC                   | Accepted |
| [0008](0008-ensemble-llm-strategy.md) | Ensemble LLM strategy (GPT-4 + Claude-3)             | Accepted |
| [0009](0009-neuro-symbolic-cognitive-decomposition.md) | Neuro-symbolic cognitive decomposition | Accepted |
| [0010](0010-dynamic-graph-neural-networks.md) | Dynamic Graph Neural Networks for thread evolution | Accepted |
| [0011](0011-threejs-for-3d-visualization.md) | Three.js for 3D visualization                | Accepted |
| [0012](0012-event-driven-analysis-pipeline.md) | Event-driven cognitive analysis pipeline    | Accepted |
| [0013](0013-confidence-scoring-and-uncertainty.md) | Confidence scoring and uncertainty quantification | Accepted |
| [0014](0014-rasa-for-dialogue-segmentation.md) | Rasa for dialogue segmentation              | Accepted |
| [0015](0015-multimodal-input-pipeline.md) | Multimodal input (text, audio, video) pipeline   | Accepted |
| [0016](0016-hexagonal-architecture-for-bounded-contexts.md) | Hexagonal architecture for bounded contexts | Accepted |
| [0017](0017-anti-corruption-layer-for-llm-providers.md) | Anti-corruption layer for LLM providers | Accepted |
| [0018](0018-test-strategy-pyramid-and-chaos.md) | Test strategy: pyramid + chaos engineering  | Accepted |
| [0019](0019-observability-and-monitoring.md) | Observability and monitoring                  | Accepted |
| [0020](0020-containerization-and-deployment.md) | Containerization and deployment topology   | Accepted |
| [0021](0021-data-privacy-and-gdpr-posture.md) | Data privacy and GDPR posture                | Accepted |
| [0022](0022-feedback-loop-and-model-retraining.md) | Feedback loop and model retraining       | Accepted |
| [0023](0023-export-formats-and-explainability.md) | Export formats and explainability        | Accepted |
| [0024](0024-frontend-state-management.md) | Frontend state management                        | Accepted |
| [0025](0025-versioning-and-release-strategy.md) | Versioning and release strategy            | Accepted |

## Related Documentation

- [Domain-Driven Design Documentation](../ddd/README.md)
- [Architecture Guide](../ARCHITECTURE_GUIDE.md)
- [API Reference](../API_REFERENCE.md)
