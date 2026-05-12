import {
  Confidence,
  EnsembleAgreement,
  MemberId,
  Span,
  TurnId,
} from '../../../../src/server/contexts/cognitive-analysis/domain/value-objects';
import { ConfidenceCalibrator } from '../../../../src/server/contexts/cognitive-analysis/domain/confidence-calibrator';
import { FusionEngine } from '../../../../src/server/contexts/cognitive-analysis/domain/fusion-engine';
import { SymbolicReasoner } from '../../../../src/server/contexts/cognitive-analysis/domain/symbolic-reasoner';
import { UncertaintyQuantifier } from '../../../../src/server/contexts/cognitive-analysis/domain/uncertainty-quantifier';

const TURN = TurnId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Q0');
const SPAN = Span.of(TURN, 0, 5);
const M1 = MemberId.of('01HJK3R6X7Y8ZAB2C3D4E5F6M0');
const M2 = MemberId.of('01HJK3R6X7Y8ZAB2C3D4E5F6M1');

const IDENTITY_CALIB = {
  factualRetrieval:  { a: 1, b: 0 },
  logicalInference:  { a: 1, b: 0 },
  creativeSynthesis: { a: 1, b: 0 },
  metaCognition:     { a: 1, b: 0 },
};

describe('ConfidenceCalibrator', () => {
  it('is monotonic on raw input', () => {
    const low  = ConfidenceCalibrator.calibrate(-2, 'FACTUAL_RETRIEVAL', IDENTITY_CALIB);
    const mid  = ConfidenceCalibrator.calibrate( 0, 'FACTUAL_RETRIEVAL', IDENTITY_CALIB);
    const high = ConfidenceCalibrator.calibrate( 2, 'FACTUAL_RETRIEVAL', IDENTITY_CALIB);
    expect(low.value).toBeLessThan(mid.value);
    expect(mid.value).toBeLessThan(high.value);
  });

  it('handles per-dimension parameters independently', () => {
    const params = {
      ...IDENTITY_CALIB,
      // Identity (a=1,b=0) at raw=1 -> sigmoid(1). These params at raw=1
      // -> sigmoid(-1), which is different. Avoids the trap where
      // a*raw+b happens to collapse to the identity input.
      logicalInference: { a: 2, b: -3 },
    };
    const factual = ConfidenceCalibrator.calibrate(1, 'FACTUAL_RETRIEVAL', params);
    const logical = ConfidenceCalibrator.calibrate(1, 'LOGICAL_INFERENCE', params);
    expect(factual.value).not.toBe(logical.value);
    expect(factual.value).toBeGreaterThan(logical.value);
  });

  it('clamps to [0,1] on extreme inputs', () => {
    const extremeLow  = ConfidenceCalibrator.calibrate(-1000, 'META_COGNITION', IDENTITY_CALIB);
    const extremeHigh = ConfidenceCalibrator.calibrate( 1000, 'META_COGNITION', IDENTITY_CALIB);
    expect(extremeLow.value).toBeGreaterThanOrEqual(0);
    expect(extremeHigh.value).toBeLessThanOrEqual(1);
  });
});

describe('FusionEngine', () => {
  it('aggregates two members with weighted confidence', () => {
    const fused = FusionEngine.fuse({
      candidates: [
        { memberId: M1, span: SPAN, dimension: 'FACTUAL_RETRIEVAL', rawConfidence: 0.8, evidence: [{ span: SPAN, verbatim: 'hi' }] },
        { memberId: M2, span: SPAN, dimension: 'FACTUAL_RETRIEVAL', rawConfidence: 0.6, evidence: [{ span: SPAN, verbatim: 'hi' }] },
      ],
      memberWeights: [
        { memberId: M1, fusionWeight: 0.7 },
        { memberId: M2, fusionWeight: 0.3 },
      ],
      activeMembers: [M1, M2],
    });
    expect(fused).toHaveLength(1);
    expect(fused[0].rawConfidence).toBeCloseTo(0.7 * 0.8 + 0.3 * 0.6, 6);
    expect(fused[0].agreement.score).toBe(1);
  });

  it('drops single-member candidates below tiebreak threshold', () => {
    const fused = FusionEngine.fuse({
      candidates: [
        { memberId: M1, span: SPAN, dimension: 'FACTUAL_RETRIEVAL', rawConfidence: 0.9, evidence: [{ span: SPAN, verbatim: 'x' }] },
      ],
      memberWeights: [
        { memberId: M1, fusionWeight: 0.5 },
        { memberId: M2, fusionWeight: 0.5 },
      ],
      activeMembers: [M1, M2], // 2 active, agreement = 1/2 = 0.5 → threshold 0.5 → kept
    });
    expect(fused).toHaveLength(1);
  });

  it('returns an empty array when no members are active', () => {
    const fused = FusionEngine.fuse({
      candidates: [],
      memberWeights: [{ memberId: M1, fusionWeight: 1 }],
      activeMembers: [],
    });
    expect(fused).toHaveLength(0);
  });

  it('produces deterministic ordering', () => {
    const span2 = Span.of(TURN, 5, 10);
    const a = FusionEngine.fuse({
      candidates: [
        { memberId: M1, span: span2, dimension: 'LOGICAL_INFERENCE', rawConfidence: 0.7, evidence: [] },
        { memberId: M1, span: SPAN,  dimension: 'FACTUAL_RETRIEVAL', rawConfidence: 0.7, evidence: [] },
      ],
      memberWeights: [{ memberId: M1, fusionWeight: 1 }],
      activeMembers: [M1],
    });
    const b = FusionEngine.fuse({
      candidates: [
        { memberId: M1, span: SPAN,  dimension: 'FACTUAL_RETRIEVAL', rawConfidence: 0.7, evidence: [] },
        { memberId: M1, span: span2, dimension: 'LOGICAL_INFERENCE', rawConfidence: 0.7, evidence: [] },
      ],
      memberWeights: [{ memberId: M1, fusionWeight: 1 }],
      activeMembers: [M1],
    });
    expect(a.map((c) => `${c.span.key()}::${c.dimension}`)).toEqual(
      b.map((c) => `${c.span.key()}::${c.dimension}`),
    );
  });
});

describe('SymbolicReasoner', () => {
  const candidate = {
    span: SPAN,
    dimension: 'FACTUAL_RETRIEVAL' as const,
    rawConfidence: 0.8,
    evidence: [{ span: SPAN, verbatim: 'hi' }],
    agreement: EnsembleAgreement.of({ memberCount: 2, agreeingMembers: 2 }),
    contributingMembers: [M1, M2],
  };

  it('drops candidates failing a hard rule', () => {
    const reasoned = SymbolicReasoner.apply({
      candidates: [candidate],
      rules: [
        {
          name: 'must-have-citation',
          kind: 'hard',
          weight: 1,
          fires: (c) => (c.evidence[0]?.externalCitations?.length ?? 0) > 0,
        },
      ],
    });
    expect(reasoned).toHaveLength(0);
  });

  it('attenuates confidence with soft rules', () => {
    const reasoned = SymbolicReasoner.apply({
      candidates: [candidate],
      rules: [
        { name: 'short-span-penalty', kind: 'soft', weight: 0.5, fires: () => true },
      ],
    });
    expect(reasoned).toHaveLength(1);
    expect(reasoned[0].attenuatedRawConfidence).toBeCloseTo(0.4, 6);
    expect(reasoned[0].trace[0]?.fired).toBe(true);
  });

  it('soft rules that do not fire are no-ops', () => {
    const reasoned = SymbolicReasoner.apply({
      candidates: [candidate],
      rules: [
        { name: 'never', kind: 'soft', weight: 0.1, fires: () => false },
      ],
    });
    expect(reasoned[0].attenuatedRawConfidence).toBeCloseTo(0.8, 6);
  });

  it('hard rule that does fire keeps the candidate', () => {
    const reasoned = SymbolicReasoner.apply({
      candidates: [candidate],
      rules: [
        { name: 'has-evidence', kind: 'hard', weight: 1, fires: (c) => c.evidence.length > 0 },
      ],
    });
    expect(reasoned).toHaveLength(1);
  });

  it('treats a throwing predicate as non-firing (no crash)', () => {
    const reasoned = SymbolicReasoner.apply({
      candidates: [candidate],
      rules: [
        { name: 'bad', kind: 'soft', weight: 0.5, fires: () => { throw new Error('oops'); } },
      ],
    });
    expect(reasoned).toHaveLength(1);
    expect(reasoned[0].attenuatedRawConfidence).toBeCloseTo(0.8, 6);
  });
});

describe('UncertaintyQuantifier', () => {
  it('produces a tight interval when member raw values agree', () => {
    const interval = UncertaintyQuantifier.quantify({
      calibrated: Confidence.of(0.9),
      perMemberRaw: [0.9, 0.9, 0.9],
    });
    expect(interval.high.value - interval.low.value).toBeLessThan(0.001);
  });

  it('produces a wide interval when members disagree', () => {
    const interval = UncertaintyQuantifier.quantify({
      calibrated: Confidence.of(0.5),
      perMemberRaw: [0.1, 0.9, 0.5],
    });
    expect(interval.high.value - interval.low.value).toBeGreaterThan(0.1);
  });

  it('produces a degenerate (single-point) interval on empty perMember input', () => {
    const interval = UncertaintyQuantifier.quantify({
      calibrated: Confidence.of(0.7),
      perMemberRaw: [],
    });
    expect(interval.low.value).toBe(0.7);
    expect(interval.high.value).toBe(0.7);
  });
});
