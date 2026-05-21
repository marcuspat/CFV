-- ============================================================================
-- Migration 0001 — Model Management context tables.
--
-- See docs/ddd/06-aggregates-and-entities.md (AnalysisBundle, ShadowDeployment)
-- and docs/ddd/10-repositories.md. Aggregate version columns back the
-- optimistic-concurrency contract enforced by the repositories.
-- ============================================================================

CREATE TABLE IF NOT EXISTS analysis_bundles (
    version          TEXT PRIMARY KEY,
    status           TEXT        NOT NULL CHECK (status IN ('DRAFT','SHADOW','ACTIVE','RETIRED')),
    created_by       TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL,
    members          JSONB       NOT NULL DEFAULT '[]',
    rule_pack        JSONB       NULL,
    dgnn_model       JSONB       NULL,
    calibration      JSONB       NULL,
    promoted_at      TIMESTAMPTZ NULL,
    retired_at       TIMESTAMPTZ NULL,
    version_no       INTEGER     NOT NULL CHECK (version_no >= 1)
);

-- "At most one ACTIVE bundle" invariant (mirrors InMemoryAnalysisBundleRepository).
-- The invariant is global (the repository is not tenant-scoped); a partial
-- unique index rejects a second ACTIVE row at the database level.
CREATE UNIQUE INDEX IF NOT EXISTS uq_analysis_bundles_single_active
    ON analysis_bundles (status)
    WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS shadow_deployments (
    bundle_version   TEXT PRIMARY KEY,
    id               TEXT        NOT NULL,
    status           TEXT        NOT NULL CHECK (status IN ('OPEN','CLOSED')),
    created_at       TIMESTAMPTZ NOT NULL,
    results          JSONB       NOT NULL DEFAULT '[]',
    version_no       INTEGER     NOT NULL CHECK (version_no >= 1)
);
