/**
 * In-memory adapters for Cognitive Graph.
 *
 * Mimic the semantics the production adapters must provide:
 *   - InMemoryCognitiveGraphRepository: optimistic concurrency, load
 *     constructs an empty graph on miss, save bumps version.
 *   - HeuristicDgnnModelClient: deterministic pairwise scoring stand-in.
 *   - InMemoryGraphCache: tracks the version-tag per graph.
 */

import { CognitiveGraph } from '../domain/cognitive-graph';
import type { PairwiseScore } from '../domain/edge-former';
import type { CognitiveGraphEvent } from '../domain/events';
import type {
  CognitiveElementId,
  Dimension,
  GraphId,
  GraphNode,
} from '../domain/value-objects';
import type {
  Clock,
  CognitiveGraphRepository,
  DgnnModelClient,
  DomainEventPublisher,
  GraphCache,
  IdGenerator,
} from '../application/ports';

export class AggregateVersionConflict extends Error {
  constructor(public readonly aggregate: string, public readonly id: string) {
    super(`Optimistic-lock conflict on ${aggregate} ${id}`);
    this.name = 'AggregateVersionConflict';
  }
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class InMemoryCognitiveGraphRepository implements CognitiveGraphRepository {
  private readonly byId = new Map<string, ReturnType<CognitiveGraph['snapshot']>>();

  async load(graphId: GraphId): Promise<CognitiveGraph> {
    const snap = this.byId.get(graphId);
    if (snap) return CognitiveGraph.rehydrate(snap);
    return CognitiveGraph.empty({ id: graphId });
  }

  async save(graph: CognitiveGraph, expectedVersion: number): Promise<void> {
    const existing = this.byId.get(graph.id);
    if (existing) {
      if (existing.version !== expectedVersion) {
        throw new AggregateVersionConflict('CognitiveGraph', graph.id);
      }
    } else if (expectedVersion !== 0) {
      throw new AggregateVersionConflict('CognitiveGraph', graph.id);
    }
    this.byId.set(graph.id, graph.snapshot());
  }

  size(): number { return this.byId.size; }
}

// ---------------------------------------------------------------------------
// DGNN — deterministic heuristic
// ---------------------------------------------------------------------------

/**
 * A fake DGNN that scores pairs using two domain-flavoured heuristics:
 *
 *   - Same-dimension nodes within K turns: high score (likely EXTENDS).
 *   - Different-dimension nodes within K turns: medium score (REFERENCES).
 *   - Otherwise: 0.
 *
 * The scoring rule is deliberately simple and deterministic so the
 * Cognitive Graph use cases can be tested without the Python sidecar.
 * Production wiring replaces this with the real DGNN inference adapter
 * (ADR-0010, ADR-0017).
 */
export interface HeuristicDgnnConfig {
  readonly turnWindow: number;          // K
  readonly sameDimensionScore: number;  // OBSERVED ≥ 0.75
  readonly crossDimensionScore: number; // PREDICTED ≥ 0.40, < 0.75
}

export const DEFAULT_HEURISTIC_DGNN_CONFIG: HeuristicDgnnConfig = {
  turnWindow: 3,
  sameDimensionScore: 0.85,
  crossDimensionScore: 0.55,
};

export class HeuristicDgnnModelClient implements DgnnModelClient {
  public shouldFail = false;

  constructor(private readonly config: HeuristicDgnnConfig = DEFAULT_HEURISTIC_DGNN_CONFIG) {}

  async score(args: {
    graphId: GraphId;
    existingNodes: ReadonlyArray<GraphNode>;
    newNodes: ReadonlyArray<GraphNode>;
  }): Promise<ReadonlyArray<PairwiseScore>> {
    if (this.shouldFail) {
      throw new Error('DGNN unavailable');
    }
    const out: PairwiseScore[] = [];
    const all = [...args.existingNodes, ...args.newNodes];
    for (const newer of args.newNodes) {
      for (const other of all) {
        if (other.id === newer.id) continue;
        const distance = Math.abs(newer.turnIndex - other.turnIndex);
        if (distance > this.config.turnWindow) continue;
        const same = other.dimension === newer.dimension;
        const score = same ? this.config.sameDimensionScore : this.config.crossDimensionScore;
        const edgeType = pickEdgeType(other.dimension, newer.dimension, distance);
        // Direction: always from older node to newer (turnIndex orders).
        const from = other.turnIndex <= newer.turnIndex ? other.id : newer.id;
        const to   = other.turnIndex <= newer.turnIndex ? newer.id : other.id;
        out.push({
          from,
          to,
          edgeType,
          score,
          spread: 0.1,
        });
      }
    }
    return out;
  }
}

function pickEdgeType(a: Dimension, b: Dimension, distance: number): PairwiseScore['edgeType'] {
  if (a === b) return distance <= 1 ? 'EXTENDS' : 'REFERENCES';
  if (a === 'CREATIVE_SYNTHESIS' || b === 'CREATIVE_SYNTHESIS') return 'SUPPORTS';
  if (a === 'META_COGNITION' && b !== 'META_COGNITION') return 'REFERENCES';
  return 'REFERENCES';
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export class InMemoryGraphCache implements GraphCache {
  private readonly versions = new Map<string, number>();

  async getVersion(graphId: GraphId): Promise<number | null> {
    const v = this.versions.get(graphId);
    return v ?? null;
  }
  async set(graphId: GraphId, version: number): Promise<void> {
    this.versions.set(graphId, version);
  }
  async invalidate(graphId: GraphId): Promise<void> {
    this.versions.delete(graphId);
  }
}

// ---------------------------------------------------------------------------
// Test-only utilities
// ---------------------------------------------------------------------------

export class CountingIdGenerator implements IdGenerator {
  private counter = 0;
  newId(): string {
    this.counter += 1;
    const stem = this.counter.toString(32).toUpperCase().replace(/I|L|O|U/g, '0');
    return stem.padStart(26, '0');
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date { return new Date(this.current.getTime()); }
  advance(ms: number): void { this.current = new Date(this.current.getTime() + ms); }
}

export class CapturingDomainEventPublisher implements DomainEventPublisher {
  readonly events: CognitiveGraphEvent[] = [];
  async publish(events: ReadonlyArray<CognitiveGraphEvent>): Promise<void> {
    for (const e of events) this.events.push(e);
  }
}

// Re-export for tests that want to construct CognitiveElementIds without
// reaching into the domain module directly.
export type { CognitiveElementId };
