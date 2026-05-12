/**
 * Cognitive Graph — application ports.
 *
 * The DGNN is an ACL port (ADR-0017). Concrete adapters wrap the Python
 * ML sidecar's prediction API (ADR-0010); the in-memory adapter for
 * tests returns a deterministic heuristic score.
 */

import type { CognitiveGraph } from '../domain/cognitive-graph';
import type { CognitiveGraphEvent } from '../domain/events';
import type { PairwiseScore } from '../domain/edge-former';
import type {
  CognitiveElementId,
  ConversationId,
  Dimension,
  GraphId,
  GraphNode,
  PredictedEdgeId,
  TurnId,
} from '../domain/value-objects';

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export interface CognitiveGraphRepository {
  /** Load the graph for a conversation; constructs an empty one on miss. */
  load(graphId: GraphId): Promise<CognitiveGraph>;
  /**
   * Persist the aggregate. The repository enforces optimistic concurrency
   * via the `expectedVersion`; on conflict it raises
   * `AggregateVersionConflict` (defined in infrastructure/).
   */
  save(graph: CognitiveGraph, expectedVersion: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// DGNN ACL — pairwise scoring port consumed by IngestElementsBatch.
// ---------------------------------------------------------------------------

export interface DgnnModelClient {
  /**
   * Given a snapshot of existing nodes and the newly added nodes, score
   * candidate pairs. Implementations are free to return fewer pairs
   * than the cartesian product (sparsity preserves cost).
   *
   * The application service does not care HOW the scores are computed
   * (DGNN / heuristic / cached); it only consumes the canonical
   * PairwiseScore shape.
   */
  score(args: {
    graphId: GraphId;
    existingNodes: ReadonlyArray<GraphNode>;
    newNodes: ReadonlyArray<GraphNode>;
  }): Promise<ReadonlyArray<PairwiseScore>>;
}

// ---------------------------------------------------------------------------
// Cache (ADR-0005 — Redis snapshot cache; in-memory in tests).
// ---------------------------------------------------------------------------

export interface GraphCache {
  /** Returns the cached graph version if any. */
  getVersion(graphId: GraphId): Promise<number | null>;
  set(graphId: GraphId, version: number): Promise<void>;
  /** Explicit invalidation; called on GraphNodeAdded / GraphEdgeFormed. */
  invalidate(graphId: GraphId): Promise<void>;
}

// ---------------------------------------------------------------------------
// Inbound: the canonical CognitiveElement event payload from Phase 4.
// We re-declare it locally to keep context isolation (no cross-domain
// import). The composition root adapts the wire payload to this shape.
// ---------------------------------------------------------------------------

export interface ElementDetectedInput {
  readonly conversationId: string;
  readonly cognitiveElementId: string;
  readonly dimension: string;
  readonly turnId: string;
  readonly turnIndex: number;
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// Adapter utilities
// ---------------------------------------------------------------------------

export interface IdGenerator { newId(): string; }
export interface Clock { now(): Date; }
export interface DomainEventPublisher {
  publish(events: ReadonlyArray<CognitiveGraphEvent>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Result / errors
// ---------------------------------------------------------------------------

export type Result<Ok, Err> =
  | { readonly ok: true; readonly value: Ok }
  | { readonly ok: false; readonly error: Err };

export const Result = {
  ok<Ok>(value: Ok): Result<Ok, never> { return { ok: true, value }; },
  err<Err>(error: Err): Result<never, Err> { return { ok: false, error }; },
};

export type ApplicationError =
  | { kind: 'InputInvalid'; field: string; reason: string }
  | { kind: 'NotFound'; resource: string }
  | { kind: 'Conflict'; reason: string }
  | { kind: 'PreconditionFailed'; reason: string }
  | { kind: 'UpstreamUnavailable'; upstream: string };

// Re-exported for adapter authors.
export type { CognitiveElementId, ConversationId, Dimension, GraphId, PredictedEdgeId, TurnId };
