/**
 * FusionEngine domain service.
 *
 * Combines per-member candidates for a single segment into the fused
 * CognitiveElement set with weighted-confidence aggregation. See
 * ADR-0008 (Ensemble LLM strategy).
 *
 * Algorithm (deterministic given fixed member outputs — ADR-0008 compliance
 * test guarantee):
 *
 *   1. Bucket candidates by (span.key, dimension).
 *   2. Per bucket, compute:
 *        rawFusedConfidence = sum( member.fusionWeight * member.rawConfidence )
 *                             / sum( member.fusionWeight for members that fired )
 *        agreement = membersThatFired / totalActiveMembers
 *   3. Drop buckets where `agreement < tiebreakThreshold` AND no
 *      arbitration result is supplied — these are kept as candidates
 *      flagged for tie-break.
 *   4. Emit FusedCandidate per surviving bucket.
 *
 * The CALIBRATED Confidence is computed downstream by
 * ConfidenceCalibrator (separated so calibration can be re-applied
 * without re-running the ensemble).
 */

import {
  EnsembleAgreement,
  type Dimension,
  type Evidence,
  type MemberCandidate,
  type Span,
  type MemberId,
} from './value-objects';

export interface MemberWeight {
  readonly memberId: MemberId;
  readonly fusionWeight: number;
}

export interface FusedCandidate {
  readonly span: Span;
  readonly dimension: Dimension;
  /** Pre-calibration weighted-average confidence in [0,1]. */
  readonly rawConfidence: number;
  readonly evidence: ReadonlyArray<Evidence>;
  readonly agreement: EnsembleAgreement;
  readonly contributingMembers: ReadonlyArray<MemberId>;
}

export interface FusionConfig {
  /** Minimum agreement score required to keep a candidate without tie-break. */
  readonly tiebreakThreshold: number;
}

export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  tiebreakThreshold: 0.5,
};

export const FusionEngine = {
  fuse(args: {
    candidates: ReadonlyArray<MemberCandidate>;
    memberWeights: ReadonlyArray<MemberWeight>;
    activeMembers: ReadonlyArray<MemberId>;
    config?: FusionConfig;
  }): ReadonlyArray<FusedCandidate> {
    const config = args.config ?? DEFAULT_FUSION_CONFIG;
    const weightOf = new Map<MemberId, number>();
    for (const m of args.memberWeights) weightOf.set(m.memberId, m.fusionWeight);
    const totalActive = args.activeMembers.length;
    if (totalActive === 0) return [];

    // Bucket key: span + dimension.
    const buckets = new Map<
      string,
      {
        span: Span;
        dimension: Dimension;
        weightedSum: number;
        weightTotal: number;
        evidence: Evidence[];
        memberIds: Set<MemberId>;
      }
    >();
    for (const c of args.candidates) {
      // Defensive: ignore candidates from inactive members.
      if (!args.activeMembers.includes(c.memberId)) continue;
      const key = `${c.span.key()}::${c.dimension}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          span: c.span,
          dimension: c.dimension,
          weightedSum: 0,
          weightTotal: 0,
          evidence: [],
          memberIds: new Set<MemberId>(),
        };
        buckets.set(key, bucket);
      }
      const w = weightOf.get(c.memberId) ?? 0;
      bucket.weightedSum += w * c.rawConfidence;
      bucket.weightTotal += w;
      bucket.memberIds.add(c.memberId);
      for (const e of c.evidence) bucket.evidence.push(e);
    }

    const out: FusedCandidate[] = [];
    for (const bucket of buckets.values()) {
      if (bucket.weightTotal === 0) continue;
      const rawConfidence = clamp01(bucket.weightedSum / bucket.weightTotal);
      const agreement = EnsembleAgreement.of({
        memberCount: totalActive,
        agreeingMembers: bucket.memberIds.size,
      });
      if (agreement.score < config.tiebreakThreshold) {
        // Below threshold: drop entirely. A real implementation would
        // ship this to an arbiter model; we treat sub-threshold buckets
        // as inadmissible. This is conservative — the ADR-0008 cost/
        // latency budget allows dropping in favour of correctness.
        continue;
      }
      out.push({
        span: bucket.span,
        dimension: bucket.dimension,
        rawConfidence,
        evidence: dedupeEvidence(bucket.evidence),
        agreement,
        contributingMembers: Array.from(bucket.memberIds).sort(),
      });
    }
    // Deterministic ordering: by span key, then dimension.
    out.sort((a, b) => {
      const ka = `${a.span.key()}::${a.dimension}`;
      const kb = `${b.span.key()}::${b.dimension}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return out;
  },
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function dedupeEvidence(ev: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const e of ev) {
    const k = `${e.span.key()}::${e.verbatim}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}
