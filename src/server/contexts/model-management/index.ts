/**
 * Model Management — public surface.
 *
 * Other contexts (Cognitive Analysis, Cognitive Graph) consume the
 * `ModelRegistry` published port to read the active bundle. They never
 * import this context's domain or infrastructure modules directly.
 */

// Domain
export {
  BundleVersion,
  UserId,
  MemberId,
  DgnnModelId,
  RulePackId,
  ShadowDeploymentId,
  BUNDLE_STATUSES,
  DEFAULT_PROMOTION_FLOOR,
  isCalibrationParameters,
  isCognitiveMetrics,
  makeMember,
  makeRulePack,
  type BundleStatus,
  type MemberSnapshot,
  type RulePackSnapshot,
  type DgnnModelSnapshot,
  type SymbolicRule,
  type CalibrationParameters,
  type CognitiveMetrics,
} from './domain/value-objects';
export { AnalysisBundle } from './domain/analysis-bundle';
export { ShadowDeployment, type DeploymentStatus } from './domain/shadow-deployment';
export {
  BundlePromotionPolicy,
  DEFAULT_PROMOTION_CONFIG,
  DEFAULT_MIN_SHADOW_ANALYSES,
  type PromotionConfig,
  type PromotionDecision,
  type ShadowAnalysisRecord,
} from './domain/bundle-promotion-policy';
export {
  BundleImmutable,
  InvalidBundleTransition,
  BundleNotEligibleForPromotion,
  BundleIncomplete,
  ActiveBundleConflict,
} from './domain/errors';
export { type ModelManagementEvent } from './domain/events';

// Application
export { CreateBundleDraft, type CreateBundleDraftInput } from './application/use-cases/create-bundle-draft';
export { PromoteToShadow, type PromoteToShadowInput } from './application/use-cases/promote-to-shadow';
export {
  RecordShadowAnalysisResult,
  type RecordShadowAnalysisResultInput,
} from './application/use-cases/record-shadow-analysis-result';
export { PromoteToActive, type PromoteToActiveInput } from './application/use-cases/promote-to-active';
export { RollbackToBundle, type RollbackToBundleInput } from './application/use-cases/rollback-to-bundle';
export { RecomputeCalibration, type RecomputeCalibrationInput } from './application/use-cases/recompute-calibration';

export type {
  AnalysisBundleRepository,
  ShadowDeploymentRepository,
  ModelRegistry,
  BundleArtifactStore,
  IdGenerator,
  Clock,
  DomainEventPublisher,
  Result,
  ApplicationError,
} from './application/ports';
