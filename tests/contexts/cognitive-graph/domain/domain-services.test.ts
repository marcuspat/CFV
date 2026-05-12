import { EdgeFormer, DEFAULT_EDGE_FORMER_CONFIG } from '../../../../src/server/contexts/cognitive-graph/domain/edge-former';
import { ThreadDetector } from '../../../../src/server/contexts/cognitive-graph/domain/thread-detector';
import {
  CognitiveElementId,
  EdgeWeight,
  GraphEdgeId,
  GraphId,
  ThreadId,
  TurnId,
  type GraphEdge,
  type GraphNode,
} from '../../../../src/server/contexts/cognitive-graph/domain/value-objects';

const GRAPH = GraphId.of('01HJK3R6X7Y8ZAB2C3D4E5F6G0');
const N1 = CognitiveElementId.of('01HJK3R6X7Y8ZAB2C3D4E5F6E0');
const N2 = CognitiveElementId.of('01HJK3R6X7Y8ZAB2C3D4E5F6E1');
const N3 = CognitiveElementId.of('01HJK3R6X7Y8ZAB2C3D4E5F6E2');
const TURN = TurnId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Q0');

function node(id: typeof N1, turnIndex: number, dim: 'FACTUAL_RETRIEVAL' | 'LOGICAL_INFERENCE' | 'CREATIVE_SYNTHESIS' | 'META_COGNITION' = 'FACTUAL_RETRIEVAL'): GraphNode {
  return { id, graphId: GRAPH, dimension: dim, turnId: TURN, turnIndex, confidence: 0.9 };
}

function obsEdge(id: string, from: typeof N1, to: typeof N1): GraphEdge {
  return {
    id: GraphEdgeId.of(id),
    graphId: GRAPH,
    from,
    to,
    edgeType: 'EXTENDS',
    weight: EdgeWeight.of({ value: 0.9, source: 'OBSERVED' }),
    realisedFrom: null,
  };
}

describe('EdgeFormer', () => {
  const nodes = new Map([
    [N1, node(N1, 0)],
    [N2, node(N2, 1)],
  ]);

  it('classifies above observedThreshold as OBSERVED', () => {
    const r = EdgeFormer.decide({
      scores: [{ from: N1, to: N2, score: 0.9, edgeType: 'EXTENDS' }],
      existingNodes: nodes,
    });
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('OBSERVED');
  });

  it('classifies mid-range as PREDICTED', () => {
    const r = EdgeFormer.decide({
      scores: [{ from: N1, to: N2, score: 0.5, edgeType: 'EXTENDS' }],
      existingNodes: nodes,
    });
    expect(r[0].kind).toBe('PREDICTED');
  });

  it('classifies below predictedFloor as DROPPED', () => {
    const r = EdgeFormer.decide({
      scores: [{ from: N1, to: N2, score: 0.1, edgeType: 'EXTENDS' }],
      existingNodes: nodes,
    });
    expect(r[0].kind).toBe('DROPPED');
  });

  it('drops self-edges and edges referencing missing nodes', () => {
    const r = EdgeFormer.decide({
      scores: [
        { from: N1, to: N1, score: 1.0, edgeType: 'EXTENDS' },
        { from: N1, to: N3, score: 0.9, edgeType: 'EXTENDS' },
      ],
      existingNodes: nodes,
    });
    expect(r).toHaveLength(0);
  });

  it('rejects malformed configs', () => {
    expect(() => EdgeFormer.decide({
      scores: [],
      existingNodes: nodes,
      config: { observedThreshold: 0.5, predictedFloor: 0.9 },
    })).toThrow();
    expect(() => EdgeFormer.decide({
      scores: [],
      existingNodes: nodes,
      config: { ...DEFAULT_EDGE_FORMER_CONFIG, observedThreshold: 2 },
    })).toThrow();
  });
});

describe('ThreadDetector', () => {
  it('clusters connected nodes into one thread', () => {
    const nodes = new Map([
      [N1, node(N1, 0)],
      [N2, node(N2, 1)],
      [N3, node(N3, 2)],
    ]);
    let counter = 0;
    const mint = () => ThreadId.of(`01HJK3R6X7Y8ZAB2C3D4E5F6${counter++}0`.slice(0, 26).padEnd(26, '0'));
    const threads = ThreadDetector.detect({
      graphId: GRAPH,
      nodes,
      edges: [
        obsEdge('01HJK3R6X7Y8ZAB2C3D4E5F6X0', N1, N2),
        obsEdge('01HJK3R6X7Y8ZAB2C3D4E5F6X1', N2, N3),
      ],
      mintThreadId: mint,
    });
    expect(threads).toHaveLength(1);
    expect(threads[0].nodes).toEqual([N1, N2, N3]);
    expect(threads[0].dominantDimension).toBe('FACTUAL_RETRIEVAL');
  });

  it('ignores predicted-only edges for clustering', () => {
    const nodes = new Map([
      [N1, node(N1, 0)],
      [N2, node(N2, 1)],
    ]);
    const predictedEdge: GraphEdge = {
      ...obsEdge('01HJK3R6X7Y8ZAB2C3D4E5F6X0', N1, N2),
      weight: EdgeWeight.of({ value: 0.5, source: 'PREDICTED' }),
    };
    const threads = ThreadDetector.detect({
      graphId: GRAPH,
      nodes,
      edges: [predictedEdge],
      mintThreadId: () => ThreadId.of('01HJK3R6X7Y8ZAB2C3D4E5F6H0'),
    });
    // Each node remains its own (size-1) component → dropped by minThreadSize.
    expect(threads).toHaveLength(0);
  });

  it('drops components below minThreadSize', () => {
    const nodes = new Map([[N1, node(N1, 0)]]);
    const threads = ThreadDetector.detect({
      graphId: GRAPH,
      nodes,
      edges: [],
      mintThreadId: () => ThreadId.of('01HJK3R6X7Y8ZAB2C3D4E5F6H0'),
    });
    expect(threads).toHaveLength(0);
  });

  it('picks the dominant dimension by majority', () => {
    const nodes = new Map([
      [N1, node(N1, 0, 'LOGICAL_INFERENCE')],
      [N2, node(N2, 1, 'LOGICAL_INFERENCE')],
      [N3, node(N3, 2, 'FACTUAL_RETRIEVAL')],
    ]);
    const threads = ThreadDetector.detect({
      graphId: GRAPH,
      nodes,
      edges: [
        obsEdge('01HJK3R6X7Y8ZAB2C3D4E5F6X0', N1, N2),
        obsEdge('01HJK3R6X7Y8ZAB2C3D4E5F6X1', N2, N3),
      ],
      mintThreadId: () => ThreadId.of('01HJK3R6X7Y8ZAB2C3D4E5F6H0'),
    });
    expect(threads).toHaveLength(1);
    expect(threads[0].dominantDimension).toBe('LOGICAL_INFERENCE');
  });
});
