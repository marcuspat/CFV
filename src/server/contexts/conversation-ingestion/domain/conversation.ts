/**
 * Conversation aggregate.
 *
 * See docs/ddd/06-aggregates-and-entities.md § "Conversation".
 *
 * Root: Conversation. Children: Turn entities (modelled as plain value
 * holders since they have no behaviour beyond identity + ordering).
 *
 * Invariants enforced here:
 *   1. Status transitions follow RECEIVED -> INGESTED -> SEGMENTED;
 *      DELETED is reachable from any non-DELETED state.
 *   2. Once INGESTED or later, Turns are immutable. Edits require a new
 *      Conversation linked via `derivedFromConversationId`.
 *   3. Turns are total-ordered by (timestamp, turnIndex). Out-of-order
 *      input is rejected.
 *   4. A Conversation must have at least one Turn at ingest time.
 *   5. Segment boundaries must reference Turn indices that exist.
 */

import {
  ConversationDeleted as ConversationDeletedErr,
  ConversationFrozen,
  EmptyConversation,
  InvalidStatusTransition,
  SegmentBoundaryOutOfRange,
  TurnsMustBeMonotonic,
} from './errors';
import type {
  ConversationDeleted,
  ConversationIngested,
  ConversationIngestionEvent,
  ConversationSegmented,
} from './events';
import type {
  ConversationId,
  ConversationStatus,
  SegmentBoundary,
  SourceModality,
  SpeakerId,
  TenantId,
  TurnId,
  TurnIndex,
} from './value-objects';

export interface TurnSnapshot {
  readonly id: TurnId;
  readonly speakerId: SpeakerId;
  readonly text: string;
  readonly timestamp: Date;
  readonly turnIndex: TurnIndex;
}

interface ConversationState {
  readonly id: ConversationId;
  readonly tenantId: TenantId;
  readonly title: string;
  readonly sourceModality: SourceModality;
  readonly status: ConversationStatus;
  readonly createdAt: Date;
  readonly derivedFromConversationId: ConversationId | null;
  readonly turns: ReadonlyArray<TurnSnapshot>;
  readonly segments: ReadonlyArray<SegmentBoundary>;
  readonly version: number;
}

export class Conversation {
  public get id(): ConversationId { return this.state.id; }
  public get tenantId(): TenantId { return this.state.tenantId; }
  public get sourceModality(): SourceModality { return this.state.sourceModality; }
  public get status(): ConversationStatus { return this.state.status; }
  public get version(): number { return this.state.version; }
  public get turns(): ReadonlyArray<TurnSnapshot> { return this.state.turns; }
  public get segments(): ReadonlyArray<SegmentBoundary> { return this.state.segments; }
  public get isFrozen(): boolean {
    return this.state.status === 'INGESTED' || this.state.status === 'SEGMENTED';
  }
  public get isDeleted(): boolean {
    return this.state.status === 'DELETED';
  }

  private readonly pending: ConversationIngestionEvent[] = [];

  private constructor(private state: ConversationState) {}

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  /**
   * Ingest a fresh conversation from a sequence of turns. The aggregate
   * is created in INGESTED state because for the text path there is no
   * meaningful "pending bytes" stage; multimodal inputs flow through
   * Multimodal Ingestion first and arrive here as a complete Conversation.
   */
  static ingest(args: {
    id: ConversationId;
    tenantId: TenantId;
    title: string;
    sourceModality: SourceModality;
    turns: ReadonlyArray<TurnSnapshot>;
    now: Date;
    derivedFromConversationId?: ConversationId;
  }): Conversation {
    if (args.turns.length === 0) {
      throw new EmptyConversation();
    }
    Conversation.assertMonotonic(args.turns);

    const conv = new Conversation({
      id: args.id,
      tenantId: args.tenantId,
      title: args.title.trim() || 'Untitled conversation',
      sourceModality: args.sourceModality,
      status: 'INGESTED',
      createdAt: args.now,
      derivedFromConversationId: args.derivedFromConversationId ?? null,
      turns: [...args.turns],
      segments: [],
      version: 1,
    });
    const ingested: ConversationIngested = {
      type: 'ConversationIngested',
      schemaVersion: 1,
      payload: {
        conversationId: args.id,
        tenantId: args.tenantId,
        sourceModality: args.sourceModality,
        turnCount: args.turns.length,
        ...(args.derivedFromConversationId
          ? { derivedFromConversationId: args.derivedFromConversationId }
          : {}),
      },
    };
    conv.pending.push(ingested);
    return conv;
  }

  static rehydrate(state: ConversationState): Conversation {
    return new Conversation(state);
  }

  // -------------------------------------------------------------------------
  // Behaviour
  // -------------------------------------------------------------------------

  applySegments(args: {
    boundaries: ReadonlyArray<SegmentBoundary>;
    source: 'RASA' | 'FALLBACK';
  }): void {
    this.guardNotDeleted();
    if (this.state.status === 'SEGMENTED') {
      throw new InvalidStatusTransition(this.state.status, 'SEGMENTED');
    }
    if (this.state.status !== 'INGESTED') {
      throw new InvalidStatusTransition(this.state.status, 'SEGMENTED');
    }

    const lastIndex = this.state.turns[this.state.turns.length - 1].turnIndex.value;
    for (const b of args.boundaries) {
      if (b.fromTurnIndex.value > b.toTurnIndex.value) {
        throw new SegmentBoundaryOutOfRange(b.fromTurnIndex.value);
      }
      if (b.toTurnIndex.value > lastIndex) {
        throw new SegmentBoundaryOutOfRange(b.toTurnIndex.value);
      }
    }
    this.state = {
      ...this.state,
      segments: [...args.boundaries],
      status: 'SEGMENTED',
      version: this.state.version + 1,
    };
    const event: ConversationSegmented = {
      type: 'ConversationSegmented',
      schemaVersion: 1,
      payload: {
        conversationId: this.state.id,
        segmentCount: args.boundaries.length,
        segmentationSource: args.source,
      },
    };
    this.pending.push(event);
  }

  softDelete(reason: string): void {
    if (this.state.status === 'DELETED') return; // idempotent
    this.state = {
      ...this.state,
      status: 'DELETED',
      version: this.state.version + 1,
    };
    const event: ConversationDeleted = {
      type: 'ConversationDeleted',
      schemaVersion: 1,
      payload: {
        conversationId: this.state.id,
        reason: reason.trim() || 'unspecified',
      },
    };
    this.pending.push(event);
  }

  pullEvents(): ReadonlyArray<ConversationIngestionEvent> {
    const drained = this.pending.slice();
    this.pending.length = 0;
    return drained;
  }

  snapshot(): ConversationState {
    return this.state;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private guardNotDeleted(): void {
    if (this.state.status === 'DELETED') {
      throw new ConversationDeletedErr(this.state.id);
    }
  }

  /** Visible mostly to tests / future use cases. */
  guardEditable(): void {
    this.guardNotDeleted();
    if (this.isFrozen) {
      throw new ConversationFrozen(this.state.id);
    }
  }

  private static assertMonotonic(turns: ReadonlyArray<TurnSnapshot>): void {
    for (let i = 1; i < turns.length; i++) {
      const prev = turns[i - 1];
      const curr = turns[i];
      const prevKey = prev.timestamp.getTime();
      const currKey = curr.timestamp.getTime();
      if (currKey < prevKey) throw new TurnsMustBeMonotonic();
      if (currKey === prevKey && curr.turnIndex.value <= prev.turnIndex.value) {
        throw new TurnsMustBeMonotonic();
      }
    }
  }
}
