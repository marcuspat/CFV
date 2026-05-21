-- ============================================================================
-- Migration 0001 — Cognitive Analysis context tables.
--
-- See docs/ddd/06-aggregates-and-entities.md § "Analysis (CORE)" and
-- docs/ddd/10-repositories.md. The Analysis aggregate models a 7-stage saga
-- (docs/ddd/13-tactical-patterns.md): the aggregate-level status is a TEXT
-- enum, the per-stage saga results and parameters are JSONB. The version
-- column backs the optimistic-concurrency contract enforced by the
-- repository.
-- ============================================================================

CREATE TABLE IF NOT EXISTS analyses (
    id                TEXT PRIMARY KEY,
    conversation_id   TEXT        NOT NULL,
    tenant_id         TEXT        NOT NULL,
    bundle_version    TEXT        NOT NULL,
    parameter_hash    TEXT        NOT NULL,
    parameters        JSONB       NOT NULL,
    status            TEXT        NOT NULL,
    stages            JSONB       NOT NULL,
    started_at        TIMESTAMPTZ NOT NULL,
    completed_at      TIMESTAMPTZ NULL,
    degraded_reasons  JSONB       NOT NULL DEFAULT '[]',
    dropped_members   JSONB       NOT NULL DEFAULT '[]',
    element_count     INTEGER     NOT NULL,
    version           INTEGER     NOT NULL CHECK (version >= 1),
    -- (conversationId, bundleVersion, parameterHash) determines identity
    -- (analysis.ts invariant 1); the repository's findByKey relies on it.
    UNIQUE (conversation_id, bundle_version, parameter_hash)
);

CREATE INDEX IF NOT EXISTS idx_analyses_tenant ON analyses (tenant_id);
