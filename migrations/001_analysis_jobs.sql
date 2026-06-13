-- Migration: 001_analysis_jobs
-- Creates the analysis_jobs table for persisting cognitive analysis jobs
-- Run via: psql $DATABASE_URL -f migrations/001_analysis_jobs.sql

BEGIN;

-- Enum for job status
DO $$ BEGIN
  CREATE TYPE processing_status AS ENUM (
    'QUEUED',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Core jobs table
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id          TEXT        NOT NULL,
  user_id                  TEXT        NOT NULL,
  status                   TEXT        NOT NULL DEFAULT 'PROCESSING',
  progress                 INTEGER     NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step             TEXT        NOT NULL DEFAULT '',
  estimated_time_remaining INTEGER,
  started_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at             TIMESTAMPTZ,
  result                   JSONB,
  error                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user_id
  ON analysis_jobs (user_id);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_conversation_id
  ON analysis_jobs (conversation_id);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status
  ON analysis_jobs (status);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_started_at
  ON analysis_jobs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user_started
  ON analysis_jobs (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_in_progress
  ON analysis_jobs (conversation_id)
  WHERE status = 'PROCESSING';

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS analysis_jobs_updated_at ON analysis_jobs;
CREATE TRIGGER analysis_jobs_updated_at
  BEFORE UPDATE ON analysis_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_result
  ON analysis_jobs USING gin (result);

COMMIT;
