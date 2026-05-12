/**
 * ThreadDetector domain service.
 *
 * Clusters nodes into Threads — coherent trajectories through the graph
 * (docs/ddd/09-domain-services.md § "ThreadDetector").
 *
 * v1 algorithm (deterministic): connected-components over the OBSERVED
 * edge set, with each component sorted by turnIndex. A component
 * becomes one Thread. Components of size < `minThreadSize` are dropped.
 *
 * Predicted (un-realised) edges are NOT used for clustering — only
 * observed edges count. This keeps threads stable across DGNN
 * fluctuations.
 *
 * Per ADR-0010 a future ADR may replace this with a DGNN-derived
 * cluster assignment; the domain-service shape stays the same.
 */

import type { GraphEdge, GraphNode, ThreadId } from './value-objects';
import type { CognitiveElementId, Dimension, GraphId, Thread } from './value-objects';

export interface ThreadDetectorConfig {
  readonly minThreadSize: number;
}

export const DEFAULT_THREAD_DETECTOR_CONFIG: ThreadDetectorConfig = {
  minThreadSize: 2,
};

export interface ThreadDetectorInputs {
  readonly graphId: GraphId;
  readonly nodes: ReadonlyMap<CognitiveElementId, GraphNode>;
  readonly edges: ReadonlyArray<GraphEdge>;
  /** Strategy that mints a stable ThreadId given a representative node id. */
  readonly mintThreadId: (representative: CognitiveElementId) => ThreadId;
  readonly config?: ThreadDetectorConfig;
}

export const ThreadDetector = {
  detect(inputs: ThreadDetectorInputs): ReadonlyArray<Thread> {
    const cfg = inputs.config ?? DEFAULT_THREAD_DETECTOR_CONFIG;

    // Build union-find over node ids using observed edges (predicted
    // edges are excluded — see module docstring).
    const parent = new Map<CognitiveElementId, CognitiveElementId>();
    for (const n of inputs.nodes.values()) parent.set(n.id, n.id);

    const find = (x: CognitiveElementId): CognitiveElementId => {
      let root = x;
      while (parent.get(root)! !== root) root = parent.get(root)!;
      // Path compression
      let cursor = x;
      while (parent.get(cursor)! !== root) {
        const next = parent.get(cursor)!;
        parent.set(cursor, root);
        cursor = next;
      }
      return root;
    };
    const union = (a: CognitiveElementId, b: CognitiveElementId): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      // Smaller-id-wins keeps results stable across runs.
      if (ra < rb) parent.set(rb, ra);
      else parent.set(ra, rb);
    };

    for (const e of inputs.edges) {
      if (e.weight.source !== 'OBSERVED') continue;
      if (!inputs.nodes.has(e.from) || !inputs.nodes.has(e.to)) continue;
      union(e.from, e.to);
    }

    // Bucket node ids by representative.
    const buckets = new Map<CognitiveElementId, CognitiveElementId[]>();
    for (const nodeId of parent.keys()) {
      const root = find(nodeId);
      let arr = buckets.get(root);
      if (!arr) {
        arr = [];
        buckets.set(root, arr);
      }
      arr.push(nodeId);
    }

    const threads: Thread[] = [];
    for (const [representative, members] of buckets) {
      if (members.length < cfg.minThreadSize) continue;

      // Order by (turnIndex, nodeId) to satisfy thread monotonicity.
      const ordered = members.slice().sort((a, b) => {
        const na = inputs.nodes.get(a)!;
        const nb = inputs.nodes.get(b)!;
        if (na.turnIndex !== nb.turnIndex) return na.turnIndex - nb.turnIndex;
        return a < b ? -1 : a > b ? 1 : 0;
      });

      // Dominant dimension: highest-count, ties broken alphabetically
      // to keep the result deterministic.
      const dimCounts = new Map<Dimension, number>();
      let weightedConf = 0;
      for (const id of ordered) {
        const n = inputs.nodes.get(id)!;
        dimCounts.set(n.dimension, (dimCounts.get(n.dimension) ?? 0) + 1);
        weightedConf += n.confidence;
      }
      const dominant = pickDominant(dimCounts);
      threads.push({
        id: inputs.mintThreadId(representative),
        graphId: inputs.graphId,
        nodes: ordered,
        dominantDimension: dominant,
        meanConfidence: weightedConf / ordered.length,
      });
    }

    // Stable order: by first-node turnIndex, then by representative id.
    threads.sort((a, b) => {
      const ai = inputs.nodes.get(a.nodes[0])!.turnIndex;
      const bi = inputs.nodes.get(b.nodes[0])!.turnIndex;
      if (ai !== bi) return ai - bi;
      return a.id < b.id ? -1 : 1;
    });
    return threads;
  },
};

function pickDominant(counts: ReadonlyMap<Dimension, number>): Dimension {
  let bestDim: Dimension = 'FACTUAL_RETRIEVAL';
  let bestCount = -1;
  for (const [dim, count] of counts) {
    if (
      count > bestCount ||
      (count === bestCount && dim < bestDim)
    ) {
      bestDim = dim;
      bestCount = count;
    }
  }
  return bestDim;
}
