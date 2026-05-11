import { Conversation, type TurnSnapshot } from '../../../../src/server/contexts/conversation-ingestion/domain/conversation';
import { HeuristicDialogueSegmenter } from '../../../../src/server/contexts/conversation-ingestion/infrastructure/heuristic-dialogue-segmenter';
import {
  ConversationId,
  SpeakerId,
  TenantId,
  TurnId,
  TurnIndex,
} from '../../../../src/server/contexts/conversation-ingestion/domain/value-objects';

const TENANT = TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T0');
const CONV = ConversationId.of('01HJK3R6X7Y8ZAB2C3D4E5F6C0');
const ALICE = SpeakerId.of('01HJK3R6X7Y8ZAB2C3D4E5F6A0');
const BOB = SpeakerId.of('01HJK3R6X7Y8ZAB2C3D4E5F6B0');
const NOW = new Date('2026-01-01T00:00:00Z');

function turn(i: number, speakerId: SpeakerId, text: string): TurnSnapshot {
  return {
    id: TurnId.of(`01HJK3R6X7Y8ZAB2C3D4E5F${i % 10}T0`.padEnd(26, '0').slice(0, 26)),
    speakerId,
    text,
    timestamp: new Date(NOW.getTime() + i * 1000),
    turnIndex: TurnIndex.of(i),
  };
}

function makeConversation(turns: TurnSnapshot[]): Conversation {
  return Conversation.ingest({
    id: CONV,
    tenantId: TENANT,
    title: '',
    sourceModality: 'TEXT',
    turns,
    now: NOW,
  });
}

describe('HeuristicDialogueSegmenter', () => {
  it('returns FALLBACK as its source', () => {
    const seg = new HeuristicDialogueSegmenter();
    expect(seg.source).toBe('FALLBACK');
  });

  it('returns a single segment for trivially short conversations', async () => {
    const seg = new HeuristicDialogueSegmenter();
    const conv = makeConversation([turn(0, ALICE, 'hi')]);
    const out = await seg.segment(conv);
    expect(out).toHaveLength(1);
    expect(out[0].fromTurnIndex.value).toBe(0);
    expect(out[0].toTurnIndex.value).toBe(0);
  });

  it('splits on topic-shift markers', async () => {
    const seg = new HeuristicDialogueSegmenter();
    const conv = makeConversation([
      turn(0, ALICE, 'context one'),
      turn(1, ALICE, 'context two'),
      turn(2, ALICE, 'anyway, moving on to a new topic'),
      turn(3, ALICE, 'context three'),
    ]);
    const out = await seg.segment(conv);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.some((b) => b.intent === 'topic_shift')).toBe(true);
  });

  it('caps segment length to maxSegmentSize', async () => {
    const seg = new HeuristicDialogueSegmenter({
      minSegmentSize: 2,
      maxSegmentSize: 3,
      topicShiftMarkers: [],
    });
    const turns: TurnSnapshot[] = [];
    for (let i = 0; i < 8; i++) {
      turns.push(turn(i, ALICE, `monologue ${i}`));
    }
    const out = await seg.segment(makeConversation(turns));
    for (const b of out) {
      expect(b.toTurnIndex.value - b.fromTurnIndex.value + 1).toBeLessThanOrEqual(3);
    }
  });

  it('every boundary references valid turn indices', async () => {
    const seg = new HeuristicDialogueSegmenter();
    const turns: TurnSnapshot[] = [];
    for (let i = 0; i < 6; i++) {
      turns.push(turn(i, i % 2 === 0 ? ALICE : BOB, `t${i}`));
    }
    const out = await seg.segment(makeConversation(turns));
    for (const b of out) {
      expect(b.fromTurnIndex.value).toBeGreaterThanOrEqual(0);
      expect(b.toTurnIndex.value).toBeLessThan(turns.length);
      expect(b.fromTurnIndex.value).toBeLessThanOrEqual(b.toTurnIndex.value);
    }
  });
});
