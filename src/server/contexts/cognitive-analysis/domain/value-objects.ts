/**
 * Cognitive Analysis — value objects.
 *
 * The CORE subdomain (docs/ddd/05-subdomains.md, ADR-0008/0009/0013).
 * Pure, immutable; this module is `domain/` and may not import any
 * framework, persistence client, or HTTP library (ADR-0016).
 */

// ---------------------------------------------------------------------------
// Branded identifiers
// ---------------------------------------------------------------------------

declare const idBrand: unique symbol;
type Brand<T, B extends string> = T & { readonly [idBrand]: B };

export type AnalysisId          = Brand<string, 'AnalysisId'>;
export type ConversationId      = Brand<string, 'ConversationId'>;
export type SegmentId           = Brand<string, 'SegmentId'>;
export type TurnId              = Brand<string, 'TurnId'>;
export type CognitiveElementId  = Brand<string, 'CognitiveElementId'>;
export type MemberId            = Brand<string, 'MemberId'>;
export type TenantId            = Brand<string, 'TenantId'>;
export type UserId              = Brand<string, 'UserId'>;

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
function asId<T extends string>(raw: string, label: string): T {
  if (!ULID_RE.test(raw)) throw new InvalidIdentifier(label, raw);
  return raw as T;
}
export const AnalysisId         = { of: (s: string): AnalysisId         => asId<AnalysisId>(s, 'AnalysisId') };
export const ConversationId     = { of: (s: string): ConversationId     => asId<ConversationId>(s, 'ConversationId') };
export const SegmentId          = { of: (s: string): SegmentId          => asId<SegmentId>(s, 'SegmentId') };
export const TurnId             = { of: (s: string): TurnId             => asId<TurnId>(s, 'TurnId') };
export const CognitiveElementId = { of: (s: string): CognitiveElementId => asId<CognitiveElementId>(s, 'CognitiveElementId') };
export const MemberId           = { of: (s: string): MemberId           => asId<MemberId>(s, 'MemberId') };
export const TenantId           = { of: (s: string): TenantId           => asId<TenantId>(s, 'TenantId') };
export const UserId             = { of: (s: string): UserId             => asId<UserId>(s, 'UserId') };

// ---------------------------------------------------------------------------
// Cognitive Dimension — closed enum (ADR-0008)
// ---------------------------------------------------------------------------

export const DIMENSIONS = [
  'FACTUAL_RETRIEVAL',
  'LOGICAL_INFERENCE',
  'CREATIVE_SYNTHESIS',
  'META_COGNITION',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export function isDimension(s: string): s is Dimension {
  return (DIMENSIONS as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// Confidence (ADR-0013) — calibrated probability in [0, 1]
// ---------------------------------------------------------------------------

export class Confidence {
  private constructor(public readonly value: number) {}
  static of(v: number): Confidence {
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 1) {
      throw new InvalidConfidence(v);
    }
    return new Confidence(v);
  }
  static clamp(v: number): Confidence {
    if (!Number.isFinite(v)) return new Confidence(0);
    return new Confidence(Math.max(0, Math.min(1, v)));
  }
  combine(other: Confidence, weight: number): Confidence {
    if (weight < 0 || weight > 1) throw new InvalidConfidence(weight);
    return Confidence.of(this.value * (1 - weight) + other.value * weight);
  }
}

export class ConfidenceInterval {
  private constructor(
    public readonly low: Confidence,
    public readonly median: Confidence,
    public readonly high: Confidence,
  ) {}
  static of(args: { low: Confidence; median: Confidence; high: Confidence }): ConfidenceInterval {
    if (args.low.value > args.median.value || args.median.value > args.high.value) {
      throw new InvalidConfidenceInterval();
    }
    return new ConfidenceInterval(args.low, args.median, args.high);
  }
}

// ---------------------------------------------------------------------------
// Span (atom of evidence)
// ---------------------------------------------------------------------------

export class Span {
  private constructor(
    public readonly turnId: TurnId,
    public readonly startOffset: number,
    public readonly endOffset: number,
  ) {}
  static of(turnId: TurnId, startOffset: number, endOffset: number): Span {
    if (!Number.isInteger(startOffset) || startOffset < 0) {
      throw new InvalidSpan('startOffset must be non-negative integer');
    }
    if (!Number.isInteger(endOffset) || endOffset < startOffset) {
      throw new InvalidSpan('endOffset must be >= startOffset');
    }
    return new Span(turnId, startOffset, endOffset);
  }
  /** Stable structural key, used as part of CognitiveElement identity. */
  key(): string {
    return `${this.turnId}:${this.startOffset}:${this.endOffset}`;
  }
  overlaps(other: Span): boolean {
    return (
      this.turnId === other.turnId &&
      this.startOffset < other.endOffset &&
      other.startOffset < this.endOffset
    );
  }
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export interface Evidence {
  readonly span: Span;
  readonly verbatim: string;
  readonly externalCitations?: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// CognitiveElement (as VO emitted by the analysis pipeline)
// ---------------------------------------------------------------------------

export interface CognitiveElement {
  readonly id: CognitiveElementId;
  readonly analysisId: AnalysisId;
  readonly span: Span;
  readonly dimension: Dimension;
  readonly confidence: Confidence;
  readonly evidence: ReadonlyArray<Evidence>;
  readonly bundleVersion: string;
}

// ---------------------------------------------------------------------------
// EnsembleAgreement
// ---------------------------------------------------------------------------

export class EnsembleAgreement {
  private constructor(
    public readonly memberCount: number,
    public readonly agreeingMembers: number,
  ) {}
  static of(args: { memberCount: number; agreeingMembers: number }): EnsembleAgreement {
    if (!Number.isInteger(args.memberCount) || args.memberCount <= 0) {
      throw new InvalidEnsembleAgreement('memberCount must be positive integer');
    }
    if (!Number.isInteger(args.agreeingMembers) || args.agreeingMembers < 0) {
      throw new InvalidEnsembleAgreement('agreeingMembers must be non-negative integer');
    }
    if (args.agreeingMembers > args.memberCount) {
      throw new InvalidEnsembleAgreement('agreeingMembers cannot exceed memberCount');
    }
    return new EnsembleAgreement(args.memberCount, args.agreeingMembers);
  }
  get score(): number {
    return this.agreeingMembers / this.memberCount;
  }
}

// ---------------------------------------------------------------------------
// Per-member candidate emitted by a LanguageModelClient adapter (ADR-0017).
//
// The provider response is mapped to this shape *inside* the adapter;
// the rest of the domain never sees provider-specific types.
// ---------------------------------------------------------------------------

export interface MemberCandidate {
  readonly memberId: MemberId;
  readonly span: Span;
  readonly dimension: Dimension;
  /** Raw model-reported probability (before calibration). */
  readonly rawConfidence: number;
  readonly evidence: ReadonlyArray<Evidence>;
}

/** Canonical request shape passed to a LanguageModelClient adapter. */
export interface ModelInvocation {
  readonly memberId: MemberId;
  readonly segmentText: string;
  readonly segmentTurnId: TurnId;
  /** Per-dimension prompt template names to use. */
  readonly promptTemplates: Record<Dimension | string, string>;
}

export interface ModelResponse {
  readonly memberId: MemberId;
  readonly candidates: ReadonlyArray<MemberCandidate>;
  readonly selfReportedConfidence: number; // 0..1
}

// ---------------------------------------------------------------------------
// Analysis stages — the saga steps (docs/ddd/13-tactical-patterns.md)
// ---------------------------------------------------------------------------

export const ANALYSIS_STAGES = [
  'SEGMENT',
  'DECOMPOSE',
  'FUSE',
  'SYMBOLIC',
  'GRAPH_UPDATE',
  'THREAD_PREDICT',
  'NOTIFY',
] as const;
export type AnalysisStageName = (typeof ANALYSIS_STAGES)[number];

export type AnalysisStageStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface AnalysisStageSnapshot {
  readonly name: AnalysisStageName;
  readonly status: AnalysisStageStatus;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly durationMs: number | null;
  readonly errorClass: string | null;
  readonly retryable: boolean | null;
}

export function pendingStage(name: AnalysisStageName): AnalysisStageSnapshot {
  return {
    name,
    status: 'PENDING',
    startedAt: null,
    completedAt: null,
    durationMs: null,
    errorClass: null,
    retryable: null,
  };
}

// ---------------------------------------------------------------------------
// Analysis status (aggregate-level)
// ---------------------------------------------------------------------------

export type AnalysisStatus = 'STARTED' | 'RUNNING' | 'COMPLETED' | 'DEGRADED' | 'FAILED';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidIdentifier extends Error {
  constructor(label: string, raw: string) {
    super(`Invalid ${label}: ${raw}`);
    this.name = 'InvalidIdentifier';
  }
}
export class InvalidConfidence extends Error {
  constructor(input: unknown) {
    super(`Invalid Confidence: ${input}`);
    this.name = 'InvalidConfidence';
  }
}
export class InvalidConfidenceInterval extends Error {
  constructor() {
    super('ConfidenceInterval must satisfy low <= median <= high');
    this.name = 'InvalidConfidenceInterval';
  }
}
export class InvalidSpan extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSpan';
  }
}
export class InvalidEnsembleAgreement extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEnsembleAgreement';
  }
}
