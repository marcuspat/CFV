/**
 * PurgeExpiredMedia use case (scheduled).
 *
 * Walks the MediaUploadRepository for uploads past their retention
 * horizon and purges their bytes from object storage. Emits MediaPurged
 * with policy "USER_REQUEST" for manual purges and "DEFAULT" for the
 * scheduled run.
 */

import {
  Result,
  type ApplicationError,
  type BlobStore,
  type Clock,
  type DomainEventPublisher,
  type MediaUploadRepository,
} from '../ports';

export interface PurgeExpiredMediaDeps {
  readonly uploads: MediaUploadRepository;
  readonly blobs: BlobStore;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
}

export class PurgeExpiredMedia {
  constructor(private readonly deps: PurgeExpiredMediaDeps) {}

  async execute(): Promise<Result<{ purgedCount: number }, ApplicationError>> {
    const now = this.deps.clock.now();
    const expired = await this.deps.uploads.listExpired(now);
    let purged = 0;
    for (const upload of expired) {
      // Skip already-purged ones (race-condition safe).
      if (upload.status === 'PURGED') continue;
      await this.deps.blobs.delete(upload.storageKey);
      const previousVersion = upload.version;
      upload.purge('DEFAULT', now);
      await this.deps.uploads.save(upload, previousVersion);
      await this.deps.publisher.publish(upload.pullEvents());
      purged += 1;
    }
    return Result.ok({ purgedCount: purged });
  }
}
