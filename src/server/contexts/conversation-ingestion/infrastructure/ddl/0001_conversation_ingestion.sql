-- ============================================================================
-- Migration 0001 — Conversation Ingestion context tables.
--
-- See docs/ddd/06-aggregates-and-entities.md (Conversation, AnalysisSession)
-- and docs/ddd/10-repositories.md. Aggregate version columns back the
-- optimistic-concurrency contract enforced by the repositories.
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
    id                          TEXT PRIMARY KEY,
    tenant_id                   TEXT        NOT NULL,
    title                       TEXT        NOT NULL,
    source_modality             TEXT        NOT NULL,
    status                      TEXT        NOT NULL,
    created_at                  TIMESTAMPTZ NOT NULL,
    derived_from_conversation_id TEXT       NULL,
    turns                       JSONB       NOT NULL,
    segments                    JSONB       NOT NULL DEFAULT '[]',
    version                     INTEGER     NOT NULL CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations (tenant_id);

CREATE TABLE IF NOT EXISTS analysis_sessions (
    id               TEXT PRIMARY KEY,
    tenant_id        TEXT        NOT NULL,
    conversation_id  TEXT        NOT NULL,
    user_id          TEXT        NOT NULL,
    parameters       JSONB       NOT NULL,
    parameter_hash   TEXT        NOT NULL,
    status           TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL,
    version          INTEGER     NOT NULL CHECK (version >= 1),
    -- Request-level idempotency invariant (docs/ddd/06): identical
    -- (tenant, conversation, parameterHash) requests map to one session.
    UNIQUE (tenant_id, conversation_id, parameter_hash)
);

CREATE INDEX IF NOT EXISTS idx_analysis_sessions_tenant ON analysis_sessions (tenant_id);
