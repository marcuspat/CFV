/**
 * PostgreSQL implementation of the Cognitive Analysis repository.
 *
 * All queries run on the ambient Unit-of-Work client (shared/db/pool.ts) so
 * they commit atomically with the transactional outbox. Optimistic
 * concurrency mirrors the in-memory adapter's contract: callers pass the
 * aggregate version *before* the mutation as `expectedAggregateVersion`.
 *
 * The 7-stage saga is persisted as a TEXT status plus JSONB columns for the
 * per-stage results and accumulated reasons; on rehydrate the JSONB date
 * fields are reconstructed into Date instances.
 */

import { getQueryable } from '../../../shared/db/pool';
import { Analysis } from '../domain/analysis';
import {
  AnalysisId,
  ConversationId,
  TenantId,
  type AnalysisStageSnapshot,
  type AnalysisStatus,
} from '../domain/value-objects';
import type { AnalysisRepository } from '../application/ports';
import { AggregateVersionConflict } from './in-memory';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

// ---------------------------------------------------------------------------
// Analysis repository
// ---------------------------------------------------------------------------

export class PostgresAnalysisRepository implements AnalysisRepository {
  async findById(id: AnalysisId, tenantId: TenantId): Promise<Analysis | null> {
    const { rows } = await getQueryable().query(
      `SELECT id, conversation_id, tenant_id, bundle_version, parameter_hash,
              parameters, status, stages, started_at, completed_at,
              degraded_reasons, dropped_members, element_count, version
         FROM analyses WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return rows[0] ? hydrateAnalysis(rows[0]) : null;
  }

  async findByKey(
    conversationId: ConversationId,
    bundleVersion: string,
    parameterHash: string,
  ): Promise<Analysis | null> {
    const { rows } = await getQueryable().query(
      `SELECT id, conversation_id, tenant_id, bundle_version, parameter_hash,
              parameters, status, stages, started_at, completed_at,
              degraded_reasons, dropped_members, element_count, version
         FROM analyses
        WHERE conversation_id = $1 AND bundle_version = $2 AND parameter_hash = $3`,
      [conversationId, bundleVersion, parameterHash],
    );
    return rows[0] ? hydrateAnalysis(rows[0]) : null;
  }

  async save(analysis: Analysis, expectedAggregateVersion: number): Promise<void> {
    const s = analysis.snapshot();
    const db = getQueryable();
    const stages = JSON.stringify(s.stages);
    const parameters = JSON.stringify(s.parameters);
    const degradedReasons = JSON.stringify(s.degradedReasons);
    const droppedMembers = JSON.stringify(s.droppedMembers);
    if (expectedAggregateVersion === 0) {
      try {
        await db.query(
          `INSERT INTO analyses
             (id, conversation_id, tenant_id, bundle_version, parameter_hash,
              parameters, status, stages, started_at, completed_at,
              degraded_reasons, dropped_members, element_count, version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            s.id, s.conversationId, s.tenantId, s.bundleVersion, s.parameterHash,
            parameters, s.status, stages, s.startedAt, s.completedAt,
            degradedReasons, droppedMembers, s.elementCount, s.aggregateVersion,
          ],
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw new AggregateVersionConflict('Analysis', s.id);
        throw err;
      }
      return;
    }
    const { rowCount } = await db.query(
      `UPDATE analyses
          SET status = $2, stages = $3, completed_at = $4, degraded_reasons = $5,
              dropped_members = $6, element_count = $7, version = $8
        WHERE id = $1 AND version = $9`,
      [
        s.id, s.status, stages, s.completedAt, degradedReasons,
        droppedMembers, s.elementCount, s.aggregateVersion, expectedAggregateVersion,
      ],
    );
    if (rowCount !== 1) throw new AggregateVersionConflict('Analysis', s.id);
  }
}

function hydrateAnalysis(row: Record<string, unknown>): Analysis {
  return Analysis.rehydrate({
    id: AnalysisId.of(String(row.id)),
    conversationId: ConversationId.of(String(row.conversation_id)),
    tenantId: TenantId.of(String(row.tenant_id)),
    bundleVersion: String(row.bundle_version),
    parameterHash: String(row.parameter_hash),
    parameters: asJson(row.parameters) as Record<string, unknown>,
    status: String(row.status) as AnalysisStatus,
    stages: (asJson(row.stages) as ReadonlyArray<Record<string, unknown>>).map(hydrateStage),
    startedAt: row.started_at as Date,
    completedAt: (row.completed_at as Date | null) ?? null,
    degradedReasons: asJson(row.degraded_reasons) as ReadonlyArray<string>,
    droppedMembers: asJson(row.dropped_members) as ReadonlyArray<string>,
    elementCount: Number(row.element_count),
    aggregateVersion: Number(row.version),
  });
}

function hydrateStage(s: Record<string, unknown>): AnalysisStageSnapshot {
  return {
    name: s.name as AnalysisStageSnapshot['name'],
    status: s.status as AnalysisStageSnapshot['status'],
    startedAt: toDate(s.startedAt),
    completedAt: toDate(s.completedAt),
    durationMs: (s.durationMs as number | null) ?? null,
    errorClass: (s.errorClass as string | null) ?? null,
    retryable: (s.retryable as boolean | null) ?? null,
  };
}

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v : new Date(String(v));
}

function asJson(v: unknown): unknown {
  return typeof v === 'string' ? JSON.parse(v) : v;
}
