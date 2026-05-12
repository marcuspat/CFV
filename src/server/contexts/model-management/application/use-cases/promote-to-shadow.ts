/**
 * PromoteToShadow use case.
 *
 * DRAFT -> SHADOW. Opens a ShadowDeployment in OPEN status so shadow
 * analyses can accumulate against the bundle.
 */

import { ShadowDeployment } from '../../domain/shadow-deployment';
import {
  BundleVersion,
  ShadowDeploymentId,
} from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type AnalysisBundleRepository,
  type Clock,
  type DomainEventPublisher,
  type IdGenerator,
  type ShadowDeploymentRepository,
} from '../ports';

export interface PromoteToShadowInput {
  readonly bundleVersion: string;
}

export interface PromoteToShadowDeps {
  readonly bundles: AnalysisBundleRepository;
  readonly shadows: ShadowDeploymentRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
}

export class PromoteToShadow {
  constructor(private readonly deps: PromoteToShadowDeps) {}

  async execute(
    input: PromoteToShadowInput,
  ): Promise<Result<{ bundleVersion: string }, ApplicationError>> {
    let version: BundleVersion;
    try {
      version = BundleVersion.of(input.bundleVersion);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'bundleVersion', reason: 'invalid' });
    }
    const bundle = await this.deps.bundles.findByVersion(version);
    if (!bundle) return Result.err({ kind: 'NotFound', resource: 'bundle' });

    const previousAggregateVersion = bundle.aggregateVersion;
    try {
      bundle.promoteToShadow();
    } catch (e) {
      return Result.err({
        kind: 'PreconditionFailed',
        reason: (e as Error).message,
      });
    }

    const deployment = ShadowDeployment.open({
      id: ShadowDeploymentId.of(this.deps.ids.newId()),
      bundleVersion: version,
      now: this.deps.clock.now(),
    });

    await this.deps.bundles.save(bundle, previousAggregateVersion);
    await this.deps.shadows.save(deployment, 0);
    await this.deps.publisher.publish(bundle.pullEvents());

    return Result.ok({ bundleVersion: bundle.bundleVersion.value });
  }
}
