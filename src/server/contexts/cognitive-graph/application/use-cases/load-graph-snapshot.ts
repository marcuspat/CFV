/**
 * LoadGraphSnapshot use case.
 *
 * Open-host read-only query consumed by Visualization (Phase 6) and
 * Insights (Phase 8). Loads the graph; on cache miss it goes through the
 * repository; on cache hit it returns the cached version *header* and
 * lets the caller decide whether to refetch the full snapshot.
 *
 * v1 returns the aggregate's snapshot directly. A production cache
 * (Redis) materialises the full Cypher response keyed by graphId + version.
 */

import { GraphId } from '../../domain/value-objects';
import type { CognitiveGraph } from '../../domain/cognitive-graph';
import {
  Result,
  type ApplicationError,
  type CognitiveGraphRepository,
  type GraphCache,
} from '../ports';

export interface LoadGraphSnapshotInput {
  readonly conversationId: string;
}

export interface LoadGraphSnapshotOutput {
  readonly graph: CognitiveGraph;
  readonly cached: boolean;
}

export interface LoadGraphSnapshotDeps {
  readonly graphs: CognitiveGraphRepository;
  readonly cache: GraphCache;
}

export class LoadGraphSnapshot {
  constructor(private readonly deps: LoadGraphSnapshotDeps) {}

  async execute(
    input: LoadGraphSnapshotInput,
  ): Promise<Result<LoadGraphSnapshotOutput, ApplicationError>> {
    let graphId: GraphId;
    try {
      graphId = GraphId.of(input.conversationId);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'conversationId', reason: 'invalid' });
    }
    const cached = await this.deps.cache.getVersion(graphId);
    const graph = await this.deps.graphs.load(graphId);
    const hit = cached !== null && cached === graph.version;
    if (cached === null || cached !== graph.version) {
      await this.deps.cache.set(graphId, graph.version);
    }
    return Result.ok({ graph, cached: hit });
  }
}
