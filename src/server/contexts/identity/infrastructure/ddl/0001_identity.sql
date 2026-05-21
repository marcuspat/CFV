-- ============================================================================
-- Migration 0001 — Identity & Access context tables.
--
-- See docs/ddd/06-aggregates-and-entities.md (User, Tenant, RefreshToken)
-- and docs/ddd/10-repositories.md. Aggregate version columns back the
-- optimistic-concurrency contract enforced by the repositories.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
    id               TEXT PRIMARY KEY,
    name             TEXT        NOT NULL,
    region           TEXT        NOT NULL,
    retain_media     BOOLEAN     NOT NULL,
    max_age_days     INTEGER     NOT NULL,
    feature_flags    TEXT[]      NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL,
    version          INTEGER     NOT NULL CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS users (
    id               TEXT PRIMARY KEY,
    tenant_id        TEXT        NOT NULL,
    email            TEXT        NOT NULL,
    password_hash    TEXT        NOT NULL,
    roles            TEXT[]      NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL,
    disabled_at      TIMESTAMPTZ NULL,
    version          INTEGER     NOT NULL CHECK (version >= 1),
    -- (tenantId, email) uniqueness invariant (docs/ddd/06).
    UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id               TEXT PRIMARY KEY,
    user_id          TEXT        NOT NULL,
    tenant_id        TEXT        NOT NULL,
    issued_at        TIMESTAMPTZ NOT NULL,
    expires_at       TIMESTAMPTZ NOT NULL,
    rotated_from_id  TEXT        NULL,
    rotated_at       TIMESTAMPTZ NULL,
    revoked_at       TIMESTAMPTZ NULL,
    version          INTEGER     NOT NULL CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
