/**
 * PostgreSQL implementations of the Model Management repositories.
 *
 * All queries run on the ambient Unit-of-Work client (shared/db/pool.ts) so
 * they commit atomically with the transactional outbox. Optimistic
 * concurrency mirrors the in-memory adapter's contract: callers pass the
 * aggregate version *before* the mutation as `expectedAggregateVersion`.
 * The "at most one ACTIVE bundle" invariant is enforced by a partial unique
 * index, surfaced here as ActiveBundleInvariantViolated.
 */

import { getQueryable } from '../../../shared/db/pool';
import { AnalysisBundle } from '../domain/analysis-bundle';
import { ShadowDeployment } from '../domain/shadow-deployment';
import {
  BundleVersion,
  ShadowDeploymentId,
  UserId,
  type BundleStatus,
  type CalibrationParameters,
  type CognitiveMetrics,
  type DgnnModelSnapshot,
  type MemberSnapshot,
  type RulePackSnapshot,
} from '../domain/value-objects';
import type { DeploymentStatus } from '../domain/shadow-deployment';
import type {
  AnalysisBundleRepository,
  ModelRegistry,
  ShadowDeploymentRepository,
} from '../application/ports';
import {
  ActiveBundleInvariantViolated,
  AggregateVersionConflict,
} from './in-memory';

const ACTIVE_INDEX = 'uq_analysis_bundles_single_active';

function uniqueViolation(err: unknown): { code: string; constraint?: string } | null {
  if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
    return err as { code: string; constraint?: string };
  }
  return null;
}

// ---------------------------------------------------------------------------
// AnalysisBundleRepository
// ---------------------------------------------------------------------------

export class PostgresAnalysisBundleRepository implements AnalysisBundleRepository {
  async findActive(): Promise<AnalysisBundle | null> {
    const { rows } = await getQueryable().query(
      `SELECT version, status, created_by, created_at, members, rule_pack,
              dgnn_model, calibration, promoted_at, retired_at, version_no
         FROM analysis_bundles WHERE status = 'ACTIVE'`,
    );
    return rows[0] ? hydrateBundle(rows[0]) : null;
  }

  async findByVersion(version: BundleVersion): Promise<AnalysisBundle | null> {
    const { rows } = await getQueryable().query(
      `SELECT version, status, created_by, created_at, members, rule_pack,
              dgnn_model, calibration, promoted_at, retired_at, version_no
         FROM analysis_bundles WHERE version = $1`,
      [version.value],
    );
    return rows[0] ? hydrateBundle(rows[0]) : null;
  }

  async save(
    bundle: AnalysisBundle,
    expectedAggregateVersion: number,
    alsoSave?: ReadonlyArray<{ bundle: AnalysisBundle; expectedAggregateVersion: number }>,
  ): Promise<void> {
    const writes = [
      { bundle, expectedAggregateVersion },
      ...(alsoSave ?? []),
    ];
    // Apply non-ACTIVE writes first so a displaced bundle is RETIREd before
    // the incoming bundle claims ACTIVE; otherwise the partial unique index
    // would reject a legitimate promotion. Mirrors the in-memory adapter's
    // post-state semantics (both run within one Unit of Work).
    const ordered = [
      ...writes.filter((w) => w.bundle.status !== 'ACTIVE'),
      ...writes.filter((w) => w.bundle.status === 'ACTIVE'),
    ];
    for (const w of ordered) {
      await writeBundle(w.bundle, w.expectedAggregateVersion);
    }
  }
}

async function writeBundle(bundle: AnalysisBundle, expectedAggregateVersion: number): Promise<void> {
  const s = bundle.snapshot();
  const db = getQueryable();
  if (expectedAggregateVersion === 0) {
    try {
      await db.query(
        `INSERT INTO analysis_bundles
           (version, status, created_by, created_at, members, rule_pack,
            dgnn_model, calibration, promoted_at, retired_at, version_no)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          s.version.value,
          s.status,
          s.createdBy,
          s.createdAt,
          JSON.stringify(s.members),
          s.rulePack ? JSON.stringify(s.rulePack) : null,
          s.dgnnModel ? JSON.stringify(s.dgnnModel) : null,
          s.calibration ? JSON.stringify(s.calibration) : null,
          s.promotedAt,
          s.retiredAt,
          s.aggregateVersion,
        ],
      );
    } catch (err) {
      const u = uniqueViolation(err);
      if (u?.constraint === ACTIVE_INDEX) {
        // A 23505 aborts the surrounding transaction, so we cannot query for the
        // existing active version here; report a sentinel for the message.
        throw new ActiveBundleInvariantViolated('<existing active bundle>', s.version.value);
      }
      if (u) throw new AggregateVersionConflict('AnalysisBundle', s.version.value);
      throw err;
    }
    return;
  }
  try {
    const { rowCount } = await db.query(
      `UPDATE analysis_bundles
          SET status = $2, members = $3, rule_pack = $4, dgnn_model = $5,
              calibration = $6, promoted_at = $7, retired_at = $8, version_no = $9
        WHERE version = $1 AND version_no = $10`,
      [
        s.version.value,
        s.status,
        JSON.stringify(s.members),
        s.rulePack ? JSON.stringify(s.rulePack) : null,
        s.dgnnModel ? JSON.stringify(s.dgnnModel) : null,
        s.calibration ? JSON.stringify(s.calibration) : null,
        s.promotedAt,
        s.retiredAt,
        s.aggregateVersion,
        expectedAggregateVersion,
      ],
    );
    if (rowCount !== 1) throw new AggregateVersionConflict('AnalysisBundle', s.version.value);
  } catch (err) {
    const u = uniqueViolation(err);
    if (u?.constraint === ACTIVE_INDEX) {
      // A 23505 aborts the surrounding transaction, so we cannot query for the
        // existing active version here; report a sentinel for the message.
        throw new ActiveBundleInvariantViolated('<existing active bundle>', s.version.value);
    }
    throw err;
  }
}

function hydrateBundle(row: Record<string, unknown>): AnalysisBundle {
  return AnalysisBundle.rehydrate({
    version: BundleVersion.of(String(row.version)),
    status: row.status as BundleStatus,
    createdBy: UserId.of(String(row.created_by)),
    createdAt: row.created_at as Date,
    members: parseJson<ReadonlyArray<MemberSnapshot>>(row.members) ?? [],
    rulePack: parseJson<RulePackSnapshot>(row.rule_pack),
    dgnnModel: parseJson<DgnnModelSnapshot>(row.dgnn_model),
    calibration: parseJson<CalibrationParameters>(row.calibration),
    promotedAt: (row.promoted_at as Date | null) ?? null,
    retiredAt: (row.retired_at as Date | null) ?? null,
    aggregateVersion: Number(row.version_no),
  });
}

// ---------------------------------------------------------------------------
// ShadowDeploymentRepository
// ---------------------------------------------------------------------------

export class PostgresShadowDeploymentRepository implements ShadowDeploymentRepository {
  async findByBundle(version: BundleVersion): Promise<ShadowDeployment | null> {
    const { rows } = await getQueryable().query(
      `SELECT bundle_version, id, status, created_at, results, version_no
         FROM shadow_deployments WHERE bundle_version = $1`,
      [version.value],
    );
    return rows[0] ? hydrateDeployment(rows[0]) : null;
  }

  async save(deployment: ShadowDeployment, expectedAggregateVersion: number): Promise<void> {
    const s = deployment.snapshot();
    const db = getQueryable();
    if (expectedAggregateVersion === 0) {
      try {
        await db.query(
          `INSERT INTO shadow_deployments
             (bundle_version, id, status, created_at, results, version_no)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [s.bundleVersion.value, s.id, s.status, s.createdAt, JSON.stringify(s.results), s.aggregateVersion],
        );
      } catch (err) {
        if (uniqueViolation(err)) throw new AggregateVersionConflict('ShadowDeployment', s.bundleVersion.value);
        throw err;
      }
      return;
    }
    const { rowCount } = await db.query(
      `UPDATE shadow_deployments
          SET status = $2, results = $3, version_no = $4
        WHERE bundle_version = $1 AND version_no = $5`,
      [s.bundleVersion.value, s.status, JSON.stringify(s.results), s.aggregateVersion, expectedAggregateVersion],
    );
    if (rowCount !== 1) throw new AggregateVersionConflict('ShadowDeployment', s.bundleVersion.value);
  }
}

function hydrateDeployment(row: Record<string, unknown>): ShadowDeployment {
  return ShadowDeployment.rehydrate({
    id: ShadowDeploymentId.of(String(row.id)),
    bundleVersion: BundleVersion.of(String(row.bundle_version)),
    status: row.status as DeploymentStatus,
    createdAt: row.created_at as Date,
    results: (parseJson<ReadonlyArray<{ analysisId: string; metrics: CognitiveMetrics; recordedAt: string | Date }>>(row.results) ?? []).map(
      (r) => ({ analysisId: r.analysisId, metrics: r.metrics, recordedAt: new Date(r.recordedAt) }),
    ),
    aggregateVersion: Number(row.version_no),
  });
}

// ---------------------------------------------------------------------------
// ModelRegistry — read-only adapter on top of the repository.
// ---------------------------------------------------------------------------

export class PostgresBackedModelRegistry implements ModelRegistry {
  constructor(private readonly bundles: AnalysisBundleRepository = new PostgresAnalysisBundleRepository()) {}

  async activeBundle(): Promise<AnalysisBundle> {
    const active = await this.bundles.findActive();
    if (!active) throw new Error('No ACTIVE bundle has been promoted yet');
    return active;
  }

  async bundleByVersion(version: BundleVersion): Promise<AnalysisBundle | null> {
    return this.bundles.findByVersion(version);
  }
}

function parseJson<T>(value: unknown): T | null {
  if (value == null) return null;
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}
