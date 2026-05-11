/**
 * MediaUpload aggregate.
 *
 * docs/ddd/06-aggregates-and-entities.md § "MediaUpload".
 *
 * Lifecycle: UPLOADED -> PROCESSED -> PURGED. The bytes are *not* on the
 * aggregate — they live in object storage (BlobStore port). The
 * aggregate only carries metadata.
 *
 * Invariants:
 *   - The bytes are deleted after PROCESSED unless RetentionPolicy.retainMedia.
 *   - Transcription must have word-level timestamps (enforced by VO).
 *   - State transitions follow the strict lifecycle.
 */

import type { MultimodalEvent } from './events';
import {
  MediaAlreadyProcessed,
  MediaPurged as MediaPurgedError,
} from './errors';
import type {
  ConversationId,
  DiarisationResult,
  MimeType,
  NonVerbalFeatureSet,
  RetentionPolicy,
  TenantId,
  Transcription,
  UploadId,
} from './value-objects';

export type MediaStatus = 'UPLOADED' | 'PROCESSED' | 'PURGED';

interface MediaUploadState {
  readonly id: UploadId;
  readonly tenantId: TenantId;
  readonly mimeType: MimeType;
  readonly byteSize: number;
  readonly status: MediaStatus;
  readonly retentionPolicy: RetentionPolicy;
  readonly storageKey: string;
  readonly conversationId: ConversationId | null;
  readonly transcription: Transcription | null;
  readonly diarisation: DiarisationResult | null;
  readonly nonVerbal: NonVerbalFeatureSet | null;
  readonly createdAt: Date;
  readonly processedAt: Date | null;
  readonly purgedAt: Date | null;
  readonly version: number;
}

export class MediaUpload {
  public get id(): UploadId { return this.state.id; }
  public get tenantId(): TenantId { return this.state.tenantId; }
  public get mimeType(): MimeType { return this.state.mimeType; }
  public get byteSize(): number { return this.state.byteSize; }
  public get status(): MediaStatus { return this.state.status; }
  public get retentionPolicy(): RetentionPolicy { return this.state.retentionPolicy; }
  public get storageKey(): string { return this.state.storageKey; }
  public get conversationId(): ConversationId | null { return this.state.conversationId; }
  public get version(): number { return this.state.version; }
  public get createdAt(): Date { return this.state.createdAt; }

  private readonly pending: MultimodalEvent[] = [];

  private constructor(private state: MediaUploadState) {}

  static upload(args: {
    id: UploadId;
    tenantId: TenantId;
    mimeType: MimeType;
    byteSize: number;
    retentionPolicy: RetentionPolicy;
    storageKey: string;
    now: Date;
  }): MediaUpload {
    if (!Number.isInteger(args.byteSize) || args.byteSize < 0) {
      throw new Error('byteSize must be non-negative integer');
    }
    if (!args.storageKey.trim()) {
      throw new Error('storageKey is required');
    }
    const upload = new MediaUpload({
      id: args.id,
      tenantId: args.tenantId,
      mimeType: args.mimeType,
      byteSize: args.byteSize,
      status: 'UPLOADED',
      retentionPolicy: args.retentionPolicy,
      storageKey: args.storageKey.trim(),
      conversationId: null,
      transcription: null,
      diarisation: null,
      nonVerbal: null,
      createdAt: args.now,
      processedAt: null,
      purgedAt: null,
      version: 1,
    });
    upload.pending.push({
      type: 'MediaUploaded',
      schemaVersion: 1,
      payload: {
        uploadId: args.id,
        tenantId: args.tenantId,
        mimeType: args.mimeType.value,
        byteSize: args.byteSize,
      },
    });
    return upload;
  }

  static rehydrate(state: MediaUploadState): MediaUpload {
    return new MediaUpload(state);
  }

  markProcessed(args: {
    conversationId: ConversationId;
    transcription: Transcription;
    diarisation: DiarisationResult;
    nonVerbal: NonVerbalFeatureSet;
    durationMs: number;
    now: Date;
  }): void {
    if (this.state.status === 'PROCESSED') {
      throw new MediaAlreadyProcessed(this.state.id);
    }
    if (this.state.status === 'PURGED') {
      throw new MediaPurgedError(this.state.id);
    }
    this.state = {
      ...this.state,
      status: 'PROCESSED',
      conversationId: args.conversationId,
      transcription: args.transcription,
      diarisation: args.diarisation,
      nonVerbal: args.nonVerbal,
      processedAt: args.now,
      version: this.state.version + 1,
    };
    this.pending.push({
      type: 'MediaProcessed',
      schemaVersion: 1,
      payload: {
        uploadId: this.state.id,
        conversationId: args.conversationId,
        durationMs: args.durationMs,
      },
    });
  }

  /**
   * Mark the bytes as purged from object storage. Caller is responsible
   * for the actual BlobStore.delete; this just records the policy outcome.
   *
   * Eligibility (retention horizon for retained media, immediate purge
   * for unretained media) is decided by the application service —
   * `ProcessMedia` for the synchronous default-retention purge and
   * `PurgeExpiredMedia` for the scheduled run. The aggregate enforces
   * the state transition itself (idempotent on PURGED) but does not
   * re-litigate the policy decision the application service has made.
   */
  purge(reason: 'DEFAULT' | 'USER_REQUEST', now: Date): void {
    if (this.state.status === 'PURGED') return; // idempotent
    this.state = {
      ...this.state,
      status: 'PURGED',
      purgedAt: now,
      version: this.state.version + 1,
    };
    this.pending.push({
      type: 'MediaPurged',
      schemaVersion: 1,
      payload: {
        uploadId: this.state.id,
        policy: reason,
      },
    });
  }

  shouldPurgeByDefault(): boolean {
    return this.state.status === 'PROCESSED' && !this.state.retentionPolicy.retainMedia;
  }

  pullEvents(): ReadonlyArray<MultimodalEvent> {
    const drained = this.pending.slice();
    this.pending.length = 0;
    return drained;
  }

  snapshot(): MediaUploadState {
    return this.state;
  }
}
