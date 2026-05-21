-- ============================================================================
-- Migration 0001 — Multimodal Ingestion context tables.
--
-- See docs/ddd/06-aggregates-and-entities.md (MediaUpload) and
-- docs/ddd/10-repositories.md. The aggregate version column backs the
-- optimistic-concurrency contract enforced by the repository. Nested value
-- objects (transcription, diarisation, non-verbal features) are stored as
-- JSONB; the bytes themselves live in object storage (BlobStore port).
-- ============================================================================

CREATE TABLE IF NOT EXISTS media_uploads (
    id               TEXT PRIMARY KEY,
    tenant_id        TEXT        NOT NULL,
    mime_type        TEXT        NOT NULL,
    byte_size        INTEGER     NOT NULL CHECK (byte_size >= 0),
    status           TEXT        NOT NULL CHECK (status IN ('UPLOADED', 'PROCESSED', 'PURGED')),
    retain_media     BOOLEAN     NOT NULL,
    max_age_days     INTEGER     NOT NULL CHECK (max_age_days >= 0),
    storage_key      TEXT        NOT NULL,
    conversation_id  TEXT        NULL,
    transcription    JSONB       NULL,
    diarisation      JSONB       NULL,
    non_verbal       JSONB       NULL,
    created_at       TIMESTAMPTZ NOT NULL,
    processed_at     TIMESTAMPTZ NULL,
    purged_at        TIMESTAMPTZ NULL,
    version          INTEGER     NOT NULL CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS idx_media_uploads_tenant ON media_uploads (tenant_id);

-- Supports the PurgeExpiredMedia scan for retained media past its horizon.
CREATE INDEX IF NOT EXISTS idx_media_uploads_expiry
    ON media_uploads (status, retain_media, created_at);
