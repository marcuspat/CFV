/**
 * RecomputeCalibration use case.
 *
 * Per ADR-0022, calibration is recomputed weekly on the ACTIVE bundle
 * (and may also be re-applied on a DRAFT). The use case persists the new
 * parameters in-place and emits CalibrationRecomputed.
 */

import {
  BundleVersion,
  isCalibrationParameters,
  type CalibrationParameters,
} from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type AnalysisBundleRepository,
  type Clock,
  type DomainEventPublisher,
} from '../ports';

export interface RecomputeCalibrationInput {
  readonly bundleVersion: string;
  readonly calibration: CalibrationParameters;
}

export interface RecomputeCalibrationDeps {
  readonly bundles: AnalysisBundleRepository;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
}

export class RecomputeCalibration {
  constructor(private readonly deps: RecomputeCalibrationDeps) {}

  async execute(
    input: RecomputeCalibrationInput,
  ): Promise<Result<{ bundleVersion: string; effectiveAt: string }, ApplicationError>> {
    let version: BundleVersion;
    try {
      version = BundleVersion.of(input.bundleVersion);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'bundleVersion', reason: 'invalid' });
    }
    if (!isCalibrationParameters(input.calibration)) {
      return Result.err({
        kind: 'InputInvalid',
        field: 'calibration',
        reason: 'malformed CalibrationParameters',
      });
    }
    const bundle = await this.deps.bundles.findByVersion(version);
    if (!bundle) return Result.err({ kind: 'NotFound', resource: 'bundle' });

    const now = this.deps.clock.now();
    const previousAggregateVersion = bundle.aggregateVersion;
    try {
      bundle.recomputeCalibration(input.calibration, now);
    } catch (e) {
      return Result.err({
        kind: 'PreconditionFailed',
        reason: (e as Error).message,
      });
    }
    await this.deps.bundles.save(bundle, previousAggregateVersion);
    await this.deps.publisher.publish(bundle.pullEvents());
    return Result.ok({
      bundleVersion: bundle.bundleVersion.value,
      effectiveAt: now.toISOString(),
    });
  }
}
