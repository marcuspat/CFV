import { Analysis } from '../../../../src/server/contexts/cognitive-analysis/domain/analysis';
import {
  AnalysisId,
  CognitiveElementId,
  Confidence,
  ConversationId,
  Span,
  TenantId,
  TurnId,
  type CognitiveElement,
} from '../../../../src/server/contexts/cognitive-analysis/domain/value-objects';
import {
  AnalysisAlreadyTerminal,
  InvalidStageTransition,
  StageAlreadyCompleted,
} from '../../../../src/server/contexts/cognitive-analysis/domain/errors';

const TENANT = TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T0');
const CONV = ConversationId.of('01HJK3R6X7Y8ZAB2C3D4E5F6C0');
const ID = AnalysisId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Y0');
const NOW = new Date('2026-01-01T00:00:00Z');

function makeAnalysis(): Analysis {
  return Analysis.start({
    id: ID,
    conversationId: CONV,
    tenantId: TENANT,
    bundleVersion: '1.0.0',
    parameterHash: 'h',
    parameters: {},
    now: NOW,
  });
}

function makeElement(): CognitiveElement {
  const span = Span.of(TurnId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Q0'), 0, 5);
  return {
    id: CognitiveElementId.of('01HJK3R6X7Y8ZAB2C3D4E5F6E0'),
    analysisId: ID,
    span,
    dimension: 'FACTUAL_RETRIEVAL',
    confidence: Confidence.of(0.9),
    evidence: [{ span, verbatim: 'hello' }],
    bundleVersion: '1.0.0',
  };
}

describe('Analysis aggregate — lifecycle', () => {
  it('emits AnalysisStarted on construction', () => {
    const a = makeAnalysis();
    expect(a.status).toBe('STARTED');
    expect(a.pullEvents().map((e) => e.type)).toEqual(['AnalysisStarted']);
  });

  it('enforces stage ordering', () => {
    const a = makeAnalysis();
    a.pullEvents();
    expect(() => a.startStage('DECOMPOSE', NOW)).toThrow(InvalidStageTransition);
  });

  it('runs the saga happy path through to COMPLETED', () => {
    const a = makeAnalysis();
    a.pullEvents();
    const stages = ['SEGMENT', 'DECOMPOSE', 'FUSE', 'SYMBOLIC', 'GRAPH_UPDATE', 'THREAD_PREDICT', 'NOTIFY'] as const;
    for (const s of stages) {
      a.startStage(s, NOW);
      a.completeStage(s, new Date(NOW.getTime() + 1));
    }
    a.complete(new Date(NOW.getTime() + 10));
    expect(a.status).toBe('COMPLETED');
    const types = a.pullEvents().map((e) => e.type);
    expect(types.filter((t) => t === 'AnalysisStageStarted')).toHaveLength(stages.length);
    expect(types.filter((t) => t === 'AnalysisStageCompleted')).toHaveLength(stages.length);
    expect(types).toContain('AnalysisCompleted');
  });

  it('records degradation and finishes DEGRADED', () => {
    const a = makeAnalysis();
    a.pullEvents();
    a.startStage('SEGMENT', NOW);
    a.completeStage('SEGMENT', NOW);
    a.startStage('DECOMPOSE', NOW);
    a.recordDegradation({ reason: 'member-x dropped', dropped: ['member-x'] });
    a.completeStage('DECOMPOSE', NOW);
    for (const s of ['FUSE', 'SYMBOLIC', 'GRAPH_UPDATE', 'THREAD_PREDICT', 'NOTIFY'] as const) {
      a.startStage(s, NOW);
      a.completeStage(s, NOW);
    }
    a.complete(NOW);
    expect(a.status).toBe('DEGRADED');
    const ev = a.pullEvents();
    const completed = ev.find((e) => e.type === 'AnalysisCompleted');
    expect(completed && (completed as any).payload.degradedReason).toMatch(/member-x dropped/);
  });

  it('fails terminally on a stage failure', () => {
    const a = makeAnalysis();
    a.pullEvents();
    a.startStage('SEGMENT', NOW);
    a.failStage({ name: 'SEGMENT', errorClass: 'BoomError', retryable: false, now: NOW });
    a.fail({ errorClass: 'BoomError', recoverable: false });
    expect(a.status).toBe('FAILED');
    expect(() => a.startStage('DECOMPOSE', NOW)).toThrow(AnalysisAlreadyTerminal);
  });

  it('refuses double-completing a stage', () => {
    const a = makeAnalysis();
    a.startStage('SEGMENT', NOW);
    a.completeStage('SEGMENT', NOW);
    expect(() => a.completeStage('SEGMENT', NOW)).toThrow(StageAlreadyCompleted);
  });

  it('emitElement increments elementCount and emits CognitiveElementDetected', () => {
    const a = makeAnalysis();
    a.pullEvents();
    a.startStage('SEGMENT', NOW);
    a.completeStage('SEGMENT', NOW);
    a.startStage('DECOMPOSE', NOW);
    a.completeStage('DECOMPOSE', NOW);
    a.startStage('FUSE', NOW);
    a.completeStage('FUSE', NOW);
    a.startStage('SYMBOLIC', NOW);
    a.completeStage('SYMBOLIC', NOW);
    a.startStage('GRAPH_UPDATE', NOW);
    a.emitElement(makeElement());
    a.completeStage('GRAPH_UPDATE', NOW);
    expect(a.elementCount).toBe(1);
    const types = a.pullEvents().map((e) => e.type);
    expect(types).toContain('CognitiveElementDetected');
  });

  it('rejects out-of-order completion', () => {
    const a = makeAnalysis();
    a.startStage('SEGMENT', NOW);
    a.completeStage('SEGMENT', NOW);
    // Try to complete DECOMPOSE without starting it.
    expect(() => a.completeStage('DECOMPOSE', NOW)).toThrow(InvalidStageTransition);
  });
});
