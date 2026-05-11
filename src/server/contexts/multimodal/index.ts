/**
 * Multimodal Ingestion — public surface.
 */

// Domain
export {
  UploadId,
  TenantId,
  ConversationId,
  SpeakerId,
  MimeType,
  RetentionPolicy,
  Transcription,
  DiarisationResult,
  NonVerbalFeatureSet,
  SUPPORTED_MIME_TYPES,
  type SupportedMimeType,
  type TranscriptWord,
  type DiarisedTurn,
  type NonVerbalSilence,
  type NonVerbalOverlap,
  type NonVerbalEmphasis,
} from './domain/value-objects';
export { MediaUpload, type MediaStatus } from './domain/media-upload';
export { type MultimodalEvent } from './domain/events';
export {
  MediaAlreadyProcessed,
  MediaPurged,
  MediaInvalidStateTransition,
} from './domain/errors';

// Application
export { UploadMedia, type UploadMediaInput } from './application/use-cases/upload-media';
export {
  ProcessMedia,
  UpstreamUnavailable,
  type ProcessMediaInput,
} from './application/use-cases/process-media';
export { PurgeExpiredMedia } from './application/use-cases/purge-expired-media';

export type {
  MediaUploadRepository,
  SpeechRecognitionClient,
  DiariserClient,
  NonVerbalFeatureExtractor,
  ConversationIngestor,
  BlobStore,
  IdGenerator,
  Clock,
  DomainEventPublisher,
  Result,
  ApplicationError,
} from './application/ports';
