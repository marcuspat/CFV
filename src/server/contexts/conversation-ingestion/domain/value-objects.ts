/**
 * Conversation Ingestion — value objects.
 *
 * See docs/ddd/07-value-objects.md for the design rules. This module
 * is `domain/` (ADR-0016) and may not import any framework or
 * persistence client.
 */

// ---------------------------------------------------------------------------
// Branded identifiers
// ---------------------------------------------------------------------------

declare const idBrand: unique symbol;
type Brand<T, B extends string> = T & { readonly [idBrand]: B };

export type ConversationId = Brand<string, 'ConversationId'>;
export type TurnId = Brand<string, 'TurnId'>;
export type SegmentId = Brand<string, 'SegmentId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type TenantId = Brand<string, 'TenantId'>;
export type UserId = Brand<string, 'UserId'>;
export type SpeakerId = Brand<string, 'SpeakerId'>;

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function asId<T extends string>(raw: string, label: string): T {
  if (!ULID_RE.test(raw)) {
    throw new InvalidIdentifier(label, raw);
  }
  return raw as T;
}

export const ConversationId = { of: (s: string): ConversationId => asId<ConversationId>(s, 'ConversationId') };
export const TurnId         = { of: (s: string): TurnId         => asId<TurnId>(s, 'TurnId') };
export const SegmentId      = { of: (s: string): SegmentId      => asId<SegmentId>(s, 'SegmentId') };
export const SessionId      = { of: (s: string): SessionId      => asId<SessionId>(s, 'SessionId') };
export const TenantId       = { of: (s: string): TenantId       => asId<TenantId>(s, 'TenantId') };
export const UserId         = { of: (s: string): UserId         => asId<UserId>(s, 'UserId') };
export const SpeakerId      = { of: (s: string): SpeakerId      => asId<SpeakerId>(s, 'SpeakerId') };

// ---------------------------------------------------------------------------
// Source modality + conversation status
// ---------------------------------------------------------------------------

export const SOURCE_MODALITIES = ['TEXT', 'AUDIO', 'VIDEO'] as const;
export type SourceModality = (typeof SOURCE_MODALITIES)[number];

export function isSourceModality(s: string): s is SourceModality {
  return (SOURCE_MODALITIES as readonly string[]).includes(s);
}

export const CONVERSATION_STATUSES = ['RECEIVED', 'INGESTED', 'SEGMENTED', 'DELETED'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

// ---------------------------------------------------------------------------
// TurnIndex — monotonic non-negative integer
// ---------------------------------------------------------------------------

export class TurnIndex {
  private constructor(public readonly value: number) {}
  static of(n: number): TurnIndex {
    if (!Number.isInteger(n) || n < 0) {
      throw new InvalidTurnIndex(n);
    }
    return new TurnIndex(n);
  }
  equals(other: TurnIndex): boolean {
    return this.value === other.value;
  }
}

// ---------------------------------------------------------------------------
// SpeakerLabel
// ---------------------------------------------------------------------------

export type SpeakerType = 'REAL_USER' | 'DIARISED';

export class SpeakerLabel {
  private constructor(
    public readonly displayName: string,
    public readonly speakerType: SpeakerType,
    public readonly userId: UserId | null,
  ) {}

  static realUser(displayName: string, userId: UserId): SpeakerLabel {
    if (!displayName.trim()) throw new InvalidSpeakerLabel('displayName required');
    return new SpeakerLabel(displayName.trim(), 'REAL_USER', userId);
  }
  static diarised(displayName: string): SpeakerLabel {
    if (!displayName.trim()) throw new InvalidSpeakerLabel('displayName required');
    return new SpeakerLabel(displayName.trim(), 'DIARISED', null);
  }
}

// ---------------------------------------------------------------------------
// Span — the atom of evidence (see docs/ddd/07-value-objects.md)
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
  contains(offset: number): boolean {
    return offset >= this.startOffset && offset < this.endOffset;
  }
  overlaps(other: Span): boolean {
    return (
      this.turnId === other.turnId &&
      this.startOffset < other.endOffset &&
      other.startOffset < this.endOffset
    );
  }
  length(): number {
    return this.endOffset - this.startOffset;
  }
}

// ---------------------------------------------------------------------------
// SegmentBoundary — output of the DialogueSegmenter (ADR-0014)
// ---------------------------------------------------------------------------

export type SegmentationSource = 'RASA' | 'FALLBACK';

export interface SegmentBoundary {
  readonly fromTurnIndex: TurnIndex;
  /** inclusive upper bound */
  readonly toTurnIndex: TurnIndex;
  readonly intent?: string;
  readonly source: SegmentationSource;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidIdentifier extends Error {
  constructor(label: string, input: string) {
    super(`Invalid ${label}: ${input}`);
    this.name = 'InvalidIdentifier';
  }
}
export class InvalidTurnIndex extends Error {
  constructor(input: unknown) {
    super(`Invalid turn index: ${input}`);
    this.name = 'InvalidTurnIndex';
  }
}
export class InvalidSpeakerLabel extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSpeakerLabel';
  }
}
export class InvalidSpan extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSpan';
  }
}
