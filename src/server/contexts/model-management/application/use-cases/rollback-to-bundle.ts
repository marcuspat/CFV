/**
 * RollbackToBundle use case.
 *
 * Pins ACTIVE back to a previously-ACTIVE-now-RETIRED bundle, displacing
 * whichever bundle is currently ACTIVE. Emits BundleRolledBack so
 * downstream consumers can react (cache invalidation, audit, etc.).
 */

import {
  BundleVersion,
} from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type AnalysisBundleRepository,
  type Clock,
  type DomainEventPublisher,
} from '../ports';

export interface RollbackToBundleInput {
  readonly targetVersion: string;
  readonly reason: string;
}

export interface RollbackToBundleDeps {
  readonly bundles: AnalysisBundleRepository;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
}

export class RollbackToBundle {
  constructor(private readonly deps: RollbackToBundleDeps) {}

  async execute(
    input: RollbackToBundleInput,
  ): Promise<Result<{ to: string; from: string }, ApplicationError>> {
    let target: BundleVersion;
    try {
      target = BundleVersion.of(input.targetVersion);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'targetVersion', reason: 'invalid' });
    }
    if (!input.reason.trim()) {
      return Result.err({ kind: 'InputInvalid', field: 'reason', reason: 'required' });
    }
    const targetBundle = await this.deps.bundles.findByVersion(target);
    if (!targetBundle) return Result.err({ kind: 'NotFound', resource: 'bundle' });
    if (!targetBundle.isRetired) {
      return Result.err({
        kind: 'PreconditionFailed',
        reason: `bundle ${target.value} is not RETIRED (status=${targetBundle.status})`,
      });
    }
    const currentActive = await this.deps.bundles.findActive();
    if (!currentActive) {
      return Result.err({
        kind: 'PreconditionFailed',
        reason: 'no ACTIVE bundle to displace',
      });
    }
    if (currentActive.bundleVersion.value === target.value) {
      return Result.err({
        kind: 'PreconditionFailed',
        reason: 'target is already ACTIVE',
      });
    }

    const previousTargetAggregateVersion = targetBundle.aggregateVersion;
    const previousActiveAggregateVersion = currentActive.aggregateVersion;

    const now = this.deps.clock.now();
    // Retire the currently-active bundle first, then restore the target.
    // Order matters because `restoreFromRollback` emits the BundleRolledBack
    // event with `from` = the bundle being displaced.
    currentActive.retire();
    targetBundle.restoreFromRollback({
      fromVersion: currentActive.bundleVersion,
      reason: input.reason,
      now,
    });

    await this.deps.bundles.save(
      targetBundle,
      previousTargetAggregateVersion,
      [{ bundle: currentActive, expectedAggregateVersion: previousActiveAggregateVersion }],
    );
    await this.deps.publisher.publish(targetBundle.pullEvents());

    return Result.ok({
      to: targetBundle.bundleVersion.value,
      from: currentActive.bundleVersion.value,
    });
  }
}
