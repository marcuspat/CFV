# 4. Polyglot Runtime: TypeScript and Python

- **Status:** Accepted
- **Date:** 2024-04-18
- **Deciders:** Core maintainers
- **Related:** ADR-0003, ADR-0017

## Context

CFV's two dominant workloads — interactive web/API (TypeScript) and ML
analysis (Python) — have incompatible ecosystem strengths. The web/API
ecosystem in Python (FastAPI, Starlette) is competent but the
visualization, real-time, and frontend tooling we depend on (Three.js,
React, D3, Vite, Vitest) is JavaScript/TypeScript-native. Conversely, the
Python ML ecosystem (PyTorch, transformers, NetworkX, scikit-learn,
spaCy) has no equivalent in TypeScript that we could realistically adopt
without sacrificing accuracy targets.

## Decision

We adopt a **deliberately polyglot** runtime split:

1. **TypeScript** (Node 18+) for the API gateway, WebSocket server,
   application services, repositories that own transactional state, and the
   React frontend.
2. **Python** (3.10+) for the ML pipeline (`src/ml/`), the prediction API
   (`src/api/prediction_api.py`), and any model inference path.
3. **No third language** is permitted for first-party code without a new ADR.
   Build tools, infra-as-code, and shell scripts are exempt.
4. Inter-runtime communication occurs over a single, versioned, internal
   HTTP API. Shared types are generated from a canonical schema (ADR-0017).

## Consequences

### Positive

- Each runtime is used for what it does best.
- No accidental coupling through a shared runtime.
- Hiring is straightforward in both ecosystems.

### Negative

- Two test stacks (Jest/Playwright + pytest), two lint stacks, two release
  cadences for dependencies.
- Schema duplication risk if the contract is not generated mechanically.
- Cross-runtime debugging requires correlation IDs (ADR-0019).

### Neutral

- Shared utility libraries are not feasible across the runtime split; we
  duplicate small helpers when justified rather than building cross-language
  packages.

## Alternatives Considered

### TypeScript-only with WASM-compiled ML

Rejected: ML accuracy is the product's headline metric (ADR-0008); we will
not compromise it for runtime homogeneity.

### Python-only

Rejected: the frontend is non-negotiable in TypeScript; running the API in
Python would still require the WebSocket bridge to Three.js.

### Rust + Python

Rejected: no compelling case for Rust at current scale; would add a third
runtime cost without unblocking any workload.

## Compliance and Verification

- The repository's top-level `package.json` and `pyproject.toml` (planned)
  are the only language manifests permitted.
- A pre-commit hook flags first-party code in unsupported languages.
- Cross-runtime contract changes require a contract test in CI (ADR-0017).

## References

- ADR-0003: Modular monolith topology
- ADR-0017: Anti-corruption layer for LLM providers and internal contract
