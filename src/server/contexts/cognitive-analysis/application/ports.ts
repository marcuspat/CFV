/**
 * Cognitive Analysis — application ports.
 *
 * The single ACL boundary for LLM providers is `LanguageModelClient`
 * (ADR-0017). Adapters in `infrastructure/` translate provider-specific
 * request/response into the canonical ModelInvocation / ModelResponse.
 *
 * The bundle-loading port is `BundleProvider` — supplied by Model
 * Management (Phase 3) via its `ModelRegistry`.
 */

import type { Analysis } from '../domain/analysis';
import type { CognitiveAnalysisEvent } from '../domain/events';
import type {
  AnalysisId,
  ConversationId,
  ModelInvocation,
  ModelResponse,
  SegmentId,
  TenantId,
  UserId,
} from '../domain/value-objects';
import type { PerDimensionCalibration } from '../domain/confidence-calibrator';
import type { SymbolicRulePredicate } from '../domain/symbolic-reasoner';
import type { MemberWeight } from '../domain/fusion-engine';

// ---------------------------------------------------------------------------
// LanguageModelClient (ACL)
// ---------------------------------------------------------------------------

export interface LanguageModelClient {
  readonly memberId: string;
  invoke(request: ModelInvocation): Promise<ModelResponse>;
}

// ---------------------------------------------------------------------------
// Segment provider — Conversation Ingestion's Segment shape adapted here.
//
// We do NOT import the Conversation Ingestion domain types directly
// (cross-context ban from docs/ddd/03-strategic-design-context-map.md).
// Instead the application caller passes already-resolved Segment values
// — the strangler-fig wiring in the composition root translates from
// the upstream context.
// ---------------------------------------------------------------------------

export interface SegmentInput {
  readonly id: SegmentId;
  readonly text: string;
  readonly firstTurnId: string;
  readonly fromTurnIndex: number;
  readonly toTurnIndex: number;
}

// ---------------------------------------------------------------------------
// BundleProvider (consumes Model Management's ModelRegistry).
// We name our published port differently because Model Management's
// `ModelRegistry` is its concept; locally we only care about the inputs
// to a single analysis. The composition root binds them together.
// ---------------------------------------------------------------------------

export interface ActiveBundleInputs {
  readonly bundleVersion: string;
  readonly memberWeights: ReadonlyArray<MemberWeight>;
  readonly promptTemplates: Record<string, string>;
  readonly calibration: PerDimensionCalibration;
  readonly rulePredicates: ReadonlyArray<SymbolicRulePredicate>;
}

export interface BundleProvider {
  active(): Promise<ActiveBundleInputs>;
}

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

export interface AnalysisRepository {
  findById(id: AnalysisId, tenantId: TenantId): Promise<Analysis | null>;
  findByKey(
    conversationId: ConversationId,
    bundleVersion: string,
    parameterHash: string,
  ): Promise<Analysis | null>;
  save(analysis: Analysis, expectedAggregateVersion: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Adapter utilities
// ---------------------------------------------------------------------------

export interface IdGenerator { newId(): string; }
export interface Clock { now(): Date; }
export interface DomainEventPublisher {
  publish(events: ReadonlyArray<CognitiveAnalysisEvent>): Promise<void>;
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
  | { kind: 'PreconditionFailed'; reason: string }
  | { kind: 'UpstreamUnavailable'; upstream: string };
