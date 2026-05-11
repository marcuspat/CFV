import { IngestTextConversation } from '../../../../src/server/contexts/conversation-ingestion/application/use-cases/ingest-text-conversation';
import { SegmentConversation } from '../../../../src/server/contexts/conversation-ingestion/application/use-cases/segment-conversation';
import { HeuristicDialogueSegmenter } from '../../../../src/server/contexts/conversation-ingestion/infrastructure/heuristic-dialogue-segmenter';
import {
  CapturingDomainEventPublisher,
  CountingIdGenerator,
  FixedClock,
  InMemoryConversationRepository,
} from '../../../../src/server/contexts/conversation-ingestion/infrastructure/in-memory';

const TENANT = '01HJK3R6X7Y8ZAB2C3D4E5F6T0';
const SPEAKER_A = '01HJK3R6X7Y8ZAB2C3D4E5F6A0';
const SPEAKER_B = '01HJK3R6X7Y8ZAB2C3D4E5F6B0';
const NOW = new Date('2026-01-01T00:00:00Z');

function build() {
  const conversations = new InMemoryConversationRepository();
  const ids = new CountingIdGenerator();
  const clock = new FixedClock(NOW);
  const publisher = new CapturingDomainEventPublisher();
  const fallback = new HeuristicDialogueSegmenter();
  // A primary "Rasa" that fails over to the heuristic.
  const primary = {
    source: 'RASA' as const,
    async segment() {
      const { UpstreamUnavailable } = await import(
        '../../../../src/server/contexts/conversation-ingestion/application/use-cases/segment-conversation'
      );
      throw new UpstreamUnavailable('rasa');
    },
  };
  const ingest = new IngestTextConversation({ conversations, ids, clock, publisher });
  const segment = new SegmentConversation({
    conversations,
    primarySegmenter: primary as any,
    fallbackSegmenter: fallback,
    publisher,
  });
  return { ingest, segment, conversations, publisher };
}

async function ingestSample(useCase: ReturnType<typeof build>['ingest']) {
  return useCase.execute({
    tenantId: TENANT,
    title: 'kickoff',
    sourceModality: 'TEXT',
    turns: [
      { speakerId: SPEAKER_A, text: 'hello world', timestamp: NOW.toISOString() },
      { speakerId: SPEAKER_B, text: 'good morning', timestamp: new Date(NOW.getTime() + 1000).toISOString() },
      { speakerId: SPEAKER_A, text: 'anyway, moving on to architecture', timestamp: new Date(NOW.getTime() + 2000).toISOString() },
      { speakerId: SPEAKER_B, text: 'sounds good', timestamp: new Date(NOW.getTime() + 3000).toISOString() },
    ],
  });
}

describe('IngestTextConversation', () => {
  it('persists conversation and emits ConversationIngested', async () => {
    const { ingest, conversations, publisher } = build();
    const r = await ingestSample(ingest);
    expect(r.ok).toBe(true);
    expect(conversations.size()).toBe(1);
    expect(publisher.events.map((e) => e.type)).toEqual(['ConversationIngested']);
  });

  it('rejects empty turns', async () => {
    const { ingest } = build();
    const r = await ingest.execute({
      tenantId: TENANT,
      turns: [],
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });

  it('rejects unknown sourceModality', async () => {
    const { ingest } = build();
    const r = await ingest.execute({
      tenantId: TENANT,
      sourceModality: 'SMOKE_SIGNALS',
      turns: [{ speakerId: SPEAKER_A, text: 'hi', timestamp: NOW.toISOString() }],
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });

  it('rejects malformed timestamp', async () => {
    const { ingest } = build();
    const r = await ingest.execute({
      tenantId: TENANT,
      turns: [{ speakerId: SPEAKER_A, text: 'hi', timestamp: 'not-a-date' }],
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });
});

describe('SegmentConversation (fallback path)', () => {
  it('falls back to heuristic when primary is unavailable', async () => {
    const { ingest, segment, publisher } = build();
    const ingested = await ingestSample(ingest);
    if (!ingested.ok) throw new Error('ingest failed');
    publisher.events.length = 0;

    const r = await segment.execute({
      tenantId: TENANT,
      conversationId: ingested.value.conversationId,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.source).toBe('FALLBACK');
    expect(r.value.segmentCount).toBeGreaterThan(0);
    expect(publisher.events.map((e) => e.type)).toEqual(['ConversationSegmented']);
  });

  it('returns NotFound for missing conversation', async () => {
    const { segment } = build();
    const r = await segment.execute({
      tenantId: TENANT,
      conversationId: '01HJK3R6X7Y8ZAB2C3D4E5F6Z0',
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('NotFound');
  });
});
