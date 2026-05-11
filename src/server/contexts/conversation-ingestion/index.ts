/**
 * Conversation Ingestion — public surface.
 *
 * Other contexts and the composition root import from here; never from
 * domain/, application/use-cases/, or infrastructure/ directly.
 */

// Domain
export {
  ConversationId,
  TurnId,
  SegmentId,
  SessionId,
  TenantId,
  UserId,
  SpeakerId,
  TurnIndex,
  SpeakerLabel,
  Span,
  SOURCE_MODALITIES,
  CONVERSATION_STATUSES,
  isSourceModality,
  type SourceModality,
  type ConversationStatus,
  type SegmentationSource,
  type SegmentBoundary,
  type SpeakerType,
} from './domain/value-objects';
export { Conversation, type TurnSnapshot } from './domain/conversation';
export { AnalysisSession, type SessionStatus } from './domain/analysis-session';
export { type ConversationIngestionEvent } from './domain/events';
export {
  ConversationFrozen,
  ConversationDeleted,
  TurnsMustBeMonotonic,
  EmptyConversation,
  SegmentBoundaryOutOfRange,
  InvalidStatusTransition,
} from './domain/errors';

// Application
export { IngestTextConversation, type IngestTextConversationInput } from './application/use-cases/ingest-text-conversation';
export {
  SegmentConversation,
  UpstreamUnavailable,
  type SegmentConversationInput,
} from './application/use-cases/segment-conversation';
export { RequestAnalysis, type RequestAnalysisInput } from './application/use-cases/request-analysis';
export { DeleteConversation, type DeleteConversationInput } from './application/use-cases/delete-conversation';
export type {
  ConversationRepository,
  AnalysisSessionRepository,
  DialogueSegmenter,
  IdGenerator,
  Clock,
  DomainEventPublisher,
  Result,
  ApplicationError,
} from './application/ports';
