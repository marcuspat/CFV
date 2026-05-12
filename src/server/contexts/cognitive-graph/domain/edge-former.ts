/**
 * EdgeFormer domain service.
 *
 * Decides whether two CognitiveElements should be connected, with what
 * edge type and weight, given the current graph state and the new nodes
 * just emitted from the Cognitive Analysis pipeline (ADR-0010,
 * docs/ddd/09-domain-services.md § "EdgeFormer").
 *
 * The PRODUCTION implementation delegates to a DGNN adapter (Python ML
 * sidecar). This module is the pure-rule core: given pairwise scores
 * from the DGNN port, decide how the scores translate to:
 *
 *   - OBSERVED edges (high score, score >= observedThreshold)
 *   - PREDICTED edges (score in [predictedFloor, observedThreshold))
 *   - dropped pairs (score < predictedFloor)
 *
 * The translation rule is the *domain* part — what counts as observed
 * vs predicted vs dropped is part of the product's UX contract
 * (ADR-0010, ADR-0013) and we want it tested and stable.
 */

import type {
  CognitiveElementId,
  Dimension,
  EdgeType,
  GraphNode,
} from './value-objects';

export interface PairwiseScore {
  readonly from: CognitiveElementId;
  readonly to: CognitiveElementId;
  /** Edge-formation score in [0, 1]. */
  readonly score: number;
  /** Edge type proposed by the upstream model. */
  readonly edgeType: EdgeType;
  /** Per-member-variance derived spread of the score (0..1). */
  readonly spread?: number;
}

export interface EdgeProposal {
  readonly from: CognitiveElementId;
  readonly to: CognitiveElementId;
  readonly edgeType: EdgeType;
  readonly score: number;
  readonly kind: 'OBSERVED' | 'PREDICTED' | 'DROPPED';
  /** Spread (uncertainty) at the time of proposal. */
  readonly spread: number;
}

export interface EdgeFormerConfig {
  readonly observedThreshold: number;   // >= → OBSERVED
  readonly predictedFloor:    number;   // [floor, observedThreshold) → PREDICTED
}

export const DEFAULT_EDGE_FORMER_CONFIG: EdgeFormerConfig = {
  observedThreshold: 0.75,
  predictedFloor:    0.40,
};

export const EdgeFormer = {
  /**
   * Decide proposals for a batch of pairwise scores.
   *
   * Self-edges (from === to) and edges that reference a node not in the
   * provided `existingNodes` set are dropped silently — the application
   * service is responsible for invariant enforcement, not the rule.
   */
  decide(args: {
    scores: ReadonlyArray<PairwiseScore>;
    existingNodes: ReadonlyMap<CognitiveElementId, GraphNode>;
    config?: EdgeFormerConfig;
  }): ReadonlyArray<EdgeProposal> {
    const cfg = args.config ?? DEFAULT_EDGE_FORMER_CONFIG;
    if (cfg.predictedFloor < 0 || cfg.observedThreshold > 1) {
      throw new Error('EdgeFormerConfig thresholds must lie in [0,1]');
    }
    if (cfg.predictedFloor > cfg.observedThreshold) {
      throw new Error('predictedFloor must be <= observedThreshold');
    }
    const out: EdgeProposal[] = [];
    for (const s of args.scores) {
      if (s.from === s.to) continue; // no self-edges
      if (!args.existingNodes.has(s.from) || !args.existingNodes.has(s.to)) {
        continue;
      }
      const clamped = clamp01(s.score);
      const spread = s.spread ?? 0;
      const kind: EdgeProposal['kind'] =
        clamped >= cfg.observedThreshold
          ? 'OBSERVED'
          : clamped >= cfg.predictedFloor
            ? 'PREDICTED'
            : 'DROPPED';
      out.push({
        from: s.from,
        to: s.to,
        edgeType: s.edgeType,
        score: clamped,
        kind,
        spread,
      });
    }
    // Deterministic ordering for reproducibility.
    out.sort((a, b) => (`${a.from}->${a.to}::${a.edgeType}` < `${b.from}->${b.to}::${b.edgeType}` ? -1 : 1));
    return out;
  },
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

// Re-export for adapter convenience.
export type { Dimension };
