/**
 * Cognitive Analysis — public surface (CORE bounded context).
 *
 * Other contexts consume the events emitted by the saga (CognitiveElementDetected,
 * AnalysisCompleted) via the published-language event vocabulary in
 * docs/schemas/events. They do NOT import this context's domain types directly.
 */

// Domain
export {
  AnalysisId,
  ConversationId,
  CognitiveElementId,
  MemberId,
  SegmentId,
  TurnId,
  TenantId,
  UserId,
  Confidence,
  ConfidenceInterval,
  EnsembleAgreement,
  Span,
  DIMENSIONS,
  ANALYSIS_STAGES,
  pendingStage,
  isDimension,
  type Dimension,
  type AnalysisStageName,
  type AnalysisStageSnapshot,
  type AnalysisStageStatus,
  type AnalysisStatus,
  type CognitiveElement,
  type Evidence,
  type MemberCandidate,
  type ModelInvocation,
  type ModelResponse,
} from './domain/value-objects';
export { Analysis } from './domain/analysis';
export {
  InvalidStageTransition,
  StageAlreadyCompleted,
  AnalysisAlreadyTerminal,
  UnknownDimension,
  UpstreamUnavailable,
  UpstreamMalformedResponse,
} from './domain/errors';
export type { CognitiveAnalysisEvent } from './domain/events';

// Domain services
export {
  ConfidenceCalibrator,
  type PerDimensionCalibration,
  type PlattParameters,
} from './domain/confidence-calibrator';
export {
  FusionEngine,
  DEFAULT_FUSION_CONFIG,
  type MemberWeight,
  type FusedCandidate,
  type FusionConfig,
} from './domain/fusion-engine';
export {
  SymbolicReasoner,
  type SymbolicRulePredicate,
  type SymbolicTraceEntry,
  type ReasonedCandidate,
} from './domain/symbolic-reasoner';
export { UncertaintyQuantifier } from './domain/uncertainty-quantifier';

// Application
export {
  ExecuteAnalysisSaga,
  hashAnalysisParameters,
  type ExecuteAnalysisSagaInput,
  type ExecuteAnalysisSagaOutput,
} from './application/use-cases/execute-analysis-saga';
export type {
  AnalysisRepository,
  BundleProvider,
  ActiveBundleInputs,
  LanguageModelClient,
  SegmentInput,
  IdGenerator,
  Clock,
  DomainEventPublisher,
  Result,
  ApplicationError,
} from './application/ports';
