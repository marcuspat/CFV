/**
 * Conversation Ingestion — application ports.
 *
 * Pure interfaces only. Adapters in `infrastructure/`.
 */

import type { AnalysisSession } from '../domain/analysis-session';
import type { Conversation } from '../domain/conversation';
import type { ConversationIngestionEvent } from '../domain/events';
import type {
  ConversationId,
  SegmentBoundary,
  SessionId,
  TenantId,
} from '../domain/value-objects';

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

export interface ConversationRepository {
  findById(id: ConversationId, tenantId: TenantId): Promise<Conversation | null>;
  save(conversation: Conversation, expectedVersion: number): Promise<void>;
  listForTenant(
    tenantId: TenantId,
    page: { offset: number; limit: number },
  ): Promise<ReadonlyArray<Conversation>>;
}

export interface AnalysisSessionRepository {
  findById(id: SessionId, tenantId: TenantId): Promise<AnalysisSession | null>;
  findIdempotent(
    tenantId: TenantId,
    conversationId: ConversationId,
    parameterHash: string,
  ): Promise<AnalysisSession | null>;
  save(
    session: AnalysisSession,
    expectedVersion: number,
    parameterHash: string,
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// Adapter ports
// ---------------------------------------------------------------------------

export interface DialogueSegmenter {
  /**
   * Segment a Conversation into SegmentBoundaries. Implementations:
   *   - `RasaDialogueSegmenter`: primary; returns source: "RASA".
   *   - `HeuristicDialogueSegmenter`: fallback; returns source: "FALLBACK".
   * An application service composes them: try Rasa; on UpstreamUnavailable
   * fall back to heuristic (ADR-0014).
   */
  segment(conversation: Conversation): Promise<ReadonlyArray<SegmentBoundary>>;
  readonly source: 'RASA' | 'FALLBACK';
}

export interface IdGenerator {
  newId(): string;
}

export interface Clock {
  now(): Date;
}

export interface DomainEventPublisher {
  publish(events: ReadonlyArray<ConversationIngestionEvent>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Result / error surface
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
