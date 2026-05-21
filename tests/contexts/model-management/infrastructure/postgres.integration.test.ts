/**
 * Integration tests for the Model Management PostgreSQL adapters +
 * transactional outbox. Exercises real SQL against a live database.
 *
 * Gated behind RUN_DB_TESTS=1 so the default unit run (and CI without a
 * database) skips it. Run with:
 *   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://postgres@localhost:5433/cfv_test \
 *     npx jest tests/contexts/model-management/infrastructure
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import {
  closePool,
  configurePool,
  withTransaction,
} from '../../../../src/server/contexts/../shared/db/pool';
import {
  PostgresAnalysisBundleRepository,
  PostgresShadowDeploymentRepository,
} from '../../../../src/server/contexts/model-management/infrastructure/postgres';
import {
  ActiveBundleInvariantViolated,
  AggregateVersionConflict,
} from '../../../../src/server/contexts/model-management/infrastructure/in-memory';
import {
  PostgresOutboxReader,
  PostgresOutboxStore,
} from '../../../../src/server/shared/outbox/postgres';
import { wrapEvent, type EnvelopeContext } from '../../../../src/server/shared/outbox/envelope';
import { AnalysisBundle } from '../../../../src/server/contexts/model-management/domain/analysis-bundle';
import { ShadowDeployment } from '../../../../src/server/contexts/model-management/domain/shadow-deployment';
import {
  BundleVersion,
  DgnnModelId,
  MemberId,
  RulePackId,
  ShadowDeploymentId,
  UserId,
  makeMember,
  makeRulePack,
  type CalibrationParameters,
} from '../../../../src/server/contexts/model-management/domain/value-objects';

const RUN = process.env.RUN_DB_TESTS === '1';
const DSN = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/cfv_test';

const TENANT = '01HJK3R6X7Y8ZAB2C3D4E5F6T0';
const CREATED_BY = UserId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Y0');
const NOW = new Date('2026-01-01T00:00:00Z');

const CALIB: CalibrationParameters = {
  factualRetrieval:  { a: 1.0, b: 0.0 },
  logicalInference:  { a: 1.0, b: 0.0 },
  creativeSynthesis: { a: 1.0, b: 0.0 },
  metaCognition:     { a: 1.0, b: 0.0 },
};

let seq = 0;
function newId(): string {
  seq += 1;
  return seq.toString(32).toUpperCase().replace(/I|L|O|U/g, '0').padStart(26, '0');
}

function envCtx(): EnvelopeContext {
  return {
    tenantId: TENANT,
    actor: { type: 'SYSTEM', id: 'test' },
    correlationId: newId(),
    occurredAt: NOW,
    newEventId: () => newId(),
  };
}

function completeDraft(version: BundleVersion): AnalysisBundle {
  const bundle = AnalysisBundle.createDraft({ version, createdBy: CREATED_BY, now: NOW });
  bundle.addMember(
    makeMember({
      id: MemberId.of('01HJK3R6X7Y8ZAB2C3D4E5F6M0'),
      provider: 'openai',
      modelName: 'gpt-4.1',
      promptTemplates: { factual: 't1' },
      fusionWeight: 0.6,
    }),
  );
  bundle.addMember(
    makeMember({
      id: MemberId.of('01HJK3R6X7Y8ZAB2C3D4E5F6M1'),
      provider: 'anthropic',
      modelName: 'claude-3.7-sonnet',
      promptTemplates: { factual: 't2' },
      fusionWeight: 0.4,
    }),
  );
  bundle.setRulePack(
    makeRulePack({
      id: RulePackId.of('01HJK3R6X7Y8ZAB2C3D4E5F6R0'),
      rules: [{ name: 'has-evidence', kind: 'hard', weight: 1 }],
    }),
  );
  bundle.setDgnnModel({
    id: DgnnModelId.of('01HJK3R6X7Y8ZAB2C3D4E5F6D0'),
    artefactKey: `bundle/${version.value}/dgnn-1`,
    trainingMetrics: {
      factualRetrievalAccuracy: 0.94,
      logicalInferencePrecision: 0.87,
      creativeSynthesisRougeL: 0.62,
      metaCognitionF1: 0.97,
    },
  });
  bundle.setCalibration(CALIB);
  return bundle;
}

function activeBundle(version: BundleVersion): AnalysisBundle {
  const bundle = completeDraft(version);
  bundle.promoteToShadow();
  bundle.promoteToActive({ now: NOW, displacedActive: null });
  return bundle;
}

(RUN ? describe : describe.skip)('Model Management PostgreSQL adapters (integration)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DSN });
    configurePool(pool);
    const ddl = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
    await pool.query(ddl('src/server/shared/outbox/ddl/0001_domain_event_outbox.sql'));
    await pool.query(ddl('src/server/contexts/model-management/infrastructure/ddl/0001_model_management.sql'));
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE analysis_bundles, shadow_deployments, domain_event_outbox');
  });

  afterAll(async () => {
    await closePool();
  });

  it('persists a bundle and its outbox events atomically in one transaction', async () => {
    const bundles = new PostgresAnalysisBundleRepository();
    const outbox = new PostgresOutboxStore();
    const reader = new PostgresOutboxReader();
    const version = BundleVersion.of('1.0.0');
    const bundle = activeBundle(version);
    const events = bundle.pullEvents();

    await withTransaction(async () => {
      await bundles.save(bundle, 0);
      await outbox.append(events.map((e) => wrapEvent<unknown>(e, envCtx())));
    });

    const loaded = await bundles.findByVersion(version);
    expect(loaded?.status).toBe('ACTIVE');
    expect(loaded?.members).toHaveLength(2);
    expect(loaded?.calibration?.factualRetrieval.a).toBe(1.0);

    const active = await bundles.findActive();
    expect(active?.bundleVersion.value).toBe('1.0.0');

    const unpublished = await reader.readUnpublished(10);
    expect(unpublished.length).toBeGreaterThan(0);
    expect(unpublished.some((e) => e.eventType === 'BundlePromotedToActive')).toBe(true);
  });

  it('rolls back the bundle write when the transaction throws', async () => {
    const bundles = new PostgresAnalysisBundleRepository();
    const version = BundleVersion.of('1.0.0');
    const bundle = activeBundle(version);
    await expect(
      withTransaction(async () => {
        await bundles.save(bundle, 0);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await bundles.findByVersion(version)).toBeNull();
  });

  it('enforces optimistic concurrency on save', async () => {
    const bundles = new PostgresAnalysisBundleRepository();
    const version = BundleVersion.of('1.0.0');
    const bundle = activeBundle(version);
    await withTransaction(() => bundles.save(bundle, 0));
    // Re-inserting with expectedVersion 0 collides on the primary key.
    await expect(
      withTransaction(() => bundles.save(activeBundle(version), 0)),
    ).rejects.toBeInstanceOf(AggregateVersionConflict);
  });

  it('enforces the at-most-one-ACTIVE invariant', async () => {
    const bundles = new PostgresAnalysisBundleRepository();
    const first = activeBundle(BundleVersion.of('1.0.0'));
    await withTransaction(() => bundles.save(first, 0));

    const second = activeBundle(BundleVersion.of('1.1.0'));
    await expect(
      withTransaction(() => bundles.save(second, 0)),
    ).rejects.toBeInstanceOf(ActiveBundleInvariantViolated);

    expect(await bundles.findByVersion(BundleVersion.of('1.1.0'))).toBeNull();
  });

  it('persists and reloads a shadow deployment', async () => {
    const repo = new PostgresShadowDeploymentRepository();
    const version = BundleVersion.of('1.0.0');
    const deployment = ShadowDeployment.open({
      id: ShadowDeploymentId.of('01HJK3R6X7Y8ZAB2C3D4E5F6S0'),
      bundleVersion: version,
      now: NOW,
    });
    await withTransaction(() => repo.save(deployment, 0));

    const reloaded = await repo.findByBundle(version);
    expect(reloaded?.status).toBe('OPEN');

    reloaded!.recordResult({
      analysisId: '01HJK3R6X7Y8ZAB2C3D4E5F6A0',
      metrics: {
        factualRetrievalAccuracy: 0.94,
        logicalInferencePrecision: 0.87,
        creativeSynthesisRougeL: 0.62,
        metaCognitionF1: 0.97,
      },
      now: NOW,
    });
    await withTransaction(() => repo.save(reloaded!, 1));

    const again = await repo.findByBundle(version);
    expect(again?.results).toHaveLength(1);
    expect(again?.results[0].analysisId).toBe('01HJK3R6X7Y8ZAB2C3D4E5F6A0');
  });
});
