/**
 * CreateBundleDraft use case.
 *
 * Authors a new AnalysisBundle in DRAFT state with its full component
 * set (members, rule pack, DGNN, calibration). Subsequent use cases
 * cannot reopen the draft for editing.
 */

import { AnalysisBundle } from '../../domain/analysis-bundle';
import {
  BundleVersion,
  DgnnModelId,
  MemberId,
  RulePackId,
  UserId,
  makeMember,
  makeRulePack,
  type CalibrationParameters,
  type DgnnModelSnapshot,
  type MemberSnapshot,
  type RulePackSnapshot,
  type SymbolicRule,
  isCalibrationParameters,
} from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type AnalysisBundleRepository,
  type Clock,
  type DomainEventPublisher,
} from '../ports';

export interface CreateBundleDraftInput {
  readonly bundleVersion: string;
  readonly createdBy: string;
  readonly members: ReadonlyArray<{
    id: string;
    provider: string;
    modelName: string;
    promptTemplates: Record<string, string>;
    fusionWeight: number;
  }>;
  readonly rulePack: {
    id: string;
    rules: ReadonlyArray<SymbolicRule>;
  };
  readonly dgnnModel: {
    id: string;
    artefactKey: string;
    trainingMetrics: {
      factualRetrievalAccuracy: number;
      logicalInferencePrecision: number;
      creativeSynthesisRougeL: number;
      metaCognitionF1: number;
    };
  };
  readonly calibration: CalibrationParameters;
}

export interface CreateBundleDraftDeps {
  readonly bundles: AnalysisBundleRepository;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
}

export class CreateBundleDraft {
  constructor(private readonly deps: CreateBundleDraftDeps) {}

  async execute(
    input: CreateBundleDraftInput,
  ): Promise<Result<{ bundleVersion: string }, ApplicationError>> {
    let version: BundleVersion;
    let createdBy: UserId;
    try {
      version = BundleVersion.of(input.bundleVersion);
      createdBy = UserId.of(input.createdBy);
    } catch (e) {
      return Result.err({
        kind: 'InputInvalid',
        field: 'identifier',
        reason: (e as Error).message,
      });
    }

    const existing = await this.deps.bundles.findByVersion(version);
    if (existing) {
      return Result.err({
        kind: 'Conflict',
        reason: `bundle ${input.bundleVersion} already exists`,
      });
    }

    if (input.members.length === 0) {
      return Result.err({ kind: 'InputInvalid', field: 'members', reason: 'at least one member' });
    }
    if (!isCalibrationParameters(input.calibration)) {
      return Result.err({
        kind: 'InputInvalid',
        field: 'calibration',
        reason: 'malformed CalibrationParameters',
      });
    }

    let members: MemberSnapshot[];
    let rulePack: RulePackSnapshot;
    let dgnnModel: DgnnModelSnapshot;
    try {
      members = input.members.map((m) =>
        makeMember({
          id: MemberId.of(m.id),
          provider: m.provider,
          modelName: m.modelName,
          promptTemplates: m.promptTemplates,
          fusionWeight: m.fusionWeight,
        }),
      );
      rulePack = makeRulePack({
        id: RulePackId.of(input.rulePack.id),
        rules: input.rulePack.rules,
      });
      dgnnModel = {
        id: DgnnModelId.of(input.dgnnModel.id),
        artefactKey: input.dgnnModel.artefactKey,
        trainingMetrics: input.dgnnModel.trainingMetrics,
      };
    } catch (e) {
      return Result.err({
        kind: 'InputInvalid',
        field: 'components',
        reason: (e as Error).message,
      });
    }

    const bundle = AnalysisBundle.createDraft({
      version,
      createdBy,
      now: this.deps.clock.now(),
    });
    for (const m of members) bundle.addMember(m);
    bundle.setRulePack(rulePack);
    bundle.setDgnnModel(dgnnModel);
    bundle.setCalibration(input.calibration);

    await this.deps.bundles.save(bundle, 0);
    await this.deps.publisher.publish(bundle.pullEvents());

    return Result.ok({ bundleVersion: bundle.bundleVersion.value });
  }
}
