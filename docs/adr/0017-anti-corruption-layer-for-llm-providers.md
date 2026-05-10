# 17. Anti-Corruption Layer for LLM Providers and Internal Contracts

- **Status:** Accepted
- **Date:** 2024-06-03
- **Deciders:** Core maintainers, ML lead
- **Related:** ADR-0004, ADR-0008, ADR-0014, ADR-0016

## Context

The system depends on several external models and providers — OpenAI,
Anthropic, an ASR provider, Rasa — and on the internal TS↔Python contract
between the application monolith and the ML sidecar. Each of these has its
own naming, error model, retry semantics, and message shape. Letting their
types and idioms reach the domain would make our model unstable: every
provider change would force a domain change.

Equally important, the **internal** TS↔Python contract is a system
boundary: drift there causes mysterious bugs because both sides
"work" individually but disagree on the wire.

## Decision

We apply **Anti-Corruption Layers (ACLs)** at every external boundary:

1. **LLM providers.** A `LanguageModelClient` port (in
   `application/ports/`) is the only thing the domain knows about. Each
   provider has an adapter
   (`infrastructure/adapters/openai_client.py`,
   `infrastructure/adapters/anthropic_client.py`) that translates provider
   request/response into the canonical `ModelInvocation` /
   `ModelResponse` value objects. Provider-specific retry, rate-limit,
   and error mapping are localised in the adapter.
2. **ASR / diarisation.** Same pattern: `SpeechRecognitionClient` port
   (ADR-0015) hides provider specifics.
3. **Rasa.** A `DialogueSegmenter` port (ADR-0014) returns canonical
   `Segment` value objects.
4. **Internal TS↔Python contract.** A single canonical schema (Protobuf or
   JSON Schema, decided in implementation phase) generates both TypeScript
   and Python types. Neither side hand-writes the wire types; CI rejects
   PRs that change one side without regenerating the other.
5. **Versioning.** External and internal contracts are versioned; an
   incompatible change requires bumping the major version, supporting both
   versions for one release, and migrating.
6. **Failure mode.** When an adapter fails, it raises a domain-defined
   error (`UpstreamUnavailable`, `UpstreamRateLimited`,
   `UpstreamMalformedResponse`); the application layer decides how to
   react.

## Consequences

### Positive

- Provider swaps are local changes in the adapter.
- Domain code reads cleanly without provider noise.
- A failing provider degrades the system in a predictable, modelled way.

### Negative

- Adapters are non-trivial code that must be maintained as providers
  evolve.
- Generated code requires a build step.

### Neutral

- This adds some indirection in stack traces; we mitigate with structured
  error chains (ADR-0019).

## Alternatives Considered

### Direct SDK usage in domain code

Rejected: couples domain to vendor; previous prototypes broke on provider
upgrades.

### Single in-house abstraction over all providers' SDKs

Considered: equivalent to per-provider adapters; we prefer per-provider
adapters because each provider's quirks are different enough to warrant
distinct mappings.

## Compliance and Verification

- Lint rule: `domain/` and `application/` may not import provider SDKs
  directly.
- A consumer-driven contract test runs in CI for each provider, using
  recorded fixtures.
- The internal schema is the single source of truth; a CI step regenerates
  TS and Python types and fails on drift.

## References

- `src/ml/ensemble_llm.py`
- ADR-0008: Ensemble LLM strategy
- ADR-0016: Hexagonal architecture
