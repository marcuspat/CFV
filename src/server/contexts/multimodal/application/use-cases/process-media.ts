/**
 * ProcessMedia use case.
 *
 * Composes ASR + diarisation + non-verbal extraction, hands off to
 * Conversation Ingestion, marks the MediaUpload PROCESSED, and — per
 * the default retention policy (ADR-0021) — purges the bytes.
 *
 * Failures from any external provider are mapped via the canonical
 * ApplicationError vocabulary; the saga is left in its prior state so
 * retries are safe.
 */

import { TenantId, UploadId } from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type BlobStore,
  type Clock,
  type ConversationIngestor,
  type DiariserClient,
  type DomainEventPublisher,
  type MediaUploadRepository,
  type NonVerbalFeatureExtractor,
  type SpeechRecognitionClient,
} from '../ports';

export class UpstreamUnavailable extends Error {
  constructor(public readonly upstream: string) {
    super(`Upstream unavailable: ${upstream}`);
    this.name = 'UpstreamUnavailable';
  }
}

export interface ProcessMediaInput {
  readonly tenantId: string;
  readonly uploadId: string;
}

export interface ProcessMediaDeps {
  readonly uploads: MediaUploadRepository;
  readonly asr: SpeechRecognitionClient;
  readonly diariser: DiariserClient;
  readonly extractor: NonVerbalFeatureExtractor;
  readonly conversations: ConversationIngestor;
  readonly blobs: BlobStore;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
}

export class ProcessMedia {
  constructor(private readonly deps: ProcessMediaDeps) {}

  async execute(
    input: ProcessMediaInput,
  ): Promise<Result<{ conversationId: string; durationMs: number }, ApplicationError>> {
    let tenantId: TenantId;
    let uploadId: UploadId;
    try {
      tenantId = TenantId.of(input.tenantId);
      uploadId = UploadId.of(input.uploadId);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'identifier', reason: 'invalid' });
    }

    const upload = await this.deps.uploads.findById(uploadId, tenantId);
    if (!upload) return Result.err({ kind: 'NotFound', resource: 'media-upload' });
    if (upload.status === 'PURGED') return Result.err({ kind: 'NotFound', resource: 'media-upload' });
    if (upload.status === 'PROCESSED') {
      return Result.err({ kind: 'Conflict', reason: 'already processed' });
    }

    const start = this.deps.clock.now();
    let transcription, diarisation, nonVerbal;
    try {
      transcription = await this.deps.asr.transcribe({
        storageKey: upload.storageKey,
        mimeType: upload.mimeType.value,
      });
      diarisation = await this.deps.diariser.diarise({
        storageKey: upload.storageKey,
        mimeType: upload.mimeType.value,
        transcription,
      });
      nonVerbal = await this.deps.extractor.extract({
        storageKey: upload.storageKey,
        mimeType: upload.mimeType.value,
        diarisation,
      });
    } catch (e) {
      if (e instanceof UpstreamUnavailable) {
        return Result.err({ kind: 'UpstreamUnavailable', upstream: e.upstream });
      }
      throw e;
    }

    const conversationId = await this.deps.conversations.ingestFromMedia({
      tenantId,
      uploadId,
      transcription,
      diarisation,
      nonVerbal,
    });

    const previousVersion = upload.version;
    const end = this.deps.clock.now();
    const durationMs = end.getTime() - start.getTime();
    upload.markProcessed({
      conversationId,
      transcription,
      diarisation,
      nonVerbal,
      durationMs,
      now: end,
    });

    // Purge by default (ADR-0021); retained media stays around.
    if (upload.shouldPurgeByDefault()) {
      await this.deps.blobs.delete(upload.storageKey);
      upload.purge('DEFAULT', end);
    }

    await this.deps.uploads.save(upload, previousVersion);
    await this.deps.publisher.publish(upload.pullEvents());

    return Result.ok({ conversationId, durationMs });
  }
}
