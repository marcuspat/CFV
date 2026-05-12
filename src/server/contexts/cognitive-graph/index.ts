/**
 * Cognitive Graph — public surface (CORE bounded context).
 *
 * Other contexts read from the open-host LoadGraphSnapshot use case and
 * consume the published-language events (GraphNodeAdded, GraphEdgeFormed,
 * PredictedEdgeProposed/Realised, ThreadEvolved). They do NOT import
 * domain types directly.
 */

// Domain
export {
  GraphId,
  ConversationId,
  CognitiveElementId,
  GraphEdgeId,
  PredictedEdgeId,
  ThreadId,
  TurnId,
  EdgeWeight,
  DIMENSIONS,
  EDGE_TYPES,
  isDimension,
  isEdgeType,
  isConfidenceInterval,
  type Dimension,
  type EdgeType,
  type EdgeSource,
  type GraphNode,
  type GraphEdge,
  type PredictedEdge,
  type Thread,
  type ThreadDescriptor,
  type ConfidenceInterval,
} from './domain/value-objects';
export { CognitiveGraph } from './domain/cognitive-graph';
export type { CognitiveGraphEvent } from './domain/events';
export {
  NodeNotFound,
  DuplicateNode,
  EdgeReferencesUnknownNode,
  CrossGraphEdge,
  PredictedEdgeAlreadyRealised,
  ThreadNotMonotonic,
} from './domain/errors';

// Domain services
export {
  EdgeFormer,
  DEFAULT_EDGE_FORMER_CONFIG,
  type EdgeFormerConfig,
  type EdgeProposal,
  type PairwiseScore,
} from './domain/edge-former';
export {
  ThreadDetector,
  DEFAULT_THREAD_DETECTOR_CONFIG,
  type ThreadDetectorConfig,
  type ThreadDetectorInputs,
} from './domain/thread-detector';

// Application
export { IngestElementsBatch, type IngestElementsBatchInput, type IngestElementsBatchOutput } from './application/use-cases/ingest-elements-batch';
export { RunThreadDetection, type RunThreadDetectionInput, type RunThreadDetectionOutput } from './application/use-cases/run-thread-detection';
export { RealisePredictedEdge, type RealisePredictedEdgeInput, type RealisePredictedEdgeOutput } from './application/use-cases/realise-predicted-edge';
export { LoadGraphSnapshot, type LoadGraphSnapshotInput, type LoadGraphSnapshotOutput } from './application/use-cases/load-graph-snapshot';

export type {
  CognitiveGraphRepository,
  DgnnModelClient,
  GraphCache,
  ElementDetectedInput,
  IdGenerator,
  Clock,
  DomainEventPublisher,
  Result,
  ApplicationError,
} from './application/ports';
