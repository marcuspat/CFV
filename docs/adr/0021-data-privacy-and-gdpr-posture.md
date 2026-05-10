# 21. Data Privacy and GDPR Posture

- **Status:** Accepted
- **Date:** 2024-06-17
- **Deciders:** Core maintainers, security/privacy lead
- **Related:** ADR-0007, ADR-0015, ADR-0019

## Context

Conversations are sensitive: meeting transcripts, interview audio, and
research dialogues frequently contain personally identifiable information
(PII), regulated data, and content the originating organisation considers
confidential. CFV must be safely deployable into regulated environments
(EU, healthcare research, enterprise) and must give users meaningful
control over their data.

## Decision

We adopt the following privacy posture as a non-negotiable baseline:

1. **Lawful basis and tenancy.** Each tenant's data is logically isolated
   by `tenantId`. Cross-tenant queries are forbidden at the repository
   layer; a positive test exists per repository.
2. **Encryption.** TLS 1.3 in transit; AES-256 at rest in PostgreSQL,
   Neo4j, Redis, and any object storage we use for exports.
3. **PII handling.**
   - PII is identified at ingestion via a configurable PII detector and
     tagged on the `Conversation` aggregate.
   - The PII detector can be configured per tenant to redact, hash, or
     pseudonymise fields before they reach the analytical pipeline.
   - Logging middleware redacts known PII fields (ADR-0019).
4. **Retention.**
   - Default retention for audio/video raw media: processing window only,
     purged on `AnalysisCompleted` (ADR-0015).
   - Default retention for transcripts and analysis outputs: configurable
     per tenant, with a hard maximum.
   - Background job purges expired records and verifies the purge.
5. **Subject rights.**
   - **Right to access.** A `GET /me/data` endpoint returns the data
     subject's data in a machine-readable format.
   - **Right to erasure.** A `DELETE /me/data` endpoint cascades through
     PostgreSQL, Neo4j, Redis caches, and object storage. The deletion is
     idempotent and produces an audit record.
   - **Right to rectification** is honoured at the conversation-metadata
     level.
6. **Data residency.** Tenants may be pinned to a region; cross-region
   replication for those tenants is opt-in only.
7. **Provider data flows.** External providers (LLMs, ASR) receive the
   minimum content necessary; provider-specific data-processing addenda
   are tracked alongside the contract.
8. **Audit log.** Every access to a conversation is appended to an
   immutable audit log (PostgreSQL append-only table); admins can query it
   via a privileged route.
9. **Privacy by default.** New features require a privacy review (a
   checklist item on the PR) before merge.

## Consequences

### Positive

- Defensible posture in regulated deployments.
- Subject-rights features are first-class, not bolt-on.
- PII redaction is enforced at the boundary, not by hand.

### Negative

- Performance cost of redaction and audit logging.
- Subject-erasure across three engines + object storage is non-trivial to
  test exhaustively.

### Neutral

- We do not promise full HIPAA compliance in v1; that is a separate
  certification track.

## Alternatives Considered

### Best-effort privacy with per-feature mitigations

Rejected: produces gaps that surface only in audits or incidents.

### Encryption only, no PII redaction

Rejected: encryption protects against storage compromise, not against
provider exfiltration or log exposure.

## Compliance and Verification

- Per-repository tenant-isolation test.
- An end-to-end erasure test runs in CI: create a tenant, generate data
  across all stores, request erasure, assert no residue.
- Audit-log entries are checked by a contract test on every access path.

## References

- `SECURITY.md`
- ADR-0019: Observability and monitoring (PII redaction in logs)
