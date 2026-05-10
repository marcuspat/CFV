# 18. Test Strategy: Pyramid + Chaos Engineering

- **Status:** Accepted
- **Date:** 2024-06-06
- **Deciders:** Core maintainers, QA lead
- **Related:** ADR-0008, ADR-0019

## Context

CFV touches several risk surfaces: ML accuracy, data integrity across three
engines, real-time WebSocket fan-out, polyglot integration, and 3D
rendering performance. A flat "lots of unit tests" strategy does not give
adequate coverage of system-level failure modes. Conversely, a heavy
end-to-end suite alone is slow and flaky. The repository already has
fixtures for chaos and error-handling testing in `tests/chaos-engineering/`
and `tests/error-handling/`; we want to formalise the strategy that
governs them.

## Decision

We adopt a **pyramid + chaos** strategy with five layers:

1. **Unit tests** (broad base). Per-module pytest / Jest tests for pure
   functions, value objects, domain rules, ML helpers. Run on every
   commit. Target: <2 minutes.
2. **Component / integration tests.** Test a single bounded context end-
   to-end against ephemeral PostgreSQL / Neo4j / Redis. Run on every
   commit. Target: <8 minutes.
3. **Contract tests.** Verify the OpenAPI surface (ADR-0006), WebSocket
   event schemas (ADR-0012), and the TS↔Python internal contract
   (ADR-0017). Run on every commit.
4. **End-to-end tests.** Playwright drives the React frontend through
   golden-path user journeys (upload → analyse → visualise → export).
   Run on every commit.
5. **Performance, accuracy, and chaos tests** (top of the pyramid).
   - **Performance** (`tests/performance/`): load, stress, memory,
     database, artillery. Run nightly.
   - **Accuracy** (`tests/ml/`): per-dimension targets verified against a
     held-out corpus. Run nightly.
   - **Chaos** (`tests/chaos-engineering/`): fault injection — provider
     outage, Neo4j unavailability, Redis flap, network partitions, slow
     disk. Run weekly and pre-release.
6. **Production validation.** Synthetic monitoring runs the golden path
   against staging on every deploy and against production every 5 minutes
   (ADR-0019).

The Test Pyramid is the **commitment shape**: a regression at one layer is
fixed at the *lowest* layer that can express it.

## Consequences

### Positive

- Risk surfaces have proportional coverage.
- Fast inner loop (unit + component) for day-to-day development.
- Chaos tests catch class-of-bug failures that unit tests cannot.

### Negative

- Multiple test runners, fixtures, and infrastructures to maintain.
- Nightly/weekly tests have a longer time-to-signal for regressions.

### Neutral

- We accept that flaky tests must be quarantined within 24 hours of
  detection; chronic flakes are root-caused, not retried.

## Alternatives Considered

### E2E-heavy ("ice-cream cone")

Rejected: slow inner loop, low signal-to-noise on regressions.

### Unit-only

Rejected: misses integration and chaos failure modes.

## Compliance and Verification

- CI fails the build if total coverage falls below 80% on changed files.
- Performance tests publish baselines; regressions >10% block release.
- Accuracy tests publish baselines; regressions >2% block release.
- Chaos test failures open a tracked incident automatically.

## References

- `tests/`
- ADR-0019: Observability and monitoring
