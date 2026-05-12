/**
 * IngestElementsBatch — the primary write use case for the Cognitive
 * Graph context. Consumes a batch of CognitiveElement-detected events
 * from the Cognitive Analysis context (Phase 4) and:
 *
 *   1. Loads the graph for the conversation (creating an empty one on miss).
 *   2. Adds each new node (idempotent on duplicate cognitiveElementId).
 *   3. Asks the DGNN port to score candidate pairs.
 *   4. EdgeFormer decides which scores become OBSERVED edges, which
 *      become PREDICTED edges, and which are dropped.
 *   5. Applies the proposals to the aggregate.
 *   6. Saves with optimistic concurrency; invalidates the snapshot cache;
 *      publishes the domain events.
 *
 * The use case is idempotent on (graphId, cognitiveElementId) because
 * `CognitiveGraph.addNode` throws on duplicates but we catch and skip;
 * `addEdge` is naturally idempotent on edge id.
 */

import { EdgeFormer } from '../../domain/edge-former';
import {
  EdgeWeight,
  GraphEdgeId,
  GraphId,
  PredictedEdgeId,
  TurnId,
  isDimension,
  isEdgeType,
  type Dimension,
  type GraphEdge,
  type GraphNode,
  type PredictedEdge,
  type CognitiveElementId,
  CognitiveElementId as CognitiveElementIdNS,
} from '../../domain/value-objects';
import { DuplicateNode } from '../../domain/errors';
import {
  Result,
  type ApplicationError,
  type Clock,
  type CognitiveGraphRepository,
  type DgnnModelClient,
  type DomainEventPublisher,
  type ElementDetectedInput,
  type GraphCache,
  type IdGenerator,
} from '../ports';

export interface IngestElementsBatchInput {
  readonly conversationId: string;
  readonly elements: ReadonlyArray<ElementDetectedInput>;
}

export interface IngestElementsBatchOutput {
  readonly graphVersion: number;
  readonly nodesAdded: number;
  readonly edgesObserved: number;
  readonly edgesPredicted: number;
}

export interface IngestElementsBatchDeps {
  readonly graphs: CognitiveGraphRepository;
  readonly dgnn: DgnnModelClient;
  readonly cache: GraphCache;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
}

export class IngestElementsBatch {
  constructor(private readonly deps: IngestElementsBatchDeps) {}

  async execute(
    input: IngestElementsBatchInput,
  ): Promise<Result<IngestElementsBatchOutput, ApplicationError>> {
    let graphId: GraphId;
    try {
      graphId = GraphId.of(input.conversationId);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'conversationId', reason: 'invalid identifier' });
    }
    if (input.elements.length === 0) {
      return Result.err({ kind: 'InputInvalid', field: 'elements', reason: 'at least one required' });
    }

    const graph = await this.deps.graphs.load(graphId);
    const expectedVersion = graph.version;

    // ---- 1. Add nodes ----------------------------------------------------
    let nodesAdded = 0;
    const justAdded: GraphNode[] = [];
    for (const e of input.elements) {
      if (!isDimension(e.dimension)) {
        return Result.err({
          kind: 'InputInvalid',
          field: 'dimension',
          reason: `unknown ${e.dimension}`,
        });
      }
      const dim: Dimension = e.dimension;
      let elementId: CognitiveElementId;
      let turnId: TurnId;
      try {
        elementId = CognitiveElementIdNS.of(e.cognitiveElementId);
        turnId = TurnId.of(e.turnId);
      } catch {
        return Result.err({ kind: 'InputInvalid', field: 'identifier', reason: 'invalid' });
      }
      if (!Number.isInteger(e.turnIndex) || e.turnIndex < 0) {
        return Result.err({ kind: 'InputInvalid', field: 'turnIndex', reason: 'non-negative integer' });
      }
      if (typeof e.confidence !== 'number' || e.confidence < 0 || e.confidence > 1) {
        return Result.err({ kind: 'InputInvalid', field: 'confidence', reason: '0..1' });
      }
      const node: GraphNode = {
        id: elementId,
        graphId,
        dimension: dim,
        turnId,
        turnIndex: e.turnIndex,
        confidence: e.confidence,
      };
      try {
        graph.addNode(node);
        justAdded.push(node);
        nodesAdded += 1;
      } catch (err) {
        if (err instanceof DuplicateNode) continue; // idempotent
        throw err;
      }
    }

    if (nodesAdded === 0) {
      // Everything was a duplicate — no work to publish.
      return Result.ok({
        graphVersion: graph.version,
        nodesAdded: 0,
        edgesObserved: 0,
        edgesPredicted: 0,
      });
    }

    // ---- 2. Score pairs with DGNN + 3. Form edges -----------------------
    const existing: GraphNode[] = Array.from(graph.nodes.values()).filter(
      (n) => !justAdded.includes(n),
    );
    let scores;
    try {
      scores = await this.deps.dgnn.score({
        graphId,
        existingNodes: existing,
        newNodes: justAdded,
      });
    } catch (e) {
      // DGNN unavailable: still persist the nodes (so the graph
      // accumulates element coverage), but skip edge formation for
      // this batch. The Analysis emits AnalysisDegraded upstream.
      await this.persist(graph, expectedVersion);
      return Result.ok({
        graphVersion: graph.version,
        nodesAdded,
        edgesObserved: 0,
        edgesPredicted: 0,
      });
    }

    const proposals = EdgeFormer.decide({
      scores,
      existingNodes: graph.nodes,
    });

    let edgesObserved = 0;
    let edgesPredicted = 0;
    for (const p of proposals) {
      if (!isEdgeType(p.edgeType)) continue;
      if (p.kind === 'OBSERVED') {
        const edge: GraphEdge = {
          id: GraphEdgeId.of(this.deps.ids.newId()),
          graphId,
          from: p.from,
          to: p.to,
          edgeType: p.edgeType,
          weight: EdgeWeight.of({ value: p.score, source: 'OBSERVED' }),
          realisedFrom: null,
        };
        graph.addEdge(edge);
        edgesObserved += 1;
      } else if (p.kind === 'PREDICTED') {
        const median = p.score;
        const half = p.spread;
        const predicted: PredictedEdge = {
          id: PredictedEdgeId.of(this.deps.ids.newId()),
          graphId,
          from: p.from,
          to: p.to,
          edgeType: p.edgeType,
          confidenceInterval: {
            low: clamp01(median - half),
            median,
            high: clamp01(median + half),
          },
          proposedAt: this.deps.clock.now(),
          realisedAsEdgeId: null,
        };
        graph.proposePredictedEdge(predicted);
        edgesPredicted += 1;
      }
      // DROPPED — no action.
    }

    await this.persist(graph, expectedVersion);
    return Result.ok({
      graphVersion: graph.version,
      nodesAdded,
      edgesObserved,
      edgesPredicted,
    });
  }

  private async persist(graph: ReturnType<CognitiveGraphRepository['load']> extends Promise<infer G> ? G : never, expectedVersion: number): Promise<void> {
    await this.deps.graphs.save(graph as any, expectedVersion);
    await this.deps.cache.invalidate(graph.id);
    await this.deps.publisher.publish(graph.pullEvents());
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
