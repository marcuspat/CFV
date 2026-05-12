/**
 * PromoteToActive use case.
 *
 * SHADOW -> ACTIVE, contingent on BundlePromotionPolicy approval.
 * Atomically RETIREs any currently-ACTIVE bundle.
 */

import {
  BundlePromotionPolicy,
  type PromotionConfig,
} from '../../domain/bundle-promotion-policy';
import {
  BundleVersion,
} from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type AnalysisBundleRepository,
  type Clock,
  type DomainEventPublisher,
  type ShadowDeploymentRepository,
} from '../ports';

export interface PromoteToActiveInput {
  readonly bundleVersion: string;
}

export interface PromoteToActiveDeps {
  readonly bundles: AnalysisBundleRepository;
  readonly shadows: ShadowDeploymentRepository;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
  /** Optional config override; otherwise the canonical defaults apply. */
  readonly promotionConfig?: PromotionConfig;
}

export class PromoteToActive {
  constructor(private readonly deps: PromoteToActiveDeps) {}

  async execute(
    input: PromoteToActiveInput,
  ): Promise<Result<{ bundleVersion: string; displaced: string | null }, ApplicationError>> {
    let version: BundleVersion;
    try {
      version = BundleVersion.of(input.bundleVersion);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'bundleVersion', reason: 'invalid' });
    }
    const bundle = await this.deps.bundles.findByVersion(version);
    if (!bundle) return Result.err({ kind: 'NotFound', resource: 'bundle' });

    const deployment = await this.deps.shadows.findByBundle(version);
    if (!deployment) return Result.err({ kind: 'NotFound', resource: 'shadow-deployment' });

    const decision = BundlePromotionPolicy.decide(
      deployment.results.map((r) => ({ analysisId: r.analysisId, metrics: r.metrics })),
      this.deps.promotionConfig,
    );
    if (!decision.eligible) {
      return Result.err({ kind: 'PreconditionFailed', reason: decision.reason });
    }

    const currentActive = await this.deps.bundles.findActive();
    const displaced =
      currentActive && currentActive.bundleVersion.value !== version.value ? currentActive : null;

    const previousAggregateVersion = bundle.aggregateVersion;
    const displacedAggregateVersion = displaced ? displaced.aggregateVersion : 0;
    try {
      bundle.promoteToActive({
        now: this.deps.clock.now(),
        displacedActive: displaced,
      });
    } catch (e) {
      return Result.err({
        kind: 'PreconditionFailed',
        reason: (e as Error).message,
      });
    }
    deployment.close();

    await this.deps.bundles.save(
      bundle,
      previousAggregateVersion,
      displaced
        ? [{ bundle: displaced, expectedAggregateVersion: displacedAggregateVersion }]
        : undefined,
    );
    await this.deps.shadows.save(deployment, deployment.aggregateVersion - 1);
    await this.deps.publisher.publish(bundle.pullEvents());

    return Result.ok({
      bundleVersion: bundle.bundleVersion.value,
      displaced: displaced ? displaced.bundleVersion.value : null,
    });
  }
}
