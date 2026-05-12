/**
 * Microbenchmarks for Cognitive Graph hot paths.
 */

import { EdgeFormer } from '../../../../src/server/contexts/cognitive-graph/domain/edge-former';
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
import type { PairwiseScore } from '../../../../src/server/contexts/cognitive-graph/domain/edge-former';

const GRAPH = GraphId.of('01HJK3R6X7Y8ZAB2C3D4E5F6G0');
const TURN = TurnId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Q0');

function pad(i: number, label: string): string {
  const stem = `${label}${i.toString(32).toUpperCase().replace(/I|L|O|U/g, '0')}`;
  return stem.padStart(26, '0');
}

function makeNodes(n: number): Map<typeof CognitiveElementId extends { of: (s: string) => infer T } ? T : never, GraphNode> {
  const map = new Map<any, GraphNode>();
  for (let i = 0; i < n; i++) {
    const id = CognitiveElementId.of(pad(i, 'E'));
    map.set(id, {
      id,
      graphId: GRAPH,
      dimension: i % 2 === 0 ? 'FACTUAL_RETRIEVAL' : 'LOGICAL_INFERENCE',
      turnId: TURN,
      turnIndex: i,
      confidence: 0.9,
    });
  }
  return map;
}

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

describe('cognitive graph microbenchmarks', () => {
  it('EdgeFormer.decide on 1000 pairs', () => {
    const nodes = makeNodes(50);
    const ids = Array.from(nodes.keys());
    const scores: PairwiseScore[] = [];
    for (let i = 0; i < 1000; i++) {
      const a = ids[i % ids.length];
      const b = ids[(i + 7) % ids.length];
      scores.push({
        from: a,
        to: b,
        score: (i % 10) / 10,
        edgeType: 'EXTENDS',
        spread: 0.1,
      });
    }
    const perOp = benchmark('EdgeFormer.decide (1000 pairs)', 2_000, () => {
      EdgeFormer.decide({ scores, existingNodes: nodes });
    });
    expect(perOp).toBeLessThan(5_000_000);
  });

  it('ThreadDetector.detect on 100 nodes / 90 edges', () => {
    const nodes = makeNodes(100);
    const ids = Array.from(nodes.keys());
    const edges: GraphEdge[] = [];
    // Build a single long chain.
    for (let i = 0; i < 90; i++) {
      edges.push({
        id: GraphEdgeId.of(pad(i, 'X')),
        graphId: GRAPH,
        from: ids[i],
        to: ids[i + 1],
        edgeType: 'EXTENDS',
        weight: EdgeWeight.of({ value: 0.9, source: 'OBSERVED' }),
        realisedFrom: null,
      });
    }
    let counter = 0;
    const perOp = benchmark('ThreadDetector.detect (100 nodes / 90 edges)', 2_000, () => {
      counter += 1;
      ThreadDetector.detect({
        graphId: GRAPH,
        nodes,
        edges,
        mintThreadId: () => ThreadId.of(pad(counter, 'H')),
      });
    });
    expect(perOp).toBeLessThan(5_000_000);
  });
});
