import { ExecuteAnalysisSaga } from '../../../../src/server/contexts/cognitive-analysis/application/use-cases/execute-analysis-saga';
import {
  CapturingDomainEventPublisher,
  CountingIdGenerator,
  FakeBundleProvider,
  FakeLanguageModelClient,
  FixedClock,
  InMemoryAnalysisRepository,
} from '../../../../src/server/contexts/cognitive-analysis/infrastructure/in-memory';
import type {
  ActiveBundleInputs,
  SegmentInput,
} from '../../../../src/server/contexts/cognitive-analysis/application/ports';
import { MemberId, SegmentId } from '../../../../src/server/contexts/cognitive-analysis/domain/value-objects';

const TENANT = '01HJK3R6X7Y8ZAB2C3D4E5F6T0';
const CONV = '01HJK3R6X7Y8ZAB2C3D4E5F6C0';
const TURN = '01HJK3R6X7Y8ZAB2C3D4E5F6Q0';
const SEG = '01HJK3R6X7Y8ZAB2C3D4E5F6S0';
const NOW = new Date('2026-01-01T00:00:00Z');

const M1 = '01HJK3R6X7Y8ZAB2C3D4E5F6M0';
const M2 = '01HJK3R6X7Y8ZAB2C3D4E5F6M1';

function bundleInputs(extra: Partial<ActiveBundleInputs> = {}): ActiveBundleInputs {
  return {
    bundleVersion: '1.0.0',
    memberWeights: [
      { memberId: MemberId.of(M1), fusionWeight: 0.6 },
      { memberId: MemberId.of(M2), fusionWeight: 0.4 },
    ],
    promptTemplates: {},
    calibration: {
      factualRetrieval:  { a: 1, b: 0 },
      logicalInference:  { a: 1, b: 0 },
      creativeSynthesis: { a: 1, b: 0 },
      metaCognition:     { a: 1, b: 0 },
    },
    rulePredicates: [
      // A 'soft' rule that always fires with weight 1 — effectively no-op,
      // but exercises the symbolic path.
      { name: 'noop', kind: 'soft', weight: 1, fires: () => true },
    ],
    ...extra,
  };
}

function buildStack(opts?: { withBadMember?: boolean; withAllBadMembers?: boolean }) {
  const analyses = new InMemoryAnalysisRepository();
  const bundles = new FakeBundleProvider(bundleInputs());
  const ids = new CountingIdGenerator();
  const clock = new FixedClock(NOW);
  const publisher = new CapturingDomainEventPublisher();

  const llm1 = new FakeLanguageModelClient({
    memberId: M1,
    perDimensionRaw: {
      FACTUAL_RETRIEVAL: 0.9,
      LOGICAL_INFERENCE: 0.7,
    },
  });
  const llm2 = new FakeLanguageModelClient({
    memberId: M2,
    perDimensionRaw: {
      FACTUAL_RETRIEVAL: 0.8,
      LOGICAL_INFERENCE: 0.6,
    },
  });
  if (opts?.withBadMember) llm2.shouldFail = true;
  if (opts?.withAllBadMembers) {
    llm1.shouldFail = true;
    llm2.shouldFail = true;
  }
  const saga = new ExecuteAnalysisSaga({
    analyses,
    bundles,
    llms: [llm1, llm2],
    ids,
    clock,
    publisher,
  });
  return { saga, analyses, publisher };
}

function segments(): ReadonlyArray<SegmentInput> {
  return [
    {
      id: SegmentId.of(SEG),
      text: 'kickoff meeting topic',
      firstTurnId: TURN,
      fromTurnIndex: 0,
      toTurnIndex: 2,
    },
  ];
}

describe('ExecuteAnalysisSaga', () => {
  it('happy path: runs every stage and emits AnalysisCompleted', async () => {
    const s = buildStack();
    const r = await s.saga.execute({
      tenantId: TENANT,
      conversationId: CONV,
      segments: segments(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe('COMPLETED');
    expect(r.value.degraded).toBe(false);
    expect(r.value.elementCount).toBeGreaterThan(0);
    const types = s.publisher.events.map((e) => e.type);
    expect(types).toContain('AnalysisStarted');
    expect(types.filter((t) => t === 'AnalysisStageStarted').length).toBe(7);
    expect(types.filter((t) => t === 'AnalysisStageCompleted').length).toBe(7);
    expect(types.filter((t) => t === 'CognitiveElementDetected').length).toBeGreaterThan(0);
    expect(types).toContain('AnalysisCompleted');
  });

  it('is idempotent on (conversationId, bundleVersion, parameterHash)', async () => {
    const s = buildStack();
    const first = await s.saga.execute({
      tenantId: TENANT,
      conversationId: CONV,
      segments: segments(),
    });
    if (!first.ok) throw new Error('first failed');
    s.publisher.events.length = 0;
    const second = await s.saga.execute({
      tenantId: TENANT,
      conversationId: CONV,
      segments: segments(),
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.analysisId).toBe(first.value.analysisId);
    expect(s.publisher.events).toHaveLength(0);
  });

  it('degrades when one member is unavailable', async () => {
    const s = buildStack({ withBadMember: true });
    const r = await s.saga.execute({
      tenantId: TENANT,
      conversationId: CONV,
      segments: segments(),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe('DEGRADED');
    expect(r.value.degraded).toBe(true);
    const completed = s.publisher.events.find((e) => e.type === 'AnalysisCompleted') as any;
    expect(completed.payload.degradedReason).toMatch(/dropped members/);
  });

  it('fails when all members are unavailable', async () => {
    const s = buildStack({ withAllBadMembers: true });
    const r = await s.saga.execute({
      tenantId: TENANT,
      conversationId: CONV,
      segments: segments(),
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('PreconditionFailed');
    const types = s.publisher.events.map((e) => e.type);
    expect(types).toContain('AnalysisStageFailed');
    expect(types).toContain('AnalysisFailed');
  });

  it('rejects empty segments', async () => {
    const s = buildStack();
    const r = await s.saga.execute({
      tenantId: TENANT,
      conversationId: CONV,
      segments: [],
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });

  it('rejects invalid tenant id', async () => {
    const s = buildStack();
    const r = await s.saga.execute({
      tenantId: 'not-a-ulid',
      conversationId: CONV,
      segments: segments(),
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });

  it('different parameters → different analysisId', async () => {
    const s = buildStack();
    const a = await s.saga.execute({
      tenantId: TENANT,
      conversationId: CONV,
      parameters: { x: 1 },
      segments: segments(),
    });
    const b = await s.saga.execute({
      tenantId: TENANT,
      conversationId: CONV,
      parameters: { x: 2 },
      segments: segments(),
    });
    if (!a.ok || !b.ok) throw new Error();
    expect(a.value.analysisId).not.toBe(b.value.analysisId);
  });

  it('parameter key order does not change the analysis identity', async () => {
    const s = buildStack();
    const a = await s.saga.execute({
      tenantId: TENANT,
      conversationId: CONV,
      parameters: { a: 1, b: 2 },
      segments: segments(),
    });
    const b = await s.saga.execute({
      tenantId: TENANT,
      conversationId: CONV,
      parameters: { b: 2, a: 1 },
      segments: segments(),
    });
    if (!a.ok || !b.ok) throw new Error();
    expect(a.value.analysisId).toBe(b.value.analysisId);
  });
});
