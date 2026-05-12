/**
 * SymbolicReasoner domain service.
 *
 * Applies the bundle's RulePack to the FusionEngine output (ADR-0009).
 *
 *   - Hard rules: predicate over the candidate. A candidate that fails
 *     a hard rule is DROPPED. Hard rules embody must-hold constraints
 *     (e.g. "factual_retrieval candidates must include at least one
 *     evidence span").
 *   - Soft rules: predicate over the candidate with a weight in [0,1].
 *     If the rule fires, the candidate's confidence is *multiplied* by
 *     the rule's weight. (Multiplicative aggregation keeps the result
 *     in [0,1] and means failing any soft rule attenuates rather than
 *     elevates.)
 *
 * The reasoner is pure and deterministic given (candidates, predicates).
 * Predicates are TypeScript functions injected by the application layer
 * — the symbolic-rule *pack* (from the AnalysisBundle) is just a name +
 * kind + weight; the actual predicate code lives in the Cognitive
 * Analysis context because predicates may reference domain types.
 */

import type { FusedCandidate } from './fusion-engine';

export interface SymbolicRulePredicate {
  readonly name: string;
  readonly kind: 'hard' | 'soft';
  /** For soft rules. Ignored for hard rules. */
  readonly weight: number;
  /** Returns true if the rule fires for this candidate. */
  readonly fires: (c: FusedCandidate) => boolean;
}

export interface SymbolicTraceEntry {
  readonly ruleName: string;
  readonly kind: 'hard' | 'soft';
  readonly fired: boolean;
  /** Applied multiplier for soft rules; 1 means no-op. */
  readonly multiplier: number;
}

export interface ReasonedCandidate {
  readonly candidate: FusedCandidate;
  /** Confidence after soft-rule attenuation, still raw (pre-calibration). */
  readonly attenuatedRawConfidence: number;
  readonly trace: ReadonlyArray<SymbolicTraceEntry>;
}

export const SymbolicReasoner = {
  apply(args: {
    candidates: ReadonlyArray<FusedCandidate>;
    rules: ReadonlyArray<SymbolicRulePredicate>;
  }): ReadonlyArray<ReasonedCandidate> {
    const out: ReasonedCandidate[] = [];
    for (const candidate of args.candidates) {
      const trace: SymbolicTraceEntry[] = [];
      let kept = true;
      let multiplier = 1;
      for (const rule of args.rules) {
        const fired = safeFire(rule, candidate);
        if (rule.kind === 'hard') {
          // Hard-rule semantics: rule must hold (fire = true). If it
          // does not fire on a candidate, that candidate is INVALID and
          // dropped. This matches the ADR-0009 example
          // "factual retrieval must reference an entity".
          if (!fired) {
            trace.push({ ruleName: rule.name, kind: 'hard', fired: false, multiplier: 0 });
            kept = false;
            break;
          }
          trace.push({ ruleName: rule.name, kind: 'hard', fired: true, multiplier: 1 });
        } else {
          // Soft-rule semantics: when the rule fires, multiply confidence
          // by the rule's weight. Non-firing soft rules are no-ops.
          if (fired) {
            multiplier *= clamp01(rule.weight);
            trace.push({
              ruleName: rule.name,
              kind: 'soft',
              fired: true,
              multiplier: rule.weight,
            });
          } else {
            trace.push({ ruleName: rule.name, kind: 'soft', fired: false, multiplier: 1 });
          }
        }
      }
      if (!kept) continue;
      const attenuated = clamp01(candidate.rawConfidence * multiplier);
      out.push({ candidate, attenuatedRawConfidence: attenuated, trace });
    }
    return out;
  },
};

function safeFire(rule: SymbolicRulePredicate, c: FusedCandidate): boolean {
  try {
    return Boolean(rule.fires(c));
  } catch {
    // A throwing predicate is treated as a non-firing rule and recorded
    // in the trace; the upstream config error is a separate concern.
    return false;
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
