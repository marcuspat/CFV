/**
 * ConfidenceCalibrator domain service.
 *
 * Pure rule (ADR-0013): maps a raw model probability to a calibrated
 * Confidence using Platt scaling. The per-dimension (a, b) parameters
 * live on the active AnalysisBundle (Phase 3), so the calibrator is
 * stateless — application services pass the parameters in.
 *
 *   calibrated = sigmoid(a * raw + b)
 *
 * The default identity calibration (a=1, b=0) maps raw -> sigmoid(raw),
 * which is monotonic on the raw probability and well-defined on [0,1].
 */

import { Confidence, type Dimension } from './value-objects';

export interface PlattParameters {
  readonly a: number;
  readonly b: number;
}

export interface PerDimensionCalibration {
  readonly factualRetrieval:  PlattParameters;
  readonly logicalInference:  PlattParameters;
  readonly creativeSynthesis: PlattParameters;
  readonly metaCognition:     PlattParameters;
}

function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  // numerically stable form for large negative x
  const z = Math.exp(x);
  return z / (1 + z);
}

const KEYS: Record<Dimension, keyof PerDimensionCalibration> = {
  FACTUAL_RETRIEVAL:  'factualRetrieval',
  LOGICAL_INFERENCE:  'logicalInference',
  CREATIVE_SYNTHESIS: 'creativeSynthesis',
  META_COGNITION:     'metaCognition',
};

export const ConfidenceCalibrator = {
  calibrate(
    raw: number,
    dimension: Dimension,
    params: PerDimensionCalibration,
  ): Confidence {
    const p = params[KEYS[dimension]];
    const value = sigmoid(p.a * raw + p.b);
    return Confidence.clamp(value);
  },
};
