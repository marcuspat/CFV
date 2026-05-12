import { CognitiveGraph } from '../../../../src/server/contexts/cognitive-graph/domain/cognitive-graph';
import {
  CognitiveElementId,
  EdgeWeight,
  GraphEdgeId,
  GraphId,
  PredictedEdgeId,
  ThreadId,
  TurnId,
  type GraphEdge,
  type GraphNode,
  type PredictedEdge,
  type Thread,
} from '../../../../src/server/contexts/cognitive-graph/domain/value-objects';
import {
  DuplicateNode,
  EdgeReferencesUnknownNode,
  CrossGraphEdge,
  PredictedEdgeAlreadyRealised,
  ThreadNotMonotonic,
} from '../../../../src/server/contexts/cognitive-graph/domain/errors';

const GRAPH = GraphId.of('01HJK3R6X7Y8ZAB2C3D4E5F6G0');
const OTHER = GraphId.of('01HJK3R6X7Y8ZAB2C3D4E5F6G1');
const N1 = CognitiveElementId.of('01HJK3R6X7Y8ZAB2C3D4E5F6E0');
const N2 = CognitiveElementId.of('01HJK3R6X7Y8ZAB2C3D4E5F6E1');
const N3 = CognitiveElementId.of('01HJK3R6X7Y8ZAB2C3D4E5F6E2');
const TURN = TurnId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Q0');

function node(id: typeof N1, turnIndex: number, dim: 'FACTUAL_RETRIEVAL' | 'LOGICAL_INFERENCE' | 'CREATIVE_SYNTHESIS' | 'META_COGNITION' = 'FACTUAL_RETRIEVAL'): GraphNode {
  return { id, graphId: GRAPH, dimension: dim, turnId: TURN, turnIndex, confidence: 0.9 };
}

function edge(id: string, from: typeof N1, to: typeof N1, source: 'OBSERVED' | 'PREDICTED' = 'OBSERVED'): GraphEdge {
  return {
    id: GraphEdgeId.of(id),
    graphId: GRAPH,
    from,
    to,
    edgeType: 'EXTENDS',
    weight: EdgeWeight.of({ value: 0.8, source }),
    realisedFrom: null,
  };
}

describe('CognitiveGraph aggregate', () => {
  describe('addNode', () => {
    it('emits GraphNodeAdded and bumps version', () => {
      const g = CognitiveGraph.empty({ id: GRAPH });
      g.addNode(node(N1, 0));
      expect(g.version).toBe(1);
      const events = g.pullEvents();
      expect(events.map((e) => e.type)).toEqual(['GraphNodeAdded']);
    });

    it('rejects cross-graph nodes', () => {
      const g = CognitiveGraph.empty({ id: GRAPH });
      const wrong: GraphNode = { ...node(N1, 0), graphId: OTHER };
      expect(() => g.addNode(wrong)).toThrow(CrossGraphEdge);
    });

    it('rejects duplicate node ids', () => {
      const g = CognitiveGraph.empty({ id: GRAPH });
      g.addNode(node(N1, 0));
      expect(() => g.addNode(node(N1, 0))).toThrow(DuplicateNode);
    });
  });

  describe('addEdge', () => {
    it('emits GraphEdgeFormed and bumps version', () => {
      const g = CognitiveGraph.empty({ id: GRAPH });
      g.addNode(node(N1, 0));
      g.addNode(node(N2, 1));
      g.pullEvents();
      g.addEdge(edge('01HJK3R6X7Y8ZAB2C3D4E5F6X0', N1, N2));
      expect(g.version).toBe(3);
      const events = g.pullEvents();
      expect(events.map((e) => e.type)).toEqual(['GraphEdgeFormed']);
    });

    it('rejects when an endpoint is missing', () => {
      const g = CognitiveGraph.empty({ id: GRAPH });
      g.addNode(node(N1, 0));
      expect(() => g.addEdge(edge('01HJK3R6X7Y8ZAB2C3D4E5F6X0', N1, N2))).toThrow(EdgeReferencesUnknownNode);
    });

    it('is idempotent on edge id', () => {
      const g = CognitiveGraph.empty({ id: GRAPH });
      g.addNode(node(N1, 0));
      g.addNode(node(N2, 1));
      g.pullEvents();
      const e = edge('01HJK3R6X7Y8ZAB2C3D4E5F6X0', N1, N2);
      g.addEdge(e);
      const versionAfter = g.version;
      g.addEdge(e);
      expect(g.version).toBe(versionAfter);
    });
  });

  describe('predicted edges', () => {
    function predicted(id: string, from: typeof N1, to: typeof N1): PredictedEdge {
      return {
        id: PredictedEdgeId.of(id),
        graphId: GRAPH,
        from,
        to,
        edgeType: 'EXTENDS',
        confidenceInterval: { low: 0.3, median: 0.5, high: 0.7 },
        proposedAt: new Date('2026-01-01'),
        realisedAsEdgeId: null,
      };
    }

    it('proposePredictedEdge emits PredictedEdgeProposed', () => {
      const g = CognitiveGraph.empty({ id: GRAPH });
      g.addNode(node(N1, 0));
      g.addNode(node(N2, 1));
      g.pullEvents();
      g.proposePredictedEdge(predicted('01HJK3R6X7Y8ZAB2C3D4E5F6P0', N1, N2));
      const events = g.pullEvents();
      expect(events.map((e) => e.type)).toEqual(['PredictedEdgeProposed']);
    });

    it('realisePredictedEdge emits GraphEdgeFormed + PredictedEdgeRealised atomically', () => {
      const g = CognitiveGraph.empty({ id: GRAPH });
      g.addNode(node(N1, 0));
      g.addNode(node(N2, 1));
      const p = predicted('01HJK3R6X7Y8ZAB2C3D4E5F6P0', N1, N2);
      g.proposePredictedEdge(p);
      g.pullEvents();

      const newEdge: GraphEdge = {
        id: GraphEdgeId.of('01HJK3R6X7Y8ZAB2C3D4E5F6X0'),
        graphId: GRAPH,
        from: N1,
        to: N2,
        edgeType: 'EXTENDS',
        weight: EdgeWeight.of({ value: 0.9, source: 'OBSERVED' }),
        realisedFrom: null,
      };
      g.realisePredictedEdge({ predictedEdgeId: p.id, newEdge });
      const types = g.pullEvents().map((e) => e.type);
      expect(types).toContain('GraphEdgeFormed');
      expect(types).toContain('PredictedEdgeRealised');
      // The edge is recorded with realisedFrom pointing to the predicted id.
      const realisedEdge = Array.from(g.edges.values())[0];
      expect(realisedEdge.realisedFrom).toBe(p.id);
    });

    it('refuses to realise the same prediction twice', () => {
      const g = CognitiveGraph.empty({ id: GRAPH });
      g.addNode(node(N1, 0));
      g.addNode(node(N2, 1));
      const p = predicted('01HJK3R6X7Y8ZAB2C3D4E5F6P0', N1, N2);
      g.proposePredictedEdge(p);
      const newEdge: GraphEdge = {
        id: GraphEdgeId.of('01HJK3R6X7Y8ZAB2C3D4E5F6X0'),
        graphId: GRAPH,
        from: N1,
        to: N2,
        edgeType: 'EXTENDS',
        weight: EdgeWeight.of({ value: 0.9, source: 'OBSERVED' }),
        realisedFrom: null,
      };
      g.realisePredictedEdge({ predictedEdgeId: p.id, newEdge });
      expect(() => g.realisePredictedEdge({
        predictedEdgeId: p.id,
        newEdge: { ...newEdge, id: GraphEdgeId.of('01HJK3R6X7Y8ZAB2C3D4E5F6X1') },
      })).toThrow(PredictedEdgeAlreadyRealised);
    });
  });

  describe('setThreads', () => {
    it('emits ThreadEvolved for new/changed threads', () => {
      const g = CognitiveGraph.empty({ id: GRAPH });
      g.addNode(node(N1, 0));
      g.addNode(node(N2, 1));
      g.addNode(node(N3, 2));
      g.pullEvents();
      const thread: Thread = {
        id: ThreadId.of('01HJK3R6X7Y8ZAB2C3D4E5F6H0'),
        graphId: GRAPH,
        nodes: [N1, N2, N3],
        dominantDimension: 'FACTUAL_RETRIEVAL',
        meanConfidence: 0.9,
      };
      g.setThreads([thread]);
      const types = g.pullEvents().map((e) => e.type);
      expect(types).toEqual(['ThreadEvolved']);
    });

    it('rejects non-monotonic threads', () => {
      const g = CognitiveGraph.empty({ id: GRAPH });
      g.addNode(node(N1, 5));
      g.addNode(node(N2, 1));
      const thread: Thread = {
        id: ThreadId.of('01HJK3R6X7Y8ZAB2C3D4E5F6H0'),
        graphId: GRAPH,
        nodes: [N1, N2],
        dominantDimension: 'FACTUAL_RETRIEVAL',
        meanConfidence: 0.9,
      };
      expect(() => g.setThreads([thread])).toThrow(ThreadNotMonotonic);
    });

    it('is a no-op when the thread set is unchanged', () => {
      const g = CognitiveGraph.empty({ id: GRAPH });
      g.addNode(node(N1, 0));
      g.addNode(node(N2, 1));
      const thread: Thread = {
        id: ThreadId.of('01HJK3R6X7Y8ZAB2C3D4E5F6H0'),
        graphId: GRAPH,
        nodes: [N1, N2],
        dominantDimension: 'FACTUAL_RETRIEVAL',
        meanConfidence: 0.9,
      };
      g.setThreads([thread]);
      g.pullEvents();
      const versionAfter = g.version;
      g.setThreads([thread]);
      expect(g.version).toBe(versionAfter);
      expect(g.pullEvents()).toHaveLength(0);
    });
  });
});
