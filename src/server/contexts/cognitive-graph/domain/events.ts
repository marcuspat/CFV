/**
 * Cognitive Graph — domain events.
 *
 * Wire shapes mirror docs/schemas/events/Graph*.v1.json. Schemas are
 * the source of truth.
 */

import type {
  CognitiveElementId,
  ConversationId,
  Dimension,
  EdgeSource,
  EdgeType,
  GraphEdgeId,
  PredictedEdgeId,
  ThreadId,
  ConfidenceInterval,
} from './value-objects';

export interface GraphNodeAdded {
  readonly type: 'GraphNodeAdded';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly conversationId: ConversationId;
    readonly cognitiveElementId: CognitiveElementId;
    readonly dimension: Dimension;
    readonly version: number;
  };
}

export interface GraphEdgeFormed {
  readonly type: 'GraphEdgeFormed';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly conversationId: ConversationId;
    readonly from: CognitiveElementId;
    readonly to: CognitiveElementId;
    readonly edgeType: EdgeType;
    readonly weight: { readonly value: number; readonly source: EdgeSource };
    readonly version: number;
  };
}

export interface PredictedEdgeProposed {
  readonly type: 'PredictedEdgeProposed';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly conversationId: ConversationId;
    readonly predictedEdgeId: PredictedEdgeId;
    readonly from: CognitiveElementId;
    readonly to: CognitiveElementId;
    readonly edgeType: EdgeType;
    readonly confidenceInterval: ConfidenceInterval;
  };
}

export interface PredictedEdgeRealised {
  readonly type: 'PredictedEdgeRealised';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly conversationId: ConversationId;
    readonly predictedEdgeId: PredictedEdgeId;
    readonly becameEdgeId: GraphEdgeId;
  };
}

export interface ThreadEvolved {
  readonly type: 'ThreadEvolved';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly conversationId: ConversationId;
    readonly threadId: ThreadId;
    readonly addedNodes: ReadonlyArray<CognitiveElementId>;
    readonly dominantDimension: Dimension;
  };
}

export type CognitiveGraphEvent =
  | GraphNodeAdded
  | GraphEdgeFormed
  | PredictedEdgeProposed
  | PredictedEdgeRealised
  | ThreadEvolved;
