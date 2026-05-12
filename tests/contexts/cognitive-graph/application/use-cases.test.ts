import { IngestElementsBatch } from '../../../../src/server/contexts/cognitive-graph/application/use-cases/ingest-elements-batch';
import { LoadGraphSnapshot } from '../../../../src/server/contexts/cognitive-graph/application/use-cases/load-graph-snapshot';
import { RealisePredictedEdge } from '../../../../src/server/contexts/cognitive-graph/application/use-cases/realise-predicted-edge';
import { RunThreadDetection } from '../../../../src/server/contexts/cognitive-graph/application/use-cases/run-thread-detection';
import {
  CapturingDomainEventPublisher,
  CountingIdGenerator,
  FixedClock,
  HeuristicDgnnModelClient,
  InMemoryCognitiveGraphRepository,
  InMemoryGraphCache,
} from '../../../../src/server/contexts/cognitive-graph/infrastructure/in-memory';
import { GraphId } from '../../../../src/server/contexts/cognitive-graph/domain/value-objects';

const CONV = '01HJK3R6X7Y8ZAB2C3D4E5F6G0';
const TURN = '01HJK3R6X7Y8ZAB2C3D4E5F6Q0';
const E1 = '01HJK3R6X7Y8ZAB2C3D4E5F6E0';
const E2 = '01HJK3R6X7Y8ZAB2C3D4E5F6E1';
const E3 = '01HJK3R6X7Y8ZAB2C3D4E5F6E2';
const NOW = new Date('2026-01-01T00:00:00Z');

function buildStack(opts?: { dgnnFails?: boolean }) {
  const graphs = new InMemoryCognitiveGraphRepository();
  const dgnn = new HeuristicDgnnModelClient();
  if (opts?.dgnnFails) dgnn.shouldFail = true;
  const cache = new InMemoryGraphCache();
  const ids = new CountingIdGenerator();
  const clock = new FixedClock(NOW);
  const publisher = new CapturingDomainEventPublisher();
  const ingest = new IngestElementsBatch({ graphs, dgnn, cache, ids, clock, publisher });
  const detect = new RunThreadDetection({ graphs, cache, ids, publisher });
  const realise = new RealisePredictedEdge({ graphs, cache, ids, publisher });
  const load = new LoadGraphSnapshot({ graphs, cache });
  return { ingest, detect, realise, load, graphs, dgnn, cache, publisher };
}

function el(id: string, turnIndex: number, dim = 'FACTUAL_RETRIEVAL') {
  return {
    conversationId: CONV,
    cognitiveElementId: id,
    dimension: dim,
    turnId: TURN,
    turnIndex,
    confidence: 0.9,
  };
}

describe('IngestElementsBatch', () => {
  it('persists nodes, forms edges via heuristic DGNN, emits events', async () => {
    const s = buildStack();
    const r = await s.ingest.execute({
      conversationId: CONV,
      elements: [el(E1, 0), el(E2, 1), el(E3, 2)],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.nodesAdded).toBe(3);
    expect(r.value.edgesObserved).toBeGreaterThan(0);
    const types = s.publisher.events.map((e) => e.type);
    expect(types).toContain('GraphNodeAdded');
    expect(types).toContain('GraphEdgeFormed');
  });

  it('is idempotent on repeated element ids', async () => {
    const s = buildStack();
    const first = await s.ingest.execute({
      conversationId: CONV,
      elements: [el(E1, 0), el(E2, 1)],
    });
    if (!first.ok) throw new Error('first failed');
    s.publisher.events.length = 0;

    // Same elements again — should be a no-op.
    const second = await s.ingest.execute({
      conversationId: CONV,
      elements: [el(E1, 0), el(E2, 1)],
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.nodesAdded).toBe(0);
    expect(second.value.edgesObserved).toBe(0);
  });

  it('persists nodes even when the DGNN is unavailable (degraded)', async () => {
    const s = buildStack({ dgnnFails: true });
    const r = await s.ingest.execute({
      conversationId: CONV,
      elements: [el(E1, 0), el(E2, 1)],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.nodesAdded).toBe(2);
    expect(r.value.edgesObserved).toBe(0);
    expect(r.value.edgesPredicted).toBe(0);
  });

  it('rejects unknown dimensions', async () => {
    const s = buildStack();
    const r = await s.ingest.execute({
      conversationId: CONV,
      elements: [{ ...el(E1, 0), dimension: 'UNKNOWN' }],
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });

  it('rejects empty element batches', async () => {
    const s = buildStack();
    const r = await s.ingest.execute({ conversationId: CONV, elements: [] });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });
});

describe('RunThreadDetection', () => {
  it('emits ThreadEvolved on first run with connected nodes', async () => {
    const s = buildStack();
    await s.ingest.execute({
      conversationId: CONV,
      elements: [el(E1, 0), el(E2, 1), el(E3, 2)],
    });
    s.publisher.events.length = 0;
    const r = await s.detect.execute({ conversationId: CONV });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.threadCount).toBeGreaterThan(0);
    const types = s.publisher.events.map((e) => e.type);
    expect(types).toContain('ThreadEvolved');
  });

  it('is a no-op when threads have not changed', async () => {
    const s = buildStack();
    await s.ingest.execute({
      conversationId: CONV,
      elements: [el(E1, 0), el(E2, 1), el(E3, 2)],
    });
    await s.detect.execute({ conversationId: CONV });
    s.publisher.events.length = 0;
    const second = await s.detect.execute({ conversationId: CONV });
    expect(second.ok).toBe(true);
    // No new ThreadEvolved events because thread membership is unchanged.
    expect(s.publisher.events.filter((e) => e.type === 'ThreadEvolved')).toHaveLength(0);
  });
});

describe('LoadGraphSnapshot + GraphCache invalidation', () => {
  it('returns cached=false on the first load and cached=true thereafter', async () => {
    const s = buildStack();
    await s.ingest.execute({
      conversationId: CONV,
      elements: [el(E1, 0), el(E2, 1)],
    });
    const first = await s.load.execute({ conversationId: CONV });
    expect(first.ok && first.value.cached).toBe(false);
    const second = await s.load.execute({ conversationId: CONV });
    expect(second.ok && second.value.cached).toBe(true);
  });

  it('invalidates on subsequent ingest', async () => {
    const s = buildStack();
    await s.ingest.execute({ conversationId: CONV, elements: [el(E1, 0), el(E2, 1)] });
    await s.load.execute({ conversationId: CONV });
    await s.ingest.execute({ conversationId: CONV, elements: [el(E3, 2)] });
    const after = await s.load.execute({ conversationId: CONV });
    expect(after.ok && after.value.cached).toBe(false);
  });
});

describe('RealisePredictedEdge', () => {
  it('upgrades a PredictedEdge to OBSERVED and emits both events', async () => {
    // Build a configuration where the heuristic DGNN produces PREDICTED
    // edges: cross-dimension nodes (CREATIVE_SYNTHESIS vs FACTUAL_RETRIEVAL).
    const s = buildStack();
    await s.ingest.execute({
      conversationId: CONV,
      elements: [
        el(E1, 0, 'FACTUAL_RETRIEVAL'),
        el(E2, 1, 'CREATIVE_SYNTHESIS'),
      ],
    });
    const snapshot = await s.load.execute({ conversationId: CONV });
    if (!snapshot.ok) throw new Error('load failed');
    const predicted = Array.from(snapshot.value.graph.predictedEdges.values())[0];
    if (!predicted) throw new Error('expected a predicted edge from heuristic DGNN');
    s.publisher.events.length = 0;
    const r = await s.realise.execute({
      conversationId: CONV,
      predictedEdgeId: predicted.id,
      observedWeight: 0.9,
    });
    expect(r.ok).toBe(true);
    const types = s.publisher.events.map((e) => e.type);
    expect(types).toContain('GraphEdgeFormed');
    expect(types).toContain('PredictedEdgeRealised');
  });

  it('rejects realising a non-existent predicted edge', async () => {
    const s = buildStack();
    await s.ingest.execute({ conversationId: CONV, elements: [el(E1, 0)] });
    const r = await s.realise.execute({
      conversationId: CONV,
      predictedEdgeId: '01HJK3R6X7Y8ZAB2C3D4E5F6Z0',
      observedWeight: 0.9,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('NotFound');
  });

  it('rejects an out-of-range observedWeight', async () => {
    const s = buildStack();
    await s.ingest.execute({ conversationId: CONV, elements: [el(E1, 0)] });
    const r = await s.realise.execute({
      conversationId: CONV,
      predictedEdgeId: '01HJK3R6X7Y8ZAB2C3D4E5F6Z0',
      observedWeight: 1.5,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });
});
