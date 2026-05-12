/**
 * BundlePromotionPolicy domain service.
 *
 * Pure rule: given the aggregated metrics of a bundle's shadow analyses,
 * returns whether the bundle is eligible to be promoted ACTIVE.
 *
 * The four canonical thresholds (FactualRetrieval ≥0.92, LogicalInference
 * ≥0.85, CreativeSynthesis ROUGE-L ≥0.60, MetaCognition F1 ≥0.96) come
 * from ADR-0008 / ADR-0009 / ADR-0010 / ADR-0013 and are encoded in
 * `DEFAULT_PROMOTION_FLOOR`. The policy is configurable per bundle so
 * specialised contexts (e.g. tenant-specific eval) can override.
 *
 * The policy ALSO requires a minimum shadow-analysis sample size: a
 * bundle that has only run shadow against three conversations does not
 * have enough signal to be promoted regardless of its scores. The
 * default is 50 (a small-but-defensible figure; bump in a future ADR).
 */

import {
  DEFAULT_PROMOTION_FLOOR,
  type CognitiveMetrics,
  isCognitiveMetrics,
} from './value-objects';

export interface ShadowAnalysisRecord {
  readonly analysisId: string;
  readonly metrics: CognitiveMetrics;
}

export type PromotionDecision =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: string };

const ELIGIBLE: PromotionDecision = Object.freeze({ eligible: true });
function deny(reason: string): PromotionDecision {
  return Object.freeze({ eligible: false, reason });
}

export const DEFAULT_MIN_SHADOW_ANALYSES = 50;

export interface PromotionConfig {
  readonly floor: CognitiveMetrics;
  readonly minShadowAnalyses: number;
}

export const DEFAULT_PROMOTION_CONFIG: PromotionConfig = {
  floor: DEFAULT_PROMOTION_FLOOR,
  minShadowAnalyses: DEFAULT_MIN_SHADOW_ANALYSES,
};

export const BundlePromotionPolicy = {
  /** Aggregate per-dimension means across the shadow analyses. */
  aggregate(records: ReadonlyArray<ShadowAnalysisRecord>): CognitiveMetrics | null {
    if (records.length === 0) return null;
    let f = 0, l = 0, c = 0, m = 0;
    for (const r of records) {
      if (!isCognitiveMetrics(r.metrics)) continue;
      f += r.metrics.factualRetrievalAccuracy;
      l += r.metrics.logicalInferencePrecision;
      c += r.metrics.creativeSynthesisRougeL;
      m += r.metrics.metaCognitionF1;
    }
    const n = records.length;
    return {
      factualRetrievalAccuracy:  f / n,
      logicalInferencePrecision: l / n,
      creativeSynthesisRougeL:   c / n,
      metaCognitionF1:           m / n,
    };
  },

  decide(
    records: ReadonlyArray<ShadowAnalysisRecord>,
    config: PromotionConfig = DEFAULT_PROMOTION_CONFIG,
  ): PromotionDecision {
    if (records.length < config.minShadowAnalyses) {
      return deny(
        `insufficient shadow analyses: ${records.length} < ${config.minShadowAnalyses}`,
      );
    }
    const aggregated = this.aggregate(records);
    if (!aggregated) return deny('no metrics aggregated');

    const { floor } = config;
    const failures: string[] = [];
    if (aggregated.factualRetrievalAccuracy < floor.factualRetrievalAccuracy) {
      failures.push(
        `FactualRetrieval ${aggregated.factualRetrievalAccuracy.toFixed(3)} < ${floor.factualRetrievalAccuracy}`,
      );
    }
    if (aggregated.logicalInferencePrecision < floor.logicalInferencePrecision) {
      failures.push(
        `LogicalInference ${aggregated.logicalInferencePrecision.toFixed(3)} < ${floor.logicalInferencePrecision}`,
      );
    }
    if (aggregated.creativeSynthesisRougeL < floor.creativeSynthesisRougeL) {
      failures.push(
        `CreativeSynthesis ${aggregated.creativeSynthesisRougeL.toFixed(3)} < ${floor.creativeSynthesisRougeL}`,
      );
    }
    if (aggregated.metaCognitionF1 < floor.metaCognitionF1) {
      failures.push(
        `MetaCognition ${aggregated.metaCognitionF1.toFixed(3)} < ${floor.metaCognitionF1}`,
      );
    }
    if (failures.length > 0) {
      return deny(failures.join('; '));
    }
    return ELIGIBLE;
  },
};
