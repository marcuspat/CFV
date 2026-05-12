/**
 * End-to-end use-case tests for Model Management against the in-memory
 * adapters. Exercises:
 *
 *   - CreateBundleDraft + duplicate rejection
 *   - PromoteToShadow + DRAFT-only invariant
 *   - RecordShadowAnalysisResult + idempotency
 *   - PromoteToActive + at-most-one-active invariant + insufficient sample
 *   - RollbackToBundle
 *   - RecomputeCalibration
 *   - RepositoryBackedModelRegistry (published port)
 */

import { CreateBundleDraft } from '../../../../src/server/contexts/model-management/application/use-cases/create-bundle-draft';
import { PromoteToShadow } from '../../../../src/server/contexts/model-management/application/use-cases/promote-to-shadow';
import { RecordShadowAnalysisResult } from '../../../../src/server/contexts/model-management/application/use-cases/record-shadow-analysis-result';
import { PromoteToActive } from '../../../../src/server/contexts/model-management/application/use-cases/promote-to-active';
import { RollbackToBundle } from '../../../../src/server/contexts/model-management/application/use-cases/rollback-to-bundle';
import { RecomputeCalibration } from '../../../../src/server/contexts/model-management/application/use-cases/recompute-calibration';
import {
  ActiveBundleInvariantViolated,
  CapturingDomainEventPublisher,
  CountingIdGenerator,
  FixedClock,
  InMemoryAnalysisBundleRepository,
  InMemoryShadowDeploymentRepository,
  RepositoryBackedModelRegistry,
} from '../../../../src/server/contexts/model-management/infrastructure/in-memory';
import {
  BundleVersion,
  type CalibrationParameters,
  type CognitiveMetrics,
} from '../../../../src/server/contexts/model-management/domain/value-objects';

const CREATED_BY = '01HJK3R6X7Y8ZAB2C3D4E5F6Y0';
const NOW = new Date('2026-01-01T00:00:00Z');

const CALIB: CalibrationParameters = {
  factualRetrieval:  { a: 1, b: 0 },
  logicalInference:  { a: 1, b: 0 },
  creativeSynthesis: { a: 1, b: 0 },
  metaCognition:     { a: 1, b: 0 },
};

const PASSING_METRICS: CognitiveMetrics = {
  factualRetrievalAccuracy:  0.94,
  logicalInferencePrecision: 0.87,
  creativeSynthesisRougeL:   0.62,
  metaCognitionF1:           0.97,
};

const M1 = '01HJK3R6X7Y8ZAB2C3D4E5F6M0';
const M2 = '01HJK3R6X7Y8ZAB2C3D4E5F6M1';
const RP = '01HJK3R6X7Y8ZAB2C3D4E5F6R0';
const DGNN = '01HJK3R6X7Y8ZAB2C3D4E5F6D0';

function buildStack(opts?: { minShadowAnalyses?: number }) {
  const bundles = new InMemoryAnalysisBundleRepository();
  const shadows = new InMemoryShadowDeploymentRepository();
  const ids = new CountingIdGenerator();
  const clock = new FixedClock(NOW);
  const publisher = new CapturingDomainEventPublisher();

  const createDraft = new CreateBundleDraft({ bundles, clock, publisher });
  const promoteToShadow = new PromoteToShadow({ bundles, shadows, ids, clock, publisher });
  const recordShadow = new RecordShadowAnalysisResult({ shadows, clock, publisher });
  const promoteToActive = new PromoteToActive({
    bundles,
    shadows,
    clock,
    publisher,
    promotionConfig: opts?.minShadowAnalyses
      ? {
          floor: {
            factualRetrievalAccuracy:  0.92,
            logicalInferencePrecision: 0.85,
            creativeSynthesisRougeL:   0.60,
            metaCognitionF1:           0.96,
          },
          minShadowAnalyses: opts.minShadowAnalyses,
        }
      : undefined,
  });
  const rollback = new RollbackToBundle({ bundles, clock, publisher });
  const recompute = new RecomputeCalibration({ bundles, clock, publisher });

  return {
    bundles,
    shadows,
    publisher,
    createDraft,
    promoteToShadow,
    recordShadow,
    promoteToActive,
    rollback,
    recompute,
    registry: new RepositoryBackedModelRegistry(bundles),
  };
}

function draftInput(version: string, memberId = M1, memberId2 = M2) {
  return {
    bundleVersion: version,
    createdBy: CREATED_BY,
    members: [
      {
        id: memberId,
        provider: 'openai',
        modelName: 'gpt-4.1',
        promptTemplates: {},
        fusionWeight: 0.6,
      },
      {
        id: memberId2,
        provider: 'anthropic',
        modelName: 'claude-3.7',
        promptTemplates: {},
        fusionWeight: 0.4,
      },
    ],
    rulePack: { id: RP, rules: [] },
    dgnnModel: {
      id: DGNN,
      artefactKey: 'k',
      trainingMetrics: PASSING_METRICS,
    },
    calibration: CALIB,
  };
}

describe('CreateBundleDraft', () => {
  it('persists a DRAFT bundle and emits BundleDraftCreated', async () => {
    const s = buildStack();
    const r = await s.createDraft.execute(draftInput('1.0.0'));
    expect(r.ok).toBe(true);
    expect(s.publisher.events.map((e) => e.type)).toEqual(['BundleDraftCreated']);
  });

  it('rejects a duplicate version with Conflict', async () => {
    const s = buildStack();
    await s.createDraft.execute(draftInput('1.0.0'));
    const r = await s.createDraft.execute(draftInput('1.0.0'));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('Conflict');
  });

  it('rejects malformed BundleVersion', async () => {
    const s = buildStack();
    const r = await s.createDraft.execute(draftInput('not-a-version'));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });
});

describe('PromoteToShadow + RecordShadowAnalysisResult', () => {
  it('emits BundlePromotedToShadow and opens a ShadowDeployment', async () => {
    const s = buildStack();
    await s.createDraft.execute(draftInput('1.0.0'));
    s.publisher.events.length = 0;
    const r = await s.promoteToShadow.execute({ bundleVersion: '1.0.0' });
    expect(r.ok).toBe(true);
    expect(s.publisher.events.map((e) => e.type)).toEqual(['BundlePromotedToShadow']);
    expect(await s.shadows.findByBundle(BundleVersion.of('1.0.0'))).not.toBeNull();
  });

  it('refuses to re-promote a SHADOW bundle', async () => {
    const s = buildStack();
    await s.createDraft.execute(draftInput('1.0.0'));
    await s.promoteToShadow.execute({ bundleVersion: '1.0.0' });
    const r = await s.promoteToShadow.execute({ bundleVersion: '1.0.0' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('PreconditionFailed');
  });

  it('records shadow results idempotently', async () => {
    const s = buildStack();
    await s.createDraft.execute(draftInput('1.0.0'));
    await s.promoteToShadow.execute({ bundleVersion: '1.0.0' });
    s.publisher.events.length = 0;

    const first = await s.recordShadow.execute({
      bundleVersion: '1.0.0',
      analysisId: 'a1',
      metrics: PASSING_METRICS,
    });
    expect(first.ok && first.value.recorded).toBe(true);

    const second = await s.recordShadow.execute({
      bundleVersion: '1.0.0',
      analysisId: 'a1',
      metrics: PASSING_METRICS,
    });
    expect(second.ok && second.value.recorded).toBe(false);
    // Only one event should have been emitted across both calls.
    expect(s.publisher.events.map((e) => e.type)).toEqual(['ShadowAnalysisCompleted']);
  });
});

describe('PromoteToActive', () => {
  it('rejects with PreconditionFailed when shadow metrics are insufficient', async () => {
    const s = buildStack({ minShadowAnalyses: 5 });
    await s.createDraft.execute(draftInput('1.0.0'));
    await s.promoteToShadow.execute({ bundleVersion: '1.0.0' });
    // Only record 2 shadow analyses; minShadowAnalyses is 5.
    await s.recordShadow.execute({
      bundleVersion: '1.0.0',
      analysisId: 'a1',
      metrics: PASSING_METRICS,
    });
    await s.recordShadow.execute({
      bundleVersion: '1.0.0',
      analysisId: 'a2',
      metrics: PASSING_METRICS,
    });
    const r = await s.promoteToActive.execute({ bundleVersion: '1.0.0' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('PreconditionFailed');
    expect(r.ok === false && r.error.reason).toMatch(/insufficient/);
  });

  it('promotes when policy approves and atomically RETIREs the displaced active', async () => {
    const s = buildStack({ minShadowAnalyses: 3 });
    // Build + activate 1.0.0
    await s.createDraft.execute(draftInput('1.0.0'));
    await s.promoteToShadow.execute({ bundleVersion: '1.0.0' });
    for (let i = 0; i < 3; i++) {
      await s.recordShadow.execute({
        bundleVersion: '1.0.0',
        analysisId: `a${i}`,
        metrics: PASSING_METRICS,
      });
    }
    const first = await s.promoteToActive.execute({ bundleVersion: '1.0.0' });
    expect(first.ok && first.value.displaced).toBeNull();
    expect(s.bundles.statuses()).toEqual({ '1.0.0': 'ACTIVE' });

    // Build + activate 1.1.0 — should displace 1.0.0
    const draft2 = draftInput('1.1.0', '01HJK3R6X7Y8ZAB2C3D4E5F6M2', '01HJK3R6X7Y8ZAB2C3D4E5F6M3');
    await s.createDraft.execute(draft2);
    await s.promoteToShadow.execute({ bundleVersion: '1.1.0' });
    for (let i = 0; i < 3; i++) {
      await s.recordShadow.execute({
        bundleVersion: '1.1.0',
        analysisId: `b${i}`,
        metrics: PASSING_METRICS,
      });
    }
    s.publisher.events.length = 0;
    const second = await s.promoteToActive.execute({ bundleVersion: '1.1.0' });
    expect(second.ok && second.value.displaced).toBe('1.0.0');
    expect(s.bundles.statuses()).toEqual({ '1.0.0': 'RETIRED', '1.1.0': 'ACTIVE' });
    const ev = s.publisher.events.find((e) => e.type === 'BundlePromotedToActive') as any;
    expect(ev.payload.previousActive).toBe('1.0.0');
  });
});

describe('RollbackToBundle', () => {
  async function buildAndPromoteTwo(s: ReturnType<typeof buildStack>) {
    await s.createDraft.execute(draftInput('1.0.0'));
    await s.promoteToShadow.execute({ bundleVersion: '1.0.0' });
    for (let i = 0; i < 3; i++) {
      await s.recordShadow.execute({
        bundleVersion: '1.0.0',
        analysisId: `a${i}`,
        metrics: PASSING_METRICS,
      });
    }
    await s.promoteToActive.execute({ bundleVersion: '1.0.0' });

    await s.createDraft.execute(
      draftInput('1.1.0', '01HJK3R6X7Y8ZAB2C3D4E5F6M2', '01HJK3R6X7Y8ZAB2C3D4E5F6M3'),
    );
    await s.promoteToShadow.execute({ bundleVersion: '1.1.0' });
    for (let i = 0; i < 3; i++) {
      await s.recordShadow.execute({
        bundleVersion: '1.1.0',
        analysisId: `b${i}`,
        metrics: PASSING_METRICS,
      });
    }
    await s.promoteToActive.execute({ bundleVersion: '1.1.0' });
  }

  it('rolls ACTIVE back to a prior RETIRED bundle and emits BundleRolledBack', async () => {
    const s = buildStack({ minShadowAnalyses: 3 });
    await buildAndPromoteTwo(s);
    s.publisher.events.length = 0;

    const r = await s.rollback.execute({ targetVersion: '1.0.0', reason: 'regression' });
    expect(r.ok).toBe(true);
    expect(s.bundles.statuses()).toEqual({ '1.0.0': 'ACTIVE', '1.1.0': 'RETIRED' });
    expect(s.publisher.events.map((e) => e.type)).toEqual(['BundleRolledBack']);
  });

  it('rejects rollback to an ACTIVE target', async () => {
    const s = buildStack({ minShadowAnalyses: 3 });
    await buildAndPromoteTwo(s);
    const r = await s.rollback.execute({ targetVersion: '1.1.0', reason: 'x' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('PreconditionFailed');
  });
});

describe('RecomputeCalibration', () => {
  it('emits CalibrationRecomputed on the ACTIVE bundle', async () => {
    const s = buildStack({ minShadowAnalyses: 3 });
    await s.createDraft.execute(draftInput('1.0.0'));
    await s.promoteToShadow.execute({ bundleVersion: '1.0.0' });
    for (let i = 0; i < 3; i++) {
      await s.recordShadow.execute({
        bundleVersion: '1.0.0',
        analysisId: `a${i}`,
        metrics: PASSING_METRICS,
      });
    }
    await s.promoteToActive.execute({ bundleVersion: '1.0.0' });
    s.publisher.events.length = 0;

    const r = await s.recompute.execute({
      bundleVersion: '1.0.0',
      calibration: CALIB,
    });
    expect(r.ok).toBe(true);
    expect(s.publisher.events.map((e) => e.type)).toEqual(['CalibrationRecomputed']);
  });
});

describe('RepositoryBackedModelRegistry (published port)', () => {
  it('returns the active bundle to downstream consumers', async () => {
    const s = buildStack({ minShadowAnalyses: 3 });
    await s.createDraft.execute(draftInput('1.0.0'));
    await s.promoteToShadow.execute({ bundleVersion: '1.0.0' });
    for (let i = 0; i < 3; i++) {
      await s.recordShadow.execute({
        bundleVersion: '1.0.0',
        analysisId: `a${i}`,
        metrics: PASSING_METRICS,
      });
    }
    await s.promoteToActive.execute({ bundleVersion: '1.0.0' });
    const active = await s.registry.activeBundle();
    expect(active.bundleVersion.value).toBe('1.0.0');
  });

  it('throws if no active bundle has been promoted', async () => {
    const s = buildStack();
    await expect(s.registry.activeBundle()).rejects.toThrow(/No ACTIVE bundle/);
  });
});

describe('InMemoryAnalysisBundleRepository invariants', () => {
  it('refuses two concurrent ACTIVE bundles', async () => {
    // Simulate a buggy use case that doesn't displace the existing active.
    const s = buildStack({ minShadowAnalyses: 3 });
    await s.createDraft.execute(draftInput('1.0.0'));
    await s.promoteToShadow.execute({ bundleVersion: '1.0.0' });
    for (let i = 0; i < 3; i++) {
      await s.recordShadow.execute({
        bundleVersion: '1.0.0',
        analysisId: `a${i}`,
        metrics: PASSING_METRICS,
      });
    }
    await s.promoteToActive.execute({ bundleVersion: '1.0.0' });

    // Build a second bundle and try to save it as ACTIVE without
    // displacing the first — must be rejected by the repository.
    const bundle1 = await s.bundles.findActive();
    if (!bundle1) throw new Error('expected active');
    const { AnalysisBundle } = await import(
      '../../../../src/server/contexts/model-management/domain/analysis-bundle'
    );
    const {
      BundleVersion,
      MemberId,
      RulePackId,
      DgnnModelId,
      UserId,
      makeMember,
      makeRulePack,
    } = await import(
      '../../../../src/server/contexts/model-management/domain/value-objects'
    );

    const sneaky = AnalysisBundle.createDraft({
      version: BundleVersion.of('1.1.0'),
      createdBy: UserId.of(CREATED_BY),
      now: NOW,
    });
    sneaky.addMember(
      makeMember({
        id: MemberId.of('01HJK3R6X7Y8ZAB2C3D4E5F6M4'),
        provider: 'openai',
        modelName: 'gpt-4.1',
        promptTemplates: {},
        fusionWeight: 1.0,
      }),
    );
    sneaky.setRulePack(
      makeRulePack({ id: RulePackId.of('01HJK3R6X7Y8ZAB2C3D4E5F6R1'), rules: [] }),
    );
    sneaky.setDgnnModel({
      id: DgnnModelId.of('01HJK3R6X7Y8ZAB2C3D4E5F6D1'),
      artefactKey: 'k',
      trainingMetrics: PASSING_METRICS,
    });
    sneaky.setCalibration(CALIB);
    sneaky.promoteToShadow();
    sneaky.promoteToActive({ now: NOW, displacedActive: null });

    await expect(s.bundles.save(sneaky, 0)).rejects.toThrow(ActiveBundleInvariantViolated);
  });
});
