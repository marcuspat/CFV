/**
 * UncertaintyQuantifier domain service.
 *
 * Given the calibrated confidence and the ensemble's per-member raw
 * probabilities for the same candidate, returns a ConfidenceInterval
 * (low / median / high) using member-variance as the spread proxy.
 *
 * This is a deliberately simple estimator suitable for the v1 of CFV
 * (ADR-0013). Future work may replace it with a Bayesian estimator;
 * the domain-service shape stays the same.
 */

import {
  Confidence,
  ConfidenceInterval,
} from './value-objects';

export const UncertaintyQuantifier = {
  /**
   * @param calibrated The calibrated confidence value (Confidence).
   * @param perMemberRaw Per-member raw probabilities for this candidate.
   *                     Must include at least one entry.
   * @param widthScale 1 = ±1 σ; 1.96 = ~95% interval under normality.
   */
  quantify(args: {
    calibrated: Confidence;
    perMemberRaw: ReadonlyArray<number>;
    widthScale?: number;
  }): ConfidenceInterval {
    if (args.perMemberRaw.length === 0) {
      // Degenerate case: a single-point interval at the calibrated value.
      return ConfidenceInterval.of({
        low: args.calibrated,
        median: args.calibrated,
        high: args.calibrated,
      });
    }
    const scale = args.widthScale ?? 1;
    const mean = average(args.perMemberRaw);
    const std = stddev(args.perMemberRaw, mean);
    const half = std * scale;
    const median = args.calibrated.value;
    const low = clamp01(median - half);
    const high = clamp01(median + half);
    return ConfidenceInterval.of({
      low: Confidence.of(low),
      median: args.calibrated,
      high: Confidence.of(high),
    });
  },
};

function average(values: ReadonlyArray<number>): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function stddev(values: ReadonlyArray<number>, mean: number): number {
  if (values.length <= 1) return 0;
  let sq = 0;
  for (const v of values) {
    const d = v - mean;
    sq += d * d;
  }
  return Math.sqrt(sq / (values.length - 1));
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
