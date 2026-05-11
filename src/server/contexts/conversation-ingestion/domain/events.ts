/**
 * Conversation Ingestion — domain events.
 *
 * Wire-shape mirrors docs/schemas/events/*.json. Schemas are the
 * source of truth; these TypeScript shapes must remain compatible.
 */

import type { ConversationId, SegmentationSource, SourceModality, TenantId, UserId } from './value-objects';

export interface ConversationIngested {
  readonly type: 'ConversationIngested';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly conversationId: ConversationId;
    readonly tenantId: TenantId;
    readonly sourceModality: SourceModality;
    readonly turnCount: number;
    readonly derivedFromConversationId?: ConversationId;
  };
}

export interface ConversationSegmented {
  readonly type: 'ConversationSegmented';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly conversationId: ConversationId;
    readonly segmentCount: number;
    readonly segmentationSource: SegmentationSource;
  };
}

export interface ConversationDeleted {
  readonly type: 'ConversationDeleted';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly conversationId: ConversationId;
    readonly reason: string;
  };
}

export interface AnalysisRequested {
  readonly type: 'AnalysisRequested';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly conversationId: ConversationId;
    readonly requestedBy: UserId;
    readonly bundleVersion: string;
    readonly parameters: Record<string, unknown>;
  };
}

export type ConversationIngestionEvent =
  | ConversationIngested
  | ConversationSegmented
  | ConversationDeleted
  | AnalysisRequested;
