/**
 * In-memory adapters for Multimodal Ingestion ports.
 *
 * Used by unit/component tests and local dev. Production adapters
 * (S3 / GCS BlobStore, real ASR client) implement the same ports.
 */

import { MediaUpload } from '../domain/media-upload';
import {
  DiarisationResult,
  NonVerbalFeatureSet,
  Transcription,
  type ConversationId,
  type TenantId,
  type UploadId,
} from '../domain/value-objects';
import type {
  BlobStore,
  Clock,
  ConversationIngestor,
  DiariserClient,
  DomainEventPublisher,
  IdGenerator,
  MediaUploadRepository,
  NonVerbalFeatureExtractor,
  SpeechRecognitionClient,
} from '../application/ports';
import type { MultimodalEvent } from '../domain/events';
import { UpstreamUnavailable } from '../application/use-cases/process-media';

export class AggregateVersionConflict extends Error {
  constructor(public readonly aggregate: string, public readonly id: string) {
    super(`Optimistic-lock conflict on ${aggregate} ${id}`);
    this.name = 'AggregateVersionConflict';
  }
}

// ---------------------------------------------------------------------------
// MediaUploadRepository
// ---------------------------------------------------------------------------

export class InMemoryMediaUploadRepository implements MediaUploadRepository {
  private readonly byId = new Map<string, ReturnType<MediaUpload['snapshot']>>();

  async findById(id: UploadId, tenantId: TenantId): Promise<MediaUpload | null> {
    const snap = this.byId.get(id);
    if (!snap || snap.tenantId !== tenantId) return null;
    return MediaUpload.rehydrate(snap);
  }

  async save(upload: MediaUpload, expectedVersion: number): Promise<void> {
    const existing = this.byId.get(upload.id);
    if (existing) {
      if (existing.version !== expectedVersion) {
        throw new AggregateVersionConflict('MediaUpload', upload.id);
      }
    } else if (expectedVersion !== 0) {
      throw new AggregateVersionConflict('MediaUpload', upload.id);
    }
    this.byId.set(upload.id, upload.snapshot());
  }

  async listExpired(now: Date): Promise<ReadonlyArray<MediaUpload>> {
    const out: MediaUpload[] = [];
    for (const snap of this.byId.values()) {
      if (snap.status !== 'PROCESSED') continue;
      const policy = snap.retentionPolicy;
      if (!policy.retainMedia) {
        // ProcessMedia already purged unretained media synchronously; nothing
        // to do here. Include only retained media that has aged out.
        continue;
      }
      const ageDays = (now.getTime() - snap.createdAt.getTime()) / (24 * 60 * 60 * 1000);
      if (ageDays >= policy.maxAgeDays) {
        out.push(MediaUpload.rehydrate(snap));
      }
    }
    return out;
  }

  size(): number {
    return this.byId.size;
  }
}

// ---------------------------------------------------------------------------
// In-memory BlobStore
// ---------------------------------------------------------------------------

export class InMemoryBlobStore implements BlobStore {
  private readonly objects = new Map<string, { bytes: Uint8Array; mimeType: string; tenantId: string }>();
  private counter = 0;

  async put(args: { tenantId: TenantId; bytes: Uint8Array; mimeType: string }): Promise<string> {
    this.counter += 1;
    const key = `tenant/${args.tenantId}/obj-${this.counter}`;
    this.objects.set(key, { bytes: args.bytes, mimeType: args.mimeType, tenantId: args.tenantId });
    return key;
  }

  async delete(storageKey: string): Promise<void> {
    this.objects.delete(storageKey);
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.objects.has(storageKey);
  }

  size(): number {
    return this.objects.size;
  }
}

// ---------------------------------------------------------------------------
// Fake ACL adapters — deterministic outputs for testing.
// ---------------------------------------------------------------------------

export class FakeSpeechRecognitionClient implements SpeechRecognitionClient {
  shouldFail = false;
  async transcribe(input: { storageKey: string; mimeType: string }): Promise<Transcription> {
    if (this.shouldFail) throw new UpstreamUnavailable('asr');
    return Transcription.of([
      { word: 'hello', startMs: 0, endMs: 500, confidence: 0.99 },
      { word: 'world', startMs: 500, endMs: 1000, confidence: 0.97 },
    ]);
  }
}

export class FakeDiariserClient implements DiariserClient {
  shouldFail = false;
  async diarise(input: {
    storageKey: string;
    mimeType: string;
    transcription: Transcription;
  }): Promise<DiarisationResult> {
    if (this.shouldFail) throw new UpstreamUnavailable('diariser');
    return DiarisationResult.of([
      {
        speakerId: 'spk-1' as unknown as ConversationId, // brand-cast for fake
        startMs: 0,
        endMs: 500,
        text: 'hello',
      } as any,
      {
        speakerId: 'spk-2' as unknown as ConversationId,
        startMs: 500,
        endMs: 1000,
        text: 'world',
      } as any,
    ]);
  }
}

export class FakeNonVerbalFeatureExtractor implements NonVerbalFeatureExtractor {
  async extract(input: {
    storageKey: string;
    mimeType: string;
    diarisation: DiarisationResult;
  }): Promise<NonVerbalFeatureSet> {
    return NonVerbalFeatureSet.of({
      silences: [{ startMs: 1000, endMs: 1200 }],
      emphasis: [{ turnIndex: 1, level: 2 }],
    });
  }
}

export class FakeConversationIngestor implements ConversationIngestor {
  private counter = 0;
  ingested: Array<{ tenantId: string; uploadId: string }> = [];
  conversationIdFactory: () => string = () => {
    this.counter += 1;
    const stem = this.counter.toString(32).toUpperCase().replace(/I|L|O|U/g, '0');
    return stem.padStart(26, '0');
  };
  async ingestFromMedia(args: {
    tenantId: TenantId;
    uploadId: UploadId;
  }): Promise<ConversationId> {
    this.ingested.push({ tenantId: args.tenantId, uploadId: args.uploadId });
    return this.conversationIdFactory() as ConversationId;
  }
}

// ---------------------------------------------------------------------------
// Test-only IdGenerator / Clock / Publisher
// ---------------------------------------------------------------------------

export class CountingIdGenerator implements IdGenerator {
  private counter = 0;
  newId(): string {
    this.counter += 1;
    const stem = this.counter.toString(32).toUpperCase().replace(/I|L|O|U/g, '0');
    return stem.padStart(26, '0');
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date { return new Date(this.current.getTime()); }
  advance(ms: number): void { this.current = new Date(this.current.getTime() + ms); }
}

export class CapturingDomainEventPublisher implements DomainEventPublisher {
  readonly events: MultimodalEvent[] = [];
  async publish(events: ReadonlyArray<MultimodalEvent>): Promise<void> {
    for (const e of events) this.events.push(e);
  }
}
