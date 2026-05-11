/**
 * Microbenchmark — HeuristicDialogueSegmenter throughput.
 *
 * Establishes a baseline that future PRs can regress-check against.
 */

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
const A = SpeakerId.of('01HJK3R6X7Y8ZAB2C3D4E5F6A0');
const B = SpeakerId.of('01HJK3R6X7Y8ZAB2C3D4E5F6B0');
const NOW = new Date('2026-01-01T00:00:00Z');

function turn(i: number): TurnSnapshot {
  return {
    id: TurnId.of(`01HJK3R6X7Y8ZAB2C3D4E5F${i % 10}T0`.padEnd(26, '0').slice(0, 26)),
    speakerId: i % 2 === 0 ? A : B,
    text:
      i % 5 === 4
        ? `anyway, moving on, point ${i}`
        : `argument point number ${i} for the topic at hand`,
    timestamp: new Date(NOW.getTime() + i * 1000),
    turnIndex: TurnIndex.of(i),
  };
}

function benchmark(label: string, iterations: number, fn: () => void | Promise<void>): number {
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) void fn();
  const end = process.hrtime.bigint();
  const totalNs = Number(end - start);
  const perOp = totalNs / iterations;
  // eslint-disable-next-line no-console
  console.log(
    `[bench] ${label}: ${iterations.toLocaleString()} ops in ` +
      `${(totalNs / 1e6).toFixed(2)} ms — ${perOp.toFixed(0)} ns/op (` +
      `${Math.round(1e9 / perOp).toLocaleString()} ops/sec)`,
  );
  return perOp;
}

describe('conversation ingestion microbenchmarks', () => {
  it('HeuristicDialogueSegmenter throughput on a 60-turn conversation', async () => {
    const turns: TurnSnapshot[] = [];
    for (let i = 0; i < 60; i++) turns.push(turn(i));
    const conversation = Conversation.ingest({
      id: CONV,
      tenantId: TENANT,
      title: '',
      sourceModality: 'TEXT',
      turns,
      now: NOW,
    });
    const seg = new HeuristicDialogueSegmenter();
    // Warm-up
    for (let i = 0; i < 50; i++) await seg.segment(conversation);

    const start = process.hrtime.bigint();
    const iterations = 5_000;
    for (let i = 0; i < iterations; i++) {
      await seg.segment(conversation);
    }
    const end = process.hrtime.bigint();
    const perOp = Number(end - start) / iterations;
    // eslint-disable-next-line no-console
    console.log(
      `[bench] HeuristicDialogueSegmenter (60 turns): ${iterations.toLocaleString()} ops in ` +
        `${(Number(end - start) / 1e6).toFixed(2)} ms — ${perOp.toFixed(0)} ns/op (` +
        `${Math.round(1e9 / perOp).toLocaleString()} ops/sec)`,
    );
    // 60-turn segmentation should comfortably beat 1 ms per call on any
    // modern machine; use a loose 5 ms ceiling to avoid flaky CI.
    expect(perOp).toBeLessThan(5_000_000);
  });

  it('Conversation.ingest construction is sane', () => {
    const turns: TurnSnapshot[] = [];
    for (let i = 0; i < 20; i++) turns.push(turn(i));
    const perOp = benchmark('Conversation.ingest (20 turns)', 5_000, () => {
      const conv = Conversation.ingest({
        id: CONV,
        tenantId: TENANT,
        title: '',
        sourceModality: 'TEXT',
        turns,
        now: NOW,
      });
      conv.pullEvents();
    });
    expect(perOp).toBeLessThan(2_000_000);
  });
});
