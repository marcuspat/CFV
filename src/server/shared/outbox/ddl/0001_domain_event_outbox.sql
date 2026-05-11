-- ============================================================================
-- Migration 0001 — Transactional outbox table.
--
-- See ADR-0012 (Event-driven analysis pipeline) and
-- docs/ddd/13-tactical-patterns.md § "Transactional Outbox".
--
-- Application services write to this table inside the same transaction
-- as the aggregate save. A separate relay process polls
-- `published_at IS NULL` rows and republishes them onto Redis Streams.
-- ============================================================================

CREATE TABLE IF NOT EXISTS domain_event_outbox (
    event_id         TEXT PRIMARY KEY,
    event_type       TEXT        NOT NULL,
    schema_version   INTEGER     NOT NULL CHECK (schema_version >= 1),
    tenant_id        TEXT        NOT NULL,
    actor_type       TEXT        NOT NULL CHECK (actor_type IN ('USER','SERVICE','SYSTEM')),
    actor_id         TEXT        NOT NULL,
    correlation_id   TEXT        NOT NULL,
    causation_id     TEXT        NULL,
    occurred_at      TIMESTAMPTZ NOT NULL,
    payload          JSONB       NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at     TIMESTAMPTZ NULL
);

-- Relay scan: pull unpublished rows in insertion order, bounded.
CREATE INDEX IF NOT EXISTS idx_outbox_unpublished_created
    ON domain_event_outbox (created_at)
    WHERE published_at IS NULL;

-- Diagnostic indexes for ops queries (trace a correlation across the bus).
CREATE INDEX IF NOT EXISTS idx_outbox_correlation
    ON domain_event_outbox (correlation_id);

CREATE INDEX IF NOT EXISTS idx_outbox_tenant_type_occurred
    ON domain_event_outbox (tenant_id, event_type, occurred_at);

-- Privacy posture (ADR-0021): payload columns may contain conversation
-- content. Retention is enforced at the application layer; this is the
-- audit hook for the periodic purge job.
COMMENT ON TABLE  domain_event_outbox  IS 'Transactional outbox for cross-context domain events. Drained by the relay.';
COMMENT ON COLUMN domain_event_outbox.payload      IS 'Event payload as JSON; may contain PII subject to tenant retention.';
COMMENT ON COLUMN domain_event_outbox.published_at IS 'NULL until the relay has acknowledged publication onto Redis Streams.';
