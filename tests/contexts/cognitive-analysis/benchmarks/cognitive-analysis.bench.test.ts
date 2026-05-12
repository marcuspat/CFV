/**
 * Microbenchmarks for Cognitive Analysis hot paths.
 */

import { ConfidenceCalibrator } from '../../../../src/server/contexts/cognitive-analysis/domain/confidence-calibrator';
import { FusionEngine } from '../../../../src/server/contexts/cognitive-analysis/domain/fusion-engine';
import { SymbolicReasoner } from '../../../../src/server/contexts/cognitive-analysis/domain/symbolic-reasoner';
import {
  EnsembleAgreement,
  MemberId,
  Span,
  TurnId,
  type MemberCandidate,
} from '../../../../src/server/contexts/cognitive-analysis/domain/value-objects';

const TURN = TurnId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Q0');
const M1 = MemberId.of('01HJK3R6X7Y8ZAB2C3D4E5F6M0');
const M2 = MemberId.of('01HJK3R6X7Y8ZAB2C3D4E5F6M1');

const IDENTITY_CALIB = {
  factualRetrieval:  { a: 1, b: 0 },
  logicalInference:  { a: 1, b: 0 },
  creativeSynthesis: { a: 1, b: 0 },
  metaCognition:     { a: 1, b: 0 },
};

function benchmark(label: string, iterations: number, fn: () => void): number {
  for (let i = 0; i < Math.min(iterations, 500); i++) fn(); // warm-up
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

describe('cognitive analysis microbenchmarks', () => {
  it('ConfidenceCalibrator.calibrate', () => {
    const perOp = benchmark('ConfidenceCalibrator.calibrate', 200_000, () => {
      ConfidenceCalibrator.calibrate(0.7, 'FACTUAL_RETRIEVAL', IDENTITY_CALIB);
    });
    expect(perOp).toBeLessThan(5_000);
  });

  it('FusionEngine.fuse over 100 candidates / 2 members', () => {
    const candidates: MemberCandidate[] = [];
    for (let i = 0; i < 50; i++) {
      const span = Span.of(TURN, i * 5, i * 5 + 4);
      candidates.push({
        memberId: M1,
        span,
        dimension: 'FACTUAL_RETRIEVAL',
        rawConfidence: 0.9,
        evidence: [{ span, verbatim: 'x' }],
      });
      candidates.push({
        memberId: M2,
        span,
        dimension: 'FACTUAL_RETRIEVAL',
        rawConfidence: 0.7,
        evidence: [{ span, verbatim: 'x' }],
      });
    }
    const perOp = benchmark('FusionEngine.fuse (100 candidates)', 5_000, () => {
      FusionEngine.fuse({
        candidates,
        memberWeights: [
          { memberId: M1, fusionWeight: 0.6 },
          { memberId: M2, fusionWeight: 0.4 },
        ],
        activeMembers: [M1, M2],
      });
    });
    expect(perOp).toBeLessThan(500_000);
  });

  it('SymbolicReasoner.apply over 50 fused candidates / 5 rules', () => {
    const fused = Array.from({ length: 50 }, (_, i) => {
      const span = Span.of(TURN, i * 5, i * 5 + 4);
      return {
        span,
        dimension: 'FACTUAL_RETRIEVAL' as const,
        rawConfidence: 0.8,
        evidence: [{ span, verbatim: 'x' }],
        agreement: EnsembleAgreement.of({ memberCount: 2, agreeingMembers: 2 }),
        contributingMembers: [M1, M2],
      };
    });
    const rules = [
      { name: 'has-evidence', kind: 'hard' as const, weight: 1, fires: (c: any) => c.evidence.length > 0 },
      { name: 'high-conf',    kind: 'soft' as const, weight: 0.95, fires: (c: any) => c.rawConfidence > 0.5 },
      { name: 'has-span',     kind: 'soft' as const, weight: 0.99, fires: (c: any) => c.span !== undefined },
      { name: 'is-dim',       kind: 'soft' as const, weight: 1, fires: () => true },
      { name: 'short',        kind: 'soft' as const, weight: 0.99, fires: () => false },
    ];
    const perOp = benchmark('SymbolicReasoner.apply (50×5)', 5_000, () => {
      SymbolicReasoner.apply({ candidates: fused, rules });
    });
    expect(perOp).toBeLessThan(500_000);
  });
});
