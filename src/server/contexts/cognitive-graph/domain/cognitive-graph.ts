/**
 * CognitiveGraph aggregate.
 *
 * docs/ddd/06-aggregates-and-entities.md § "CognitiveGraph (CORE)".
 *
 * Root: CognitiveGraph (one per conversation). Child entities held
 * in-aggregate for invariant enforcement: GraphNode, GraphEdge,
 * PredictedEdge, Thread.
 *
 * Invariants:
 *   1. Every GraphEdge references two existing nodes within the same graph.
 *   2. A PredictedEdge is converted to a GraphEdge only via
 *      realisePredictedEdge; never silently rewritten.
 *   3. A Thread's nodes have monotonically non-decreasing turnIndex.
 *   4. `version` increments on any mutation; events carry the resulting
 *      version (so downstream snapshots can be reconciled).
 *
 * In production the graph is persisted in Neo4j (ADR-0005); the
 * aggregate's `version` lives in a PostgreSQL row alongside it. The
 * in-memory adapter mirrors both responsibilities.
 */

import {
  CrossGraphEdge,
  DuplicateNode,
  EdgeReferencesUnknownNode,
  NodeNotFound,
  PredictedEdgeAlreadyRealised,
  ThreadNotMonotonic,
} from './errors';
import type {
  CognitiveGraphEvent,
  GraphEdgeFormed,
  GraphNodeAdded,
  PredictedEdgeProposed,
  PredictedEdgeRealised,
  ThreadEvolved,
} from './events';
import { ConversationId } from './value-objects';
import type {
  CognitiveElementId,
  Dimension,
  EdgeWeight,
  GraphEdge,
  GraphEdgeId,
  GraphId,
  GraphNode,
  PredictedEdge,
  PredictedEdgeId,
  Thread,
  ThreadId,
} from './value-objects';

interface CognitiveGraphState {
  readonly id: GraphId;
  /** Mirrors ConversationId on the wire. */
  readonly conversationId: ConversationId;
  readonly nodes: ReadonlyMap<CognitiveElementId, GraphNode>;
  readonly edges: ReadonlyMap<GraphEdgeId, GraphEdge>;
  readonly predictedEdges: ReadonlyMap<PredictedEdgeId, PredictedEdge>;
  readonly threads: ReadonlyMap<ThreadId, Thread>;
  /** Bumped on every mutation. */
  readonly version: number;
}

export class CognitiveGraph {
  public get id(): GraphId { return this.state.id; }
  public get version(): number { return this.state.version; }
  public get nodes(): ReadonlyMap<CognitiveElementId, GraphNode> { return this.state.nodes; }
  public get edges(): ReadonlyMap<GraphEdgeId, GraphEdge> { return this.state.edges; }
  public get predictedEdges(): ReadonlyMap<PredictedEdgeId, PredictedEdge> { return this.state.predictedEdges; }
  public get threads(): ReadonlyMap<ThreadId, Thread> { return this.state.threads; }

  private readonly pending: CognitiveGraphEvent[] = [];

  private constructor(private state: CognitiveGraphState) {}

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  static empty(args: { id: GraphId }): CognitiveGraph {
    return new CognitiveGraph({
      id: args.id,
      conversationId: ConversationId.of(args.id),
      nodes: new Map(),
      edges: new Map(),
      predictedEdges: new Map(),
      threads: new Map(),
      version: 0,
    });
  }

  static rehydrate(state: CognitiveGraphState): CognitiveGraph {
    return new CognitiveGraph(state);
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  addNode(node: GraphNode): void {
    if (node.graphId !== this.state.id) {
      throw new CrossGraphEdge();
    }
    if (this.state.nodes.has(node.id)) {
      throw new DuplicateNode(node.id);
    }
    const next = new Map(this.state.nodes);
    next.set(node.id, node);
    const newVersion = this.state.version + 1;
    this.state = { ...this.state, nodes: next, version: newVersion };
    const ev: GraphNodeAdded = {
      type: 'GraphNodeAdded',
      schemaVersion: 1,
      payload: {
        conversationId: this.state.conversationId,
        cognitiveElementId: node.id,
        dimension: node.dimension,
        version: newVersion,
      },
    };
    this.pending.push(ev);
  }

  addEdge(edge: GraphEdge): void {
    if (edge.graphId !== this.state.id) {
      throw new CrossGraphEdge();
    }
    if (!this.state.nodes.has(edge.from)) {
      throw new EdgeReferencesUnknownNode(edge.from);
    }
    if (!this.state.nodes.has(edge.to)) {
      throw new EdgeReferencesUnknownNode(edge.to);
    }
    // Idempotent on edge id.
    if (this.state.edges.has(edge.id)) return;
    const next = new Map(this.state.edges);
    next.set(edge.id, edge);
    const newVersion = this.state.version + 1;
    this.state = { ...this.state, edges: next, version: newVersion };
    const ev: GraphEdgeFormed = {
      type: 'GraphEdgeFormed',
      schemaVersion: 1,
      payload: {
        conversationId: this.state.conversationId,
        from: edge.from,
        to: edge.to,
        edgeType: edge.edgeType,
        weight: { value: edge.weight.value, source: edge.weight.source },
        version: newVersion,
      },
    };
    this.pending.push(ev);
  }

  proposePredictedEdge(predicted: PredictedEdge): void {
    if (predicted.graphId !== this.state.id) {
      throw new CrossGraphEdge();
    }
    if (!this.state.nodes.has(predicted.from)) {
      throw new EdgeReferencesUnknownNode(predicted.from);
    }
    if (!this.state.nodes.has(predicted.to)) {
      throw new EdgeReferencesUnknownNode(predicted.to);
    }
    if (this.state.predictedEdges.has(predicted.id)) return; // idempotent
    const next = new Map(this.state.predictedEdges);
    next.set(predicted.id, predicted);
    const newVersion = this.state.version + 1;
    this.state = { ...this.state, predictedEdges: next, version: newVersion };
    const ev: PredictedEdgeProposed = {
      type: 'PredictedEdgeProposed',
      schemaVersion: 1,
      payload: {
        conversationId: this.state.conversationId,
        predictedEdgeId: predicted.id,
        from: predicted.from,
        to: predicted.to,
        edgeType: predicted.edgeType,
        confidenceInterval: predicted.confidenceInterval,
      },
    };
    this.pending.push(ev);
  }

  /**
   * Upgrade an existing PredictedEdge into a realised GraphEdge.
   * The realising GraphEdge carries `realisedFrom` so audits can trace.
   */
  realisePredictedEdge(args: {
    predictedEdgeId: PredictedEdgeId;
    newEdge: GraphEdge;
  }): void {
    const predicted = this.state.predictedEdges.get(args.predictedEdgeId);
    if (!predicted) {
      throw new EdgeReferencesUnknownNode(args.predictedEdgeId);
    }
    if (predicted.realisedAsEdgeId !== null) {
      throw new PredictedEdgeAlreadyRealised(args.predictedEdgeId);
    }
    if (args.newEdge.graphId !== this.state.id) throw new CrossGraphEdge();
    if (args.newEdge.from !== predicted.from || args.newEdge.to !== predicted.to) {
      throw new EdgeReferencesUnknownNode(args.newEdge.from);
    }
    if (args.newEdge.edgeType !== predicted.edgeType) {
      throw new EdgeReferencesUnknownNode(args.newEdge.id);
    }
    // Atomic: stamp the predicted edge AND add the realised edge.
    const nextPredicted = new Map(this.state.predictedEdges);
    nextPredicted.set(predicted.id, {
      ...predicted,
      realisedAsEdgeId: args.newEdge.id,
    });
    const nextEdges = new Map(this.state.edges);
    nextEdges.set(args.newEdge.id, {
      ...args.newEdge,
      realisedFrom: predicted.id,
    });
    const newVersion = this.state.version + 1;
    this.state = {
      ...this.state,
      predictedEdges: nextPredicted,
      edges: nextEdges,
      version: newVersion,
    };
    const realisedEv: PredictedEdgeRealised = {
      type: 'PredictedEdgeRealised',
      schemaVersion: 1,
      payload: {
        conversationId: this.state.conversationId,
        predictedEdgeId: predicted.id,
        becameEdgeId: args.newEdge.id,
      },
    };
    const formedEv: GraphEdgeFormed = {
      type: 'GraphEdgeFormed',
      schemaVersion: 1,
      payload: {
        conversationId: this.state.conversationId,
        from: args.newEdge.from,
        to: args.newEdge.to,
        edgeType: args.newEdge.edgeType,
        weight: { value: args.newEdge.weight.value, source: args.newEdge.weight.source },
        version: newVersion,
      },
    };
    this.pending.push(formedEv, realisedEv);
  }

  setThreads(threads: ReadonlyArray<Thread>): ReadonlyArray<Thread> {
    // Validate monotonicity + node existence first; if any thread fails,
    // the whole operation rejects so the aggregate stays consistent.
    for (const t of threads) {
      if (t.graphId !== this.state.id) throw new CrossGraphEdge();
      let lastIndex = -Infinity;
      for (const nodeId of t.nodes) {
        const node = this.state.nodes.get(nodeId);
        if (!node) throw new NodeNotFound(nodeId);
        if (node.turnIndex < lastIndex) throw new ThreadNotMonotonic();
        lastIndex = node.turnIndex;
      }
    }

    // Compute deltas: threads that are new or have new nodes.
    const evolved: Thread[] = [];
    const prev = this.state.threads;
    for (const t of threads) {
      const prior = prev.get(t.id);
      const priorSet = new Set(prior ? prior.nodes : []);
      const addedNodes = t.nodes.filter((n) => !priorSet.has(n));
      if (!prior || addedNodes.length > 0) {
        evolved.push(t);
      }
    }

    // Replace threads atomically.
    const next = new Map<ThreadId, Thread>();
    for (const t of threads) next.set(t.id, t);

    const newVersion = this.state.version + (evolved.length > 0 ? 1 : 0);
    this.state = { ...this.state, threads: next, version: newVersion };

    for (const t of evolved) {
      const prior = prev.get(t.id);
      const priorSet = new Set(prior ? prior.nodes : []);
      const addedNodes = t.nodes.filter((n) => !priorSet.has(n));
      const ev: ThreadEvolved = {
        type: 'ThreadEvolved',
        schemaVersion: 1,
        payload: {
          conversationId: this.state.conversationId,
          threadId: t.id,
          addedNodes,
          dominantDimension: t.dominantDimension,
        },
      };
      this.pending.push(ev);
    }
    return evolved;
  }

  // -------------------------------------------------------------------------
  // Persistence + events
  // -------------------------------------------------------------------------

  snapshot(): CognitiveGraphState { return this.state; }

  pullEvents(): ReadonlyArray<CognitiveGraphEvent> {
    const drained = this.pending.slice();
    this.pending.length = 0;
    return drained;
  }

  // -------------------------------------------------------------------------
  // Query helpers (no mutation)
  // -------------------------------------------------------------------------

  nodeById(id: CognitiveElementId): GraphNode | undefined {
    return this.state.nodes.get(id);
  }

  outgoingEdges(nodeId: CognitiveElementId): ReadonlyArray<GraphEdge> {
    const out: GraphEdge[] = [];
    for (const e of this.state.edges.values()) {
      if (e.from === nodeId) out.push(e);
    }
    return out;
  }

  incomingEdges(nodeId: CognitiveElementId): ReadonlyArray<GraphEdge> {
    const out: GraphEdge[] = [];
    for (const e of this.state.edges.values()) {
      if (e.to === nodeId) out.push(e);
    }
    return out;
  }

  /** Convenience: list nodes filtered by dimension. */
  nodesByDimension(dimension: Dimension): ReadonlyArray<GraphNode> {
    const out: GraphNode[] = [];
    for (const n of this.state.nodes.values()) {
      if (n.dimension === dimension) out.push(n);
    }
    return out;
  }

  // Unused parameter helper (silences TS unused warning when callers
  // need to pass through). Removable when more methods accept EdgeWeight
  // directly in their signature; here for symmetry with future ports.
  _edgeWeightShape(_w: EdgeWeight): void { /* no-op */ }
}
