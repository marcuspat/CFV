/**
 * Multimodal Ingestion — value objects.
 *
 * Pure, immutable. See docs/ddd/07-value-objects.md.
 */

declare const idBrand: unique symbol;
type Brand<T, B extends string> = T & { readonly [idBrand]: B };

export type UploadId = Brand<string, 'UploadId'>;
export type TenantId = Brand<string, 'TenantId'>;
export type ConversationId = Brand<string, 'ConversationId'>;
export type SpeakerId = Brand<string, 'SpeakerId'>;

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
function asId<T extends string>(raw: string, label: string): T {
  if (!ULID_RE.test(raw)) throw new InvalidIdentifier(label, raw);
  return raw as T;
}
export const UploadId       = { of: (s: string): UploadId       => asId<UploadId>(s, 'UploadId') };
export const TenantId       = { of: (s: string): TenantId       => asId<TenantId>(s, 'TenantId') };
export const ConversationId = { of: (s: string): ConversationId => asId<ConversationId>(s, 'ConversationId') };
export const SpeakerId      = { of: (s: string): SpeakerId      => asId<SpeakerId>(s, 'SpeakerId') };

// ---------------------------------------------------------------------------
// MimeType
// ---------------------------------------------------------------------------

export const SUPPORTED_MIME_TYPES = [
  'audio/wav',
  'audio/mpeg',
  'audio/flac',
  'video/mp4',
  'video/quicktime',
] as const;
export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export class MimeType {
  private constructor(public readonly value: SupportedMimeType) {}
  static of(raw: string): MimeType {
    if (!(SUPPORTED_MIME_TYPES as readonly string[]).includes(raw)) {
      throw new UnsupportedMimeType(raw);
    }
    return new MimeType(raw as SupportedMimeType);
  }
  isAudio(): boolean { return this.value.startsWith('audio/'); }
  isVideo(): boolean { return this.value.startsWith('video/'); }
}

// ---------------------------------------------------------------------------
// RetentionPolicy (ADR-0021)
// ---------------------------------------------------------------------------

export class RetentionPolicy {
  private constructor(
    public readonly retainMedia: boolean,
    public readonly maxAgeDays: number,
  ) {}
  static of(args: { retainMedia: boolean; maxAgeDays: number }): RetentionPolicy {
    if (!Number.isInteger(args.maxAgeDays) || args.maxAgeDays < 0) {
      throw new InvalidRetentionPolicy('maxAgeDays must be non-negative integer');
    }
    return new RetentionPolicy(args.retainMedia, args.maxAgeDays);
  }
  static default(): RetentionPolicy {
    return new RetentionPolicy(false, 0);
  }
}

// ---------------------------------------------------------------------------
// Transcription / DiarisationResult / NonVerbalFeatureSet
// ---------------------------------------------------------------------------

export interface TranscriptWord {
  readonly word: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly confidence: number; // [0,1]
}

export class Transcription {
  private constructor(public readonly words: ReadonlyArray<TranscriptWord>) {}
  static of(words: ReadonlyArray<TranscriptWord>): Transcription {
    for (const w of words) {
      if (w.endMs < w.startMs) {
        throw new InvalidTranscription(`endMs ${w.endMs} < startMs ${w.startMs}`);
      }
      if (w.confidence < 0 || w.confidence > 1) {
        throw new InvalidTranscription(`confidence ${w.confidence} out of range`);
      }
    }
    return new Transcription([...words]);
  }
  text(): string {
    return this.words.map((w) => w.word).join(' ');
  }
}

export interface DiarisedTurn {
  readonly speakerId: SpeakerId;
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

export class DiarisationResult {
  private constructor(public readonly turns: ReadonlyArray<DiarisedTurn>) {}
  static of(turns: ReadonlyArray<DiarisedTurn>): DiarisationResult {
    return new DiarisationResult([...turns]);
  }
}

export interface NonVerbalSilence {
  readonly startMs: number;
  readonly endMs: number;
}
export interface NonVerbalOverlap {
  readonly startMs: number;
  readonly endMs: number;
}
export interface NonVerbalEmphasis {
  readonly turnIndex: number;
  readonly level: 1 | 2 | 3;
}

export class NonVerbalFeatureSet {
  private constructor(
    public readonly silences: ReadonlyArray<NonVerbalSilence>,
    public readonly overlaps: ReadonlyArray<NonVerbalOverlap>,
    public readonly emphasis: ReadonlyArray<NonVerbalEmphasis>,
  ) {}
  static of(args: {
    silences?: ReadonlyArray<NonVerbalSilence>;
    overlaps?: ReadonlyArray<NonVerbalOverlap>;
    emphasis?: ReadonlyArray<NonVerbalEmphasis>;
  }): NonVerbalFeatureSet {
    return new NonVerbalFeatureSet(
      [...(args.silences ?? [])],
      [...(args.overlaps ?? [])],
      [...(args.emphasis ?? [])],
    );
  }
  static empty(): NonVerbalFeatureSet {
    return new NonVerbalFeatureSet([], [], []);
  }
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
export class UnsupportedMimeType extends Error {
  constructor(input: string) {
    super(`Unsupported MIME type: ${input}`);
    this.name = 'UnsupportedMimeType';
  }
}
export class InvalidRetentionPolicy extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidRetentionPolicy';
  }
}
export class InvalidTranscription extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidTranscription';
  }
}
