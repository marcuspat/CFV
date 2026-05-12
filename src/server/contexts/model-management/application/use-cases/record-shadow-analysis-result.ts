/**
 * RecordShadowAnalysisResult use case.
 *
 * Appends a single shadow-analysis outcome to the bundle's
 * ShadowDeployment. Idempotent on (bundleVersion, analysisId).
 */

import {
  BundleVersion,
  type CognitiveMetrics,
} from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type Clock,
  type DomainEventPublisher,
  type ShadowDeploymentRepository,
} from '../ports';

export interface RecordShadowAnalysisResultInput {
  readonly bundleVersion: string;
  readonly analysisId: string;
  readonly metrics: CognitiveMetrics;
}

export interface RecordShadowAnalysisResultDeps {
  readonly shadows: ShadowDeploymentRepository;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
}

export class RecordShadowAnalysisResult {
  constructor(private readonly deps: RecordShadowAnalysisResultDeps) {}

  async execute(
    input: RecordShadowAnalysisResultInput,
  ): Promise<Result<{ recorded: boolean }, ApplicationError>> {
    let version: BundleVersion;
    try {
      version = BundleVersion.of(input.bundleVersion);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'bundleVersion', reason: 'invalid' });
    }
    if (!input.analysisId.trim()) {
      return Result.err({ kind: 'InputInvalid', field: 'analysisId', reason: 'required' });
    }
    const deployment = await this.deps.shadows.findByBundle(version);
    if (!deployment) return Result.err({ kind: 'NotFound', resource: 'shadow-deployment' });

    const previousAggregateVersion = deployment.aggregateVersion;
    const previousCount = deployment.results.length;
    try {
      deployment.recordResult({
        analysisId: input.analysisId,
        metrics: input.metrics,
        now: this.deps.clock.now(),
      });
    } catch (e) {
      return Result.err({
        kind: 'PreconditionFailed',
        reason: (e as Error).message,
      });
    }
    const recorded = deployment.results.length > previousCount;
    if (recorded) {
      await this.deps.shadows.save(deployment, previousAggregateVersion);
      await this.deps.publisher.publish(deployment.pullEvents());
    }
    return Result.ok({ recorded });
  }
}
