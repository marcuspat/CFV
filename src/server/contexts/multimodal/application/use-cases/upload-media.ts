/**
 * UploadMedia use case.
 *
 * Validates input, stores bytes via BlobStore, persists a MediaUpload
 * aggregate, emits MediaUploaded.
 */

import { MediaUpload } from '../../domain/media-upload';
import {
  MimeType,
  RetentionPolicy,
  TenantId,
  UploadId,
  UnsupportedMimeType,
} from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type BlobStore,
  type Clock,
  type DomainEventPublisher,
  type IdGenerator,
  type MediaUploadRepository,
} from '../ports';

export interface UploadMediaInput {
  readonly tenantId: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly retentionPolicy?: { retainMedia: boolean; maxAgeDays: number };
}

export interface UploadMediaDeps {
  readonly uploads: MediaUploadRepository;
  readonly blobs: BlobStore;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
}

export class UploadMedia {
  constructor(private readonly deps: UploadMediaDeps) {}

  async execute(
    input: UploadMediaInput,
  ): Promise<Result<{ uploadId: string }, ApplicationError>> {
    let tenantId: TenantId;
    try {
      tenantId = TenantId.of(input.tenantId);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'tenantId', reason: 'invalid' });
    }
    if (!input.bytes || input.bytes.byteLength === 0) {
      return Result.err({ kind: 'InputInvalid', field: 'bytes', reason: 'empty payload' });
    }
    let mime: MimeType;
    try {
      mime = MimeType.of(input.mimeType);
    } catch (e) {
      if (e instanceof UnsupportedMimeType) {
        return Result.err({ kind: 'InputInvalid', field: 'mimeType', reason: e.message });
      }
      throw e;
    }
    const retention = input.retentionPolicy
      ? RetentionPolicy.of(input.retentionPolicy)
      : RetentionPolicy.default();

    const storageKey = await this.deps.blobs.put({
      tenantId,
      bytes: input.bytes,
      mimeType: mime.value,
    });

    const upload = MediaUpload.upload({
      id: UploadId.of(this.deps.ids.newId()),
      tenantId,
      mimeType: mime,
      byteSize: input.bytes.byteLength,
      retentionPolicy: retention,
      storageKey,
      now: this.deps.clock.now(),
    });

    await this.deps.uploads.save(upload, 0);
    await this.deps.publisher.publish(upload.pullEvents());
    return Result.ok({ uploadId: upload.id });
  }
}
