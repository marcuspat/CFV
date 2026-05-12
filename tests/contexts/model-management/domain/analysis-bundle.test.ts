import { AnalysisBundle } from '../../../../src/server/contexts/model-management/domain/analysis-bundle';
import {
  BundleVersion,
  DgnnModelId,
  MemberId,
  RulePackId,
  UserId,
  makeMember,
  makeRulePack,
  type CalibrationParameters,
} from '../../../../src/server/contexts/model-management/domain/value-objects';
import {
  BundleImmutable,
  BundleIncomplete,
  InvalidBundleTransition,
} from '../../../../src/server/contexts/model-management/domain/errors';

const VERSION = BundleVersion.of('1.0.0');
const VERSION_NEXT = BundleVersion.of('1.1.0');
const CREATED_BY = UserId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Y0');
const NOW = new Date('2026-01-01T00:00:00Z');

const CALIB: CalibrationParameters = {
  factualRetrieval:  { a: 1.0, b: 0.0 },
  logicalInference:  { a: 1.0, b: 0.0 },
  creativeSynthesis: { a: 1.0, b: 0.0 },
  metaCognition:     { a: 1.0, b: 0.0 },
};

function makeCompleteDraft(): AnalysisBundle {
  const bundle = AnalysisBundle.createDraft({ version: VERSION, createdBy: CREATED_BY, now: NOW });
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
    artefactKey: 'bundle/1.0.0/dgnn-1',
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

describe('AnalysisBundle aggregate', () => {
  it('emits BundleDraftCreated on construction', () => {
    const bundle = AnalysisBundle.createDraft({ version: VERSION, createdBy: CREATED_BY, now: NOW });
    const events = bundle.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('BundleDraftCreated');
    expect(events[0].payload.bundleVersion).toBe('1.0.0');
  });

  describe('promoteToShadow', () => {
    it('requires a complete bundle', () => {
      const incomplete = AnalysisBundle.createDraft({ version: VERSION, createdBy: CREATED_BY, now: NOW });
      expect(() => incomplete.promoteToShadow()).toThrow(BundleIncomplete);
    });

    it('requires member fusion weights to sum to 1', () => {
      const bundle = makeCompleteDraft();
      // Mutate the snapshot by adding a member that breaks the sum.
      bundle.addMember(
        makeMember({
          id: MemberId.of('01HJK3R6X7Y8ZAB2C3D4E5F6M2'),
          provider: 'extra',
          modelName: 'model',
          promptTemplates: {},
          fusionWeight: 0.5,
        }),
      );
      expect(() => bundle.promoteToShadow()).toThrow(BundleIncomplete);
    });

    it('transitions to SHADOW and emits BundlePromotedToShadow', () => {
      const bundle = makeCompleteDraft();
      bundle.pullEvents();
      bundle.promoteToShadow();
      expect(bundle.isShadow).toBe(true);
      const ev = bundle.pullEvents();
      expect(ev.map((e) => e.type)).toEqual(['BundlePromotedToShadow']);
    });

    it('forbids editing once in SHADOW', () => {
      const bundle = makeCompleteDraft();
      bundle.promoteToShadow();
      expect(() => bundle.setCalibration(CALIB)).toThrow(BundleImmutable);
      expect(() =>
        bundle.addMember(
          makeMember({
            id: MemberId.of('01HJK3R6X7Y8ZAB2C3D4E5F6M9'),
            provider: 'x',
            modelName: 'm',
            promptTemplates: {},
            fusionWeight: 0.1,
          }),
        ),
      ).toThrow(BundleImmutable);
    });
  });

  describe('promoteToActive', () => {
    it('requires the bundle to be SHADOW', () => {
      const bundle = makeCompleteDraft();
      expect(() =>
        bundle.promoteToActive({ now: NOW, displacedActive: null }),
      ).toThrow(InvalidBundleTransition);
    });

    it('promotes SHADOW -> ACTIVE without a prior active', () => {
      const bundle = makeCompleteDraft();
      bundle.promoteToShadow();
      bundle.pullEvents();
      bundle.promoteToActive({ now: NOW, displacedActive: null });
      expect(bundle.isActive).toBe(true);
      const ev = bundle.pullEvents();
      expect(ev.map((e) => e.type)).toEqual(['BundlePromotedToActive']);
      expect((ev[0] as any).payload.previousActive).toBeUndefined();
    });

    it('atomically RETIREs a displaced active bundle', () => {
      const prevActive = makeCompleteDraft();
      prevActive.promoteToShadow();
      prevActive.promoteToActive({ now: NOW, displacedActive: null });
      expect(prevActive.isActive).toBe(true);

      const next = AnalysisBundle.createDraft({ version: VERSION_NEXT, createdBy: CREATED_BY, now: NOW });
      next.addMember(makeMember({
        id: MemberId.of('01HJK3R6X7Y8ZAB2C3D4E5F6M3'),
        provider: 'openai',
        modelName: 'gpt-4.1',
        promptTemplates: {},
        fusionWeight: 1.0,
      }));
      next.setRulePack(makeRulePack({
        id: RulePackId.of('01HJK3R6X7Y8ZAB2C3D4E5F6R1'),
        rules: [],
      }));
      next.setDgnnModel({
        id: DgnnModelId.of('01HJK3R6X7Y8ZAB2C3D4E5F6D1'),
        artefactKey: 'k',
        trainingMetrics: {
          factualRetrievalAccuracy: 0.93,
          logicalInferencePrecision: 0.86,
          creativeSynthesisRougeL: 0.61,
          metaCognitionF1: 0.96,
        },
      });
      next.setCalibration(CALIB);
      next.promoteToShadow();
      next.pullEvents();

      next.promoteToActive({ now: NOW, displacedActive: prevActive });

      expect(next.isActive).toBe(true);
      expect(prevActive.isRetired).toBe(true);
      const ev = next.pullEvents();
      expect(ev).toHaveLength(1);
      expect((ev[0] as any).payload.previousActive).toBe('1.0.0');
    });
  });

  describe('rollback path', () => {
    it('restoreFromRollback requires the bundle to be RETIRED', () => {
      const bundle = makeCompleteDraft();
      bundle.promoteToShadow();
      bundle.promoteToActive({ now: NOW, displacedActive: null });
      expect(() =>
        bundle.restoreFromRollback({
          fromVersion: VERSION_NEXT,
          reason: 'test',
          now: NOW,
        }),
      ).toThrow(InvalidBundleTransition);
    });

    it('emits BundleRolledBack on restore', () => {
      const bundle = makeCompleteDraft();
      bundle.promoteToShadow();
      bundle.promoteToActive({ now: NOW, displacedActive: null });
      bundle.retire();
      bundle.pullEvents();
      bundle.restoreFromRollback({
        fromVersion: VERSION_NEXT,
        reason: 'regression',
        now: NOW,
      });
      const ev = bundle.pullEvents();
      expect(ev.map((e) => e.type)).toEqual(['BundleRolledBack']);
      expect((ev[0] as any).payload.from).toBe('1.1.0');
      expect((ev[0] as any).payload.to).toBe('1.0.0');
    });
  });

  describe('recomputeCalibration', () => {
    it('is allowed on ACTIVE bundles and emits CalibrationRecomputed', () => {
      const bundle = makeCompleteDraft();
      bundle.promoteToShadow();
      bundle.promoteToActive({ now: NOW, displacedActive: null });
      bundle.pullEvents();
      bundle.recomputeCalibration(CALIB, NOW);
      const ev = bundle.pullEvents();
      expect(ev.map((e) => e.type)).toEqual(['CalibrationRecomputed']);
    });

    it('is forbidden on RETIRED bundles', () => {
      const bundle = makeCompleteDraft();
      bundle.promoteToShadow();
      bundle.promoteToActive({ now: NOW, displacedActive: null });
      bundle.retire();
      expect(() => bundle.recomputeCalibration(CALIB, NOW)).toThrow(InvalidBundleTransition);
    });
  });
});
