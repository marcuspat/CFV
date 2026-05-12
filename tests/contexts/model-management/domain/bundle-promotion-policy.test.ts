import {
  BundlePromotionPolicy,
  DEFAULT_PROMOTION_CONFIG,
} from '../../../../src/server/contexts/model-management/domain/bundle-promotion-policy';
import type { CognitiveMetrics } from '../../../../src/server/contexts/model-management/domain/value-objects';

const PASSING: CognitiveMetrics = {
  factualRetrievalAccuracy:  0.94,
  logicalInferencePrecision: 0.87,
  creativeSynthesisRougeL:   0.62,
  metaCognitionF1:           0.97,
};
const FAILING_FACTUAL: CognitiveMetrics = {
  factualRetrievalAccuracy:  0.85,
  logicalInferencePrecision: 0.87,
  creativeSynthesisRougeL:   0.62,
  metaCognitionF1:           0.97,
};

function recordsOf(metrics: CognitiveMetrics, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    analysisId: `analysis-${i}`,
    metrics,
  }));
}

describe('BundlePromotionPolicy', () => {
  it('rejects insufficient sample size', () => {
    const decision = BundlePromotionPolicy.decide(recordsOf(PASSING, 10));
    expect(decision.eligible).toBe(false);
    expect(decision.eligible === false && decision.reason).toMatch(/insufficient/);
  });

  it('approves a healthy bundle once the sample size is met', () => {
    const decision = BundlePromotionPolicy.decide(recordsOf(PASSING, 50));
    expect(decision.eligible).toBe(true);
  });

  it('rejects when factual-retrieval is below floor', () => {
    const decision = BundlePromotionPolicy.decide(recordsOf(FAILING_FACTUAL, 50));
    expect(decision.eligible).toBe(false);
    expect(decision.eligible === false && decision.reason).toMatch(/FactualRetrieval/);
  });

  it('reports multiple failing dimensions together', () => {
    const bad: CognitiveMetrics = {
      factualRetrievalAccuracy:  0.5,
      logicalInferencePrecision: 0.5,
      creativeSynthesisRougeL:   0.2,
      metaCognitionF1:           0.7,
    };
    const decision = BundlePromotionPolicy.decide(recordsOf(bad, 50));
    expect(decision.eligible).toBe(false);
    expect(decision.eligible === false && decision.reason).toMatch(/FactualRetrieval/);
    expect(decision.eligible === false && decision.reason).toMatch(/MetaCognition/);
  });

  it('aggregate returns null on empty input', () => {
    expect(BundlePromotionPolicy.aggregate([])).toBeNull();
  });

  it('aggregate computes per-dimension means', () => {
    const records = [
      { analysisId: 'a', metrics: { ...PASSING, factualRetrievalAccuracy: 0.90 } },
      { analysisId: 'b', metrics: { ...PASSING, factualRetrievalAccuracy: 1.00 } },
    ];
    const out = BundlePromotionPolicy.aggregate(records)!;
    expect(out.factualRetrievalAccuracy).toBeCloseTo(0.95, 6);
  });

  it('config override allows a lower floor (e.g. tenant trial)', () => {
    const lowFloor = {
      ...DEFAULT_PROMOTION_CONFIG,
      floor: {
        ...DEFAULT_PROMOTION_CONFIG.floor,
        factualRetrievalAccuracy: 0.80,
      },
      minShadowAnalyses: 5,
    };
    const decision = BundlePromotionPolicy.decide(
      recordsOf(FAILING_FACTUAL, 5),
      lowFloor,
    );
    expect(decision.eligible).toBe(true);
  });
});
