/**
 * Cognitive Analysis — domain events.
 *
 * Wire shapes mirror docs/schemas/events/*.json. Schemas are the source
 * of truth; these TypeScript types must remain compatible.
 */

import type {
  AnalysisId,
  AnalysisStageName,
  CognitiveElementId,
  ConversationId,
  Dimension,
  Evidence,
  Span,
  TurnId,
} from './value-objects';

export interface AnalysisStarted {
  readonly type: 'AnalysisStarted';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly analysisId: AnalysisId;
    readonly conversationId: ConversationId;
    readonly bundleVersion: string;
    readonly parameters: Record<string, unknown>;
  };
}

export interface AnalysisStageStarted {
  readonly type: 'AnalysisStageStarted';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly analysisId: AnalysisId;
    readonly stage: AnalysisStageName;
  };
}

export interface AnalysisStageCompleted {
  readonly type: 'AnalysisStageCompleted';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly analysisId: AnalysisId;
    readonly stage: AnalysisStageName;
    readonly durationMs: number;
  };
}

export interface AnalysisStageFailed {
  readonly type: 'AnalysisStageFailed';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly analysisId: AnalysisId;
    readonly stage: AnalysisStageName;
    readonly errorClass: string;
    readonly retryable: boolean;
  };
}

export interface CognitiveElementDetected {
  readonly type: 'CognitiveElementDetected';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly analysisId: AnalysisId;
    readonly cognitiveElementId: CognitiveElementId;
    readonly dimension: Dimension;
    readonly span: {
      readonly turnId: TurnId;
      readonly startOffset: number;
      readonly endOffset: number;
    };
    readonly confidence: number;
    readonly evidence: ReadonlyArray<{
      readonly span: {
        readonly turnId: TurnId;
        readonly startOffset: number;
        readonly endOffset: number;
      };
      readonly verbatim: string;
      readonly externalCitations?: ReadonlyArray<string>;
    }>;
  };
}

export interface AnalysisDegraded {
  readonly type: 'AnalysisDegraded';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly analysisId: AnalysisId;
    readonly reason: string;
    readonly dropped: ReadonlyArray<string>;
  };
}

export interface AnalysisCompleted {
  readonly type: 'AnalysisCompleted';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly analysisId: AnalysisId;
    readonly elementCount: number;
    readonly bundleVersion: string;
    readonly durationMs: number;
    readonly degradedReason?: string;
  };
}

export interface AnalysisFailed {
  readonly type: 'AnalysisFailed';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly analysisId: AnalysisId;
    readonly errorClass: string;
    readonly recoverable: boolean;
  };
}

export type CognitiveAnalysisEvent =
  | AnalysisStarted
  | AnalysisStageStarted
  | AnalysisStageCompleted
  | AnalysisStageFailed
  | CognitiveElementDetected
  | AnalysisDegraded
  | AnalysisCompleted
  | AnalysisFailed;

/**
 * Helper: project a domain Evidence value object onto its wire shape
 * (used when emitting CognitiveElementDetected from the saga).
 */
export function evidenceToWire(ev: Evidence): CognitiveElementDetected['payload']['evidence'][number] {
  const span = ev.span as Span;
  return {
    span: {
      turnId: span.turnId,
      startOffset: span.startOffset,
      endOffset: span.endOffset,
    },
    verbatim: ev.verbatim,
    ...(ev.externalCitations ? { externalCitations: ev.externalCitations } : {}),
  };
}
