/**
 * Multimodal Ingestion — domain events.
 */
import type {
  ConversationId,
  TenantId,
  UploadId,
} from './value-objects';

export interface MediaUploaded {
  readonly type: 'MediaUploaded';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly uploadId: UploadId;
    readonly tenantId: TenantId;
    readonly mimeType: string;
    readonly byteSize: number;
  };
}

export interface MediaProcessed {
  readonly type: 'MediaProcessed';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly uploadId: UploadId;
    readonly conversationId: ConversationId;
    readonly durationMs: number;
  };
}

export interface MediaPurged {
  readonly type: 'MediaPurged';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly uploadId: UploadId;
    readonly policy: 'DEFAULT' | 'USER_REQUEST';
  };
}

export type MultimodalEvent = MediaUploaded | MediaProcessed | MediaPurged;
