/**
 * Multimodal Ingestion — application ports.
 */

import type { MediaUpload } from '../domain/media-upload';
import type { MultimodalEvent } from '../domain/events';
import type {
  ConversationId,
  DiarisationResult,
  NonVerbalFeatureSet,
  TenantId,
  Transcription,
  UploadId,
} from '../domain/value-objects';

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export interface MediaUploadRepository {
  findById(id: UploadId, tenantId: TenantId): Promise<MediaUpload | null>;
  save(upload: MediaUpload, expectedVersion: number): Promise<void>;
  /** Return uploads in PROCESSED state past their retention horizon. */
  listExpired(now: Date): Promise<ReadonlyArray<MediaUpload>>;
}

// ---------------------------------------------------------------------------
// Adapter ports — Anti-Corruption Layer for external providers (ADR-0017)
// ---------------------------------------------------------------------------

export interface SpeechRecognitionClient {
  transcribe(input: { storageKey: string; mimeType: string }): Promise<Transcription>;
}

export interface DiariserClient {
  diarise(input: {
    storageKey: string;
    mimeType: string;
    transcription: Transcription;
  }): Promise<DiarisationResult>;
}

export interface NonVerbalFeatureExtractor {
  extract(input: {
    storageKey: string;
    mimeType: string;
    diarisation: DiarisationResult;
  }): Promise<NonVerbalFeatureSet>;
}

/**
 * The hand-off to Conversation Ingestion. The multimodal pipeline calls
 * this to persist its canonical Conversation output. Implemented by the
 * composition root wiring the two contexts together.
 */
export interface ConversationIngestor {
  ingestFromMedia(args: {
    tenantId: TenantId;
    uploadId: UploadId;
    transcription: Transcription;
    diarisation: DiarisationResult;
    nonVerbal: NonVerbalFeatureSet;
  }): Promise<ConversationId>;
}

export interface BlobStore {
  /** Store the bytes and return the canonical storage key. */
  put(args: { tenantId: TenantId; bytes: Uint8Array; mimeType: string }): Promise<string>;
  /** Best-effort delete. Idempotent — missing keys are a no-op. */
  delete(storageKey: string): Promise<void>;
  /** Whether the key currently exists (used by the purge integration test). */
  exists(storageKey: string): Promise<boolean>;
}

export interface IdGenerator {
  newId(): string;
}

export interface Clock {
  now(): Date;
}

export interface DomainEventPublisher {
  publish(events: ReadonlyArray<MultimodalEvent>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Result / errors
// ---------------------------------------------------------------------------

export type Result<Ok, Err> =
  | { readonly ok: true; readonly value: Ok }
  | { readonly ok: false; readonly error: Err };

export const Result = {
  ok<Ok>(value: Ok): Result<Ok, never> { return { ok: true, value }; },
  err<Err>(error: Err): Result<never, Err> { return { ok: false, error }; },
};

export type ApplicationError =
  | { kind: 'InputInvalid'; field: string; reason: string }
  | { kind: 'NotFound'; resource: string }
  | { kind: 'Conflict'; reason: string }
  | { kind: 'UpstreamUnavailable'; upstream: string }
  | { kind: 'PreconditionFailed'; reason: string };
