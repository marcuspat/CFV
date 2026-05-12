/**
 * RunThreadDetection use case.
 *
 * Computes the current set of Threads from the OBSERVED edge set and
 * persists any changes (ADR-0010). Idempotent: re-running without graph
 * changes is a no-op and emits no events.
 */

import { ThreadDetector } from '../../domain/thread-detector';
import {
  GraphId,
  ThreadId,
  type CognitiveElementId,
} from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type CognitiveGraphRepository,
  type DomainEventPublisher,
  type GraphCache,
  type IdGenerator,
} from '../ports';

export interface RunThreadDetectionInput {
  readonly conversationId: string;
}

export interface RunThreadDetectionOutput {
  readonly graphVersion: number;
  readonly threadCount: number;
  readonly evolvedCount: number;
}

export interface RunThreadDetectionDeps {
  readonly graphs: CognitiveGraphRepository;
  readonly cache: GraphCache;
  readonly ids: IdGenerator;
  readonly publisher: DomainEventPublisher;
}

export class RunThreadDetection {
  constructor(private readonly deps: RunThreadDetectionDeps) {}

  async execute(
    input: RunThreadDetectionInput,
  ): Promise<Result<RunThreadDetectionOutput, ApplicationError>> {
    let graphId: GraphId;
    try {
      graphId = GraphId.of(input.conversationId);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'conversationId', reason: 'invalid identifier' });
    }
    const graph = await this.deps.graphs.load(graphId);
    const expectedVersion = graph.version;

    // Thread identity must be continuous across re-runs (see ADR-0010,
    // docs/ddd/09-domain-services.md § "ThreadDetector"). Strategy:
    // reuse an existing thread's id when the representative is already
    // a member of an existing thread; otherwise mint a fresh id. This
    // keeps a thread stable as the graph accrues new nodes that extend
    // it, and avoids spurious ThreadEvolved events on no-op re-runs.
    const existingThreadByNode = new Map<CognitiveElementId, ThreadId>();
    for (const t of graph.threads.values()) {
      for (const n of t.nodes) existingThreadByNode.set(n, t.id);
    }

    const mint = (representative: CognitiveElementId): ThreadId => {
      const reused = existingThreadByNode.get(representative);
      if (reused) return reused;
      return ThreadId.of(this.deps.ids.newId());
    };

    const threads = ThreadDetector.detect({
      graphId,
      nodes: graph.nodes,
      edges: Array.from(graph.edges.values()),
      mintThreadId: mint,
    });
    const evolved = graph.setThreads(threads);
    if (evolved.length > 0) {
      await this.deps.graphs.save(graph, expectedVersion);
      await this.deps.cache.invalidate(graphId);
      await this.deps.publisher.publish(graph.pullEvents());
    }
    return Result.ok({
      graphVersion: graph.version,
      threadCount: threads.length,
      evolvedCount: evolved.length,
    });
  }
}
