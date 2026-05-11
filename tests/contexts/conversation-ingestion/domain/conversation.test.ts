import { Conversation, type TurnSnapshot } from '../../../../src/server/contexts/conversation-ingestion/domain/conversation';
import {
  ConversationId,
  SpeakerId,
  TenantId,
  TurnId,
  TurnIndex,
} from '../../../../src/server/contexts/conversation-ingestion/domain/value-objects';
import {
  ConversationFrozen,
  EmptyConversation,
  InvalidStatusTransition,
  SegmentBoundaryOutOfRange,
  TurnsMustBeMonotonic,
} from '../../../../src/server/contexts/conversation-ingestion/domain/errors';

const TENANT = TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T0');
const CONV = ConversationId.of('01HJK3R6X7Y8ZAB2C3D4E5F6C0');
const SPEAKER_A = SpeakerId.of('01HJK3R6X7Y8ZAB2C3D4E5F6A0');
const SPEAKER_B = SpeakerId.of('01HJK3R6X7Y8ZAB2C3D4E5F6B0');
const NOW = new Date('2026-01-01T00:00:00Z');

function turn(i: number, speakerId = SPEAKER_A, ts = NOW): TurnSnapshot {
  return {
    id: TurnId.of(`01HJK3R6X7Y8ZAB2C3D4E5F${i}T0`.padEnd(26, '0').slice(0, 26)),
    speakerId,
    text: `turn ${i}`,
    timestamp: new Date(ts.getTime() + i * 1000),
    turnIndex: TurnIndex.of(i),
  };
}

describe('Conversation aggregate', () => {
  it('rejects empty turn list', () => {
    expect(() =>
      Conversation.ingest({
        id: CONV,
        tenantId: TENANT,
        title: 'demo',
        sourceModality: 'TEXT',
        turns: [],
        now: NOW,
      }),
    ).toThrow(EmptyConversation);
  });

  it('emits ConversationIngested on ingest', () => {
    const conv = Conversation.ingest({
      id: CONV,
      tenantId: TENANT,
      title: 'demo',
      sourceModality: 'TEXT',
      turns: [turn(0), turn(1, SPEAKER_B)],
      now: NOW,
    });
    expect(conv.status).toBe('INGESTED');
    expect(conv.version).toBe(1);
    const events = conv.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('ConversationIngested');
    expect(events[0].payload.turnCount).toBe(2);
  });

  it('rejects non-monotonic turn timestamps', () => {
    const t0 = turn(0);
    const t1 = { ...turn(1), timestamp: new Date(NOW.getTime() - 1000) };
    expect(() =>
      Conversation.ingest({
        id: CONV,
        tenantId: TENANT,
        title: '',
        sourceModality: 'TEXT',
        turns: [t0, t1],
        now: NOW,
      }),
    ).toThrow(TurnsMustBeMonotonic);
  });

  it('is frozen after ingest', () => {
    const conv = Conversation.ingest({
      id: CONV,
      tenantId: TENANT,
      title: '',
      sourceModality: 'TEXT',
      turns: [turn(0)],
      now: NOW,
    });
    expect(conv.isFrozen).toBe(true);
    expect(() => conv.guardEditable()).toThrow(ConversationFrozen);
  });

  describe('applySegments', () => {
    it('emits ConversationSegmented and transitions to SEGMENTED', () => {
      const conv = Conversation.ingest({
        id: CONV,
        tenantId: TENANT,
        title: '',
        sourceModality: 'TEXT',
        turns: [turn(0), turn(1), turn(2)],
        now: NOW,
      });
      conv.pullEvents();
      conv.applySegments({
        boundaries: [
          { fromTurnIndex: TurnIndex.of(0), toTurnIndex: TurnIndex.of(1), source: 'FALLBACK' },
          { fromTurnIndex: TurnIndex.of(2), toTurnIndex: TurnIndex.of(2), source: 'FALLBACK' },
        ],
        source: 'FALLBACK',
      });
      expect(conv.status).toBe('SEGMENTED');
      expect(conv.version).toBe(2);
      const events = conv.pullEvents();
      expect(events.map((e) => e.type)).toEqual(['ConversationSegmented']);
      expect(events[0].payload.segmentCount).toBe(2);
      expect(events[0].payload.segmentationSource).toBe('FALLBACK');
    });

    it('rejects boundaries that exceed the highest turn index', () => {
      const conv = Conversation.ingest({
        id: CONV,
        tenantId: TENANT,
        title: '',
        sourceModality: 'TEXT',
        turns: [turn(0), turn(1)],
        now: NOW,
      });
      expect(() =>
        conv.applySegments({
          boundaries: [
            { fromTurnIndex: TurnIndex.of(0), toTurnIndex: TurnIndex.of(5), source: 'RASA' },
          ],
          source: 'RASA',
        }),
      ).toThrow(SegmentBoundaryOutOfRange);
    });

    it('refuses double segmentation', () => {
      const conv = Conversation.ingest({
        id: CONV,
        tenantId: TENANT,
        title: '',
        sourceModality: 'TEXT',
        turns: [turn(0), turn(1)],
        now: NOW,
      });
      conv.applySegments({
        boundaries: [
          { fromTurnIndex: TurnIndex.of(0), toTurnIndex: TurnIndex.of(1), source: 'FALLBACK' },
        ],
        source: 'FALLBACK',
      });
      expect(() =>
        conv.applySegments({
          boundaries: [
            { fromTurnIndex: TurnIndex.of(0), toTurnIndex: TurnIndex.of(1), source: 'FALLBACK' },
          ],
          source: 'FALLBACK',
        }),
      ).toThrow(InvalidStatusTransition);
    });
  });

  describe('softDelete', () => {
    it('emits ConversationDeleted and is idempotent', () => {
      const conv = Conversation.ingest({
        id: CONV,
        tenantId: TENANT,
        title: '',
        sourceModality: 'TEXT',
        turns: [turn(0)],
        now: NOW,
      });
      conv.pullEvents();
      conv.softDelete('user request');
      expect(conv.isDeleted).toBe(true);
      expect(conv.pullEvents().map((e) => e.type)).toEqual(['ConversationDeleted']);

      conv.softDelete('again');
      expect(conv.pullEvents()).toHaveLength(0); // idempotent
    });
  });
});
