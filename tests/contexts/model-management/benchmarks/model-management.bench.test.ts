/**
 * Microbenchmarks for Model Management hot paths.
 *
 * BundlePromotionPolicy.decide runs on every promote-to-active attempt
 * (cheap, pure aggregation + threshold check). AnalysisBundle.createDraft
 * is the construction path for the aggregate.
 */

import {
  BundlePromotionPolicy,
  DEFAULT_PROMOTION_CONFIG,
} from '../../../../src/server/contexts/model-management/domain/bundle-promotion-policy';
import { AnalysisBundle } from '../../../../src/server/contexts/model-management/domain/analysis-bundle';
import {
  BundleVersion,
  UserId,
  type CognitiveMetrics,
} from '../../../../src/server/contexts/model-management/domain/value-objects';

const VERSION = BundleVersion.of('1.0.0');
const CREATED_BY = UserId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Y0');
const NOW = new Date('2026-01-01T00:00:00Z');

const PASSING: CognitiveMetrics = {
  factualRetrievalAccuracy:  0.94,
  logicalInferencePrecision: 0.87,
  creativeSynthesisRougeL:   0.62,
  metaCognitionF1:           0.97,
};

function benchmark(label: string, iterations: number, fn: () => void): number {
  for (let i = 0; i < Math.min(iterations, 1_000); i++) fn(); // warm-up
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) fn();
  const end = process.hrtime.bigint();
  const totalNs = Number(end - start);
  const perOp = totalNs / iterations;
  // eslint-disable-next-line no-console
  console.log(
    `[bench] ${label}: ${iterations.toLocaleString()} ops in ` +
      `${(totalNs / 1e6).toFixed(2)} ms — ${perOp.toFixed(0)} ns/op (` +
      `${Math.round(1e9 / perOp).toLocaleString()} ops/sec)`,
  );
  return perOp;
}

describe('model management microbenchmarks', () => {
  it('BundlePromotionPolicy.decide on 100 shadow records', () => {
    const records = Array.from({ length: 100 }, (_, i) => ({
      analysisId: `a-${i}`,
      metrics: PASSING,
    }));
    const perOp = benchmark('BundlePromotionPolicy.decide (n=100)', 20_000, () => {
      BundlePromotionPolicy.decide(records, {
        ...DEFAULT_PROMOTION_CONFIG,
        minShadowAnalyses: 50,
      });
    });
    // 100-record aggregation is O(n); budget 100 µs.
    expect(perOp).toBeLessThan(100_000);
  });

  it('AnalysisBundle.createDraft construction', () => {
    const perOp = benchmark('AnalysisBundle.createDraft', 10_000, () => {
      const bundle = AnalysisBundle.createDraft({
        version: VERSION,
        createdBy: CREATED_BY,
        now: NOW,
      });
      bundle.pullEvents();
    });
    expect(perOp).toBeLessThan(50_000);
  });
});
