# 19. Observability and Monitoring

- **Status:** Accepted
- **Date:** 2024-06-10
- **Deciders:** Core maintainers
- **Related:** ADR-0012, ADR-0018, ADR-0020

## Context

The system spans two runtimes, three data engines, an event-driven
pipeline, several external providers, and a real-time UI. Debugging an
analysis failure or a slow request without correlated traces, structured
logs, and SLO-backed metrics is impractical. The repository already has a
monitoring scaffold (`src/server/services/monitoring/`,
`src/server/routes/monitoring.ts`, `src/config/monitoring.ts`) that we want
to formalise.

## Decision

We adopt **OpenTelemetry-based observability** with three signal types and
explicit SLOs:

1. **Tracing.** OpenTelemetry traces propagate `traceparent` across REST,
   WebSocket, the Python sidecar (ADR-0017), and the Redis-Streams event
   bus (ADR-0012). Every domain event carries `correlationId` and
   `causationId`. Frontend request initiation injects a `traceparent`.
2. **Logging.** Structured JSON logs only. Each entry includes
   `traceId`, `spanId`, `correlationId`, `boundedContext`, `userId` (where
   present), `tenantId`, and a stable `event` field. No PII (ADR-0021).
3. **Metrics.** RED (Rate, Errors, Duration) for every external endpoint;
   USE (Utilisation, Saturation, Errors) for every backing store; bespoke
   ML metrics (ensemble member latency, fusion latency, per-dimension
   accuracy on shadow-eval).
4. **SLOs** (initial targets):
   - **API availability:** 99.9% monthly.
   - **API latency:** p95 < 100 ms, p99 < 500 ms.
   - **Analysis completion:** p95 < 10 s end-to-end.
   - **WebSocket update latency:** p95 < 50 ms.
   - **Per-dimension accuracy:** within 2% of release baseline.
5. **Error budgets.** Each SLO has an explicit budget; exhaustion gates
   non-critical releases.
6. **Synthetic monitoring.** Golden-path probes hit staging on each
   deploy and production every 5 minutes; failures page on-call.
7. **PII redaction.** Logging middleware redacts known PII fields before
   emission. The redaction rules are versioned alongside the code.

## Consequences

### Positive

- Debugging is correlated end-to-end across runtimes and stores.
- Reliability and accuracy are measured the same way and treated with the
  same rigour.
- Privacy posture is enforced at the observability boundary, not in ad-hoc
  print statements.

### Negative

- Operational stack to run (collector, backends) — but this is table stakes
  at our scale.
- SLO discipline requires cultural commitment, not just tooling.

### Neutral

- Vendor choice for the observability backend is deferred and is not a
  durable architectural commitment.

## Alternatives Considered

### Logs only

Rejected: cannot correlate events across runtimes and stores.

### APM vendor lock-in (proprietary tracing)

Rejected: OpenTelemetry preserves portability.

## Compliance and Verification

- A unit test asserts that every domain event carries `correlationId` and
  `causationId`.
- A redaction test feeds known PII payloads and asserts they are scrubbed
  in the log output.
- SLO dashboards are reviewed weekly; on-call playbooks reference them.

## References

- `src/server/services/monitoring/`
- `src/config/monitoring.ts`
- ADR-0012: Event-driven analysis pipeline
- ADR-0021: Data privacy and GDPR posture
