/**
 * Cognitive Graph — value objects.
 *
 * The second CORE bounded context (docs/ddd/05-subdomains.md). Stores the
 * evolving graph of CognitiveElements; backed by Neo4j in production
 * (ADR-0005), in-memory in tests.
 *
 * Pure, immutable; this module is `domain/` and may not import any
 * framework, persistence client, or HTTP library (ADR-0016).
 */

// ---------------------------------------------------------------------------
// Branded identifiers
// ---------------------------------------------------------------------------

declare const idBrand: unique symbol;
type Brand<T, B extends string> = T & { readonly [idBrand]: B };

/** GraphId is equivalent to the ConversationId — one graph per conversation. */
export type GraphId            = Brand<string, 'GraphId'>;
export type ConversationId     = Brand<string, 'ConversationId'>;
export type CognitiveElementId = Brand<string, 'CognitiveElementId'>;
export type GraphEdgeId        = Brand<string, 'GraphEdgeId'>;
export type PredictedEdgeId    = Brand<string, 'PredictedEdgeId'>;
export type ThreadId           = Brand<string, 'ThreadId'>;
export type TurnId             = Brand<string, 'TurnId'>;

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
function asId<T extends string>(raw: string, label: string): T {
  if (!ULID_RE.test(raw)) throw new InvalidIdentifier(label, raw);
  return raw as T;
}
export const GraphId            = { of: (s: string): GraphId            => asId<GraphId>(s, 'GraphId') };
export const ConversationId     = { of: (s: string): ConversationId     => asId<ConversationId>(s, 'ConversationId') };
export const CognitiveElementId = { of: (s: string): CognitiveElementId => asId<CognitiveElementId>(s, 'CognitiveElementId') };
export const GraphEdgeId        = { of: (s: string): GraphEdgeId        => asId<GraphEdgeId>(s, 'GraphEdgeId') };
export const PredictedEdgeId    = { of: (s: string): PredictedEdgeId    => asId<PredictedEdgeId>(s, 'PredictedEdgeId') };
export const ThreadId           = { of: (s: string): ThreadId           => asId<ThreadId>(s, 'ThreadId') };
export const TurnId             = { of: (s: string): TurnId             => asId<TurnId>(s, 'TurnId') };

// ---------------------------------------------------------------------------
// Cognitive dimension — duplicated locally to keep this context's domain
// independent of Cognitive Analysis (docs/ddd/03-strategic-design-context-map.md
// § "Integration Rules" #1). Same closed enum, same wire shape.
// ---------------------------------------------------------------------------

export const DIMENSIONS = [
  'FACTUAL_RETRIEVAL',
  'LOGICAL_INFERENCE',
  'CREATIVE_SYNTHESIS',
  'META_COGNITION',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export function isDimension(s: string): s is Dimension {
  return (DIMENSIONS as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// EdgeType — closed enum (ADR-0010, docs/ddd/04-bounded-contexts.md)
// ---------------------------------------------------------------------------

export const EDGE_TYPES = ['SUPPORTS', 'CONTRADICTS', 'EXTENDS', 'REFERENCES'] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export function isEdgeType(s: string): s is EdgeType {
  return (EDGE_TYPES as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// EdgeWeight — confidence-bearing edge attribute with provenance.
// `source: PREDICTED` marks DGNN-proposed edges that have not been
// realised yet (rendered distinctly in the UI per ADR-0010 / ADR-0011).
// ---------------------------------------------------------------------------

export type EdgeSource = 'OBSERVED' | 'PREDICTED';

export class EdgeWeight {
  private constructor(public readonly value: number, public readonly source: EdgeSource) {}
  static of(args: { value: number; source: EdgeSource }): EdgeWeight {
    if (typeof args.value !== 'number' || !Number.isFinite(args.value) || args.value < 0 || args.value > 1) {
      throw new InvalidEdgeWeight(args.value);
    }
    return new EdgeWeight(args.value, args.source);
  }
}

// ---------------------------------------------------------------------------
// ConfidenceInterval — re-declared locally for the same reason as Dimension.
// ---------------------------------------------------------------------------

export interface ConfidenceInterval {
  readonly low: number;
  readonly median: number;
  readonly high: number;
}

export function isConfidenceInterval(v: unknown): v is ConfidenceInterval {
  if (!v || typeof v !== 'object') return false;
  const c = v as ConfidenceInterval;
  return (
    typeof c.low === 'number' &&
    typeof c.median === 'number' &&
    typeof c.high === 'number' &&
    c.low >= 0 && c.high <= 1 &&
    c.low <= c.median && c.median <= c.high
  );
}

// ---------------------------------------------------------------------------
// GraphNode (entity, identity = CognitiveElementId)
// ---------------------------------------------------------------------------

export interface GraphNode {
  readonly id: CognitiveElementId;
  readonly graphId: GraphId;
  readonly dimension: Dimension;
  readonly turnId: TurnId;
  readonly turnIndex: number;
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// GraphEdge (entity)
// ---------------------------------------------------------------------------

export interface GraphEdge {
  readonly id: GraphEdgeId;
  readonly graphId: GraphId;
  readonly from: CognitiveElementId;
  readonly to: CognitiveElementId;
  readonly edgeType: EdgeType;
  readonly weight: EdgeWeight;
  /** PredictedEdgeId this realised, if any. */
  readonly realisedFrom: PredictedEdgeId | null;
}

// ---------------------------------------------------------------------------
// PredictedEdge (entity)
// ---------------------------------------------------------------------------

export interface PredictedEdge {
  readonly id: PredictedEdgeId;
  readonly graphId: GraphId;
  readonly from: CognitiveElementId;
  readonly to: CognitiveElementId;
  readonly edgeType: EdgeType;
  readonly confidenceInterval: ConfidenceInterval;
  readonly proposedAt: Date;
  readonly realisedAsEdgeId: GraphEdgeId | null;
}

// ---------------------------------------------------------------------------
// Thread (entity) — a coherent trajectory through the graph.
//
// Invariant (enforced by the aggregate): the contained nodes have
// monotonically non-decreasing turnIndex.
// ---------------------------------------------------------------------------

export interface Thread {
  readonly id: ThreadId;
  readonly graphId: GraphId;
  /** Node ids in traversal order. */
  readonly nodes: ReadonlyArray<CognitiveElementId>;
  readonly dominantDimension: Dimension;
  readonly meanConfidence: number;
}

export interface ThreadDescriptor {
  readonly threadId: ThreadId;
  readonly memberCount: number;
  readonly dominantDimension: Dimension;
  readonly meanConfidence: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidIdentifier extends Error {
  constructor(label: string, raw: string) {
    super(`Invalid ${label}: ${raw}`);
    this.name = 'InvalidIdentifier';
  }
}

export class InvalidEdgeWeight extends Error {
  constructor(input: unknown) {
    super(`Invalid EdgeWeight value: ${input}`);
    this.name = 'InvalidEdgeWeight';
  }
}
