/**
 * RealisePredictedEdge use case.
 *
 * Upgrades a PredictedEdge to an OBSERVED GraphEdge when downstream
 * evidence confirms the predicted relationship (ADR-0010). The new
 * edge carries `realisedFrom = predictedEdgeId` for audit.
 *
 * The use case is the only entry point that may turn a predicted edge
 * into a real one — the aggregate refuses other paths.
 */

import {
  EdgeWeight,
  GraphEdgeId,
  GraphId,
  PredictedEdgeId,
  type GraphEdge,
} from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type CognitiveGraphRepository,
  type DomainEventPublisher,
  type GraphCache,
  type IdGenerator,
} from '../ports';

export interface RealisePredictedEdgeInput {
  readonly conversationId: string;
  readonly predictedEdgeId: string;
  readonly observedWeight: number;
}

export interface RealisePredictedEdgeOutput {
  readonly newEdgeId: string;
  readonly graphVersion: number;
}

export interface RealisePredictedEdgeDeps {
  readonly graphs: CognitiveGraphRepository;
  readonly cache: GraphCache;
  readonly ids: IdGenerator;
  readonly publisher: DomainEventPublisher;
}

export class RealisePredictedEdge {
  constructor(private readonly deps: RealisePredictedEdgeDeps) {}

  async execute(
    input: RealisePredictedEdgeInput,
  ): Promise<Result<RealisePredictedEdgeOutput, ApplicationError>> {
    let graphId: GraphId;
    let predictedId: PredictedEdgeId;
    try {
      graphId = GraphId.of(input.conversationId);
      predictedId = PredictedEdgeId.of(input.predictedEdgeId);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'identifier', reason: 'invalid' });
    }
    if (typeof input.observedWeight !== 'number' || input.observedWeight < 0 || input.observedWeight > 1) {
      return Result.err({ kind: 'InputInvalid', field: 'observedWeight', reason: '0..1' });
    }

    const graph = await this.deps.graphs.load(graphId);
    const expectedVersion = graph.version;
    const predicted = graph.predictedEdges.get(predictedId);
    if (!predicted) {
      return Result.err({ kind: 'NotFound', resource: 'predicted-edge' });
    }
    if (predicted.realisedAsEdgeId !== null) {
      return Result.err({ kind: 'Conflict', reason: 'already realised' });
    }

    const newEdge: GraphEdge = {
      id: GraphEdgeId.of(this.deps.ids.newId()),
      graphId,
      from: predicted.from,
      to: predicted.to,
      edgeType: predicted.edgeType,
      weight: EdgeWeight.of({ value: input.observedWeight, source: 'OBSERVED' }),
      realisedFrom: predicted.id,
    };

    try {
      graph.realisePredictedEdge({
        predictedEdgeId: predicted.id,
        newEdge,
      });
    } catch (e) {
      return Result.err({
        kind: 'PreconditionFailed',
        reason: (e as Error).message,
      });
    }
    await this.deps.graphs.save(graph, expectedVersion);
    await this.deps.cache.invalidate(graphId);
    await this.deps.publisher.publish(graph.pullEvents());
    return Result.ok({ newEdgeId: newEdge.id, graphVersion: graph.version });
  }
}
