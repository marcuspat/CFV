/**
 * Multimodal Ingestion — domain errors.
 */

export class MultimodalDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MultimodalDomainError';
  }
}

export class MediaAlreadyProcessed extends MultimodalDomainError {
  constructor(uploadId: string) {
    super(`MediaUpload ${uploadId} is already processed`);
    this.name = 'MediaAlreadyProcessed';
  }
}

export class MediaPurged extends MultimodalDomainError {
  constructor(uploadId: string) {
    super(`MediaUpload ${uploadId} has been purged`);
    this.name = 'MediaPurged';
  }
}

export class MediaInvalidStateTransition extends MultimodalDomainError {
  constructor(from: string, to: string) {
    super(`Cannot transition from ${from} to ${to}`);
    this.name = 'MediaInvalidStateTransition';
  }
}
