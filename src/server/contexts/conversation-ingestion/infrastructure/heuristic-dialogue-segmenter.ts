/**
 * HeuristicDialogueSegmenter — fallback adapter for ADR-0014.
 *
 * Used when the primary Rasa segmenter is unavailable. The heuristic
 * splits on:
 *   1. Speaker changes (boundary between consecutive turns by different
 *      speakers, when window has exceeded the minimum segment length).
 *   2. Topic-shift markers (questions, "anyway", "moving on", "next").
 *   3. A maximum segment length so very long conversations are still
 *      segmented even if no boundary marker fires.
 *
 * Output is deterministic and source-tagged "FALLBACK" so downstream
 * consumers know the segmentation may be coarse.
 */

import type { Conversation } from '../domain/conversation';
import type { DialogueSegmenter } from '../application/ports';
import {
  TurnIndex,
  type SegmentBoundary,
} from '../domain/value-objects';

export interface HeuristicConfig {
  /** Minimum turn count per segment. */
  readonly minSegmentSize: number;
  /** Maximum turn count per segment. */
  readonly maxSegmentSize: number;
  /** Phrases (lowercased) whose presence in a turn forces a boundary. */
  readonly topicShiftMarkers: ReadonlyArray<string>;
}

const DEFAULT_CONFIG: HeuristicConfig = {
  minSegmentSize: 2,
  maxSegmentSize: 12,
  topicShiftMarkers: [
    'anyway',
    'moving on',
    "let's move on",
    'next topic',
    'changing the subject',
    'on another note',
  ],
};

export class HeuristicDialogueSegmenter implements DialogueSegmenter {
  readonly source = 'FALLBACK' as const;

  constructor(private readonly config: HeuristicConfig = DEFAULT_CONFIG) {}

  async segment(conversation: Conversation): Promise<ReadonlyArray<SegmentBoundary>> {
    const turns = conversation.turns;
    if (turns.length === 0) return [];

    const { minSegmentSize, maxSegmentSize, topicShiftMarkers } = this.config;
    const boundaries: SegmentBoundary[] = [];

    let segmentStart = 0;
    let lastSpeaker = turns[0].speakerId;

    for (let i = 1; i < turns.length; i++) {
      const segmentLength = i - segmentStart;
      const turn = turns[i];
      const speakerChanged = turn.speakerId !== lastSpeaker;
      const text = turn.text.toLowerCase();
      const topicShift = topicShiftMarkers.some((m) => text.includes(m));
      const tooLong = segmentLength >= maxSegmentSize;

      const shouldSplit =
        (segmentLength >= minSegmentSize && (speakerChanged || topicShift)) ||
        tooLong;

      if (shouldSplit) {
        boundaries.push({
          fromTurnIndex: turns[segmentStart].turnIndex,
          toTurnIndex: turns[i - 1].turnIndex,
          source: 'FALLBACK',
          ...(topicShift ? { intent: 'topic_shift' } : {}),
        });
        segmentStart = i;
      }
      lastSpeaker = turn.speakerId;
    }

    // Final trailing segment.
    boundaries.push({
      fromTurnIndex: turns[segmentStart].turnIndex,
      toTurnIndex: turns[turns.length - 1].turnIndex,
      source: 'FALLBACK',
    });

    return boundaries;
  }

  /** Test helper to construct with a TurnIndex (no-op type re-export). */
  static turnIndex(n: number): TurnIndex {
    return TurnIndex.of(n);
  }
}
