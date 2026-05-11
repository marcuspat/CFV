/**
 * IngestTextConversation use case.
 *
 * Builds a Conversation aggregate from a raw text payload and persists
 * it (single-aggregate transaction). Emits ConversationIngested.
 */

import { Conversation, type TurnSnapshot } from '../../domain/conversation';
import {
  ConversationId,
  SourceModality,
  SpeakerId,
  TenantId,
  TurnId,
  TurnIndex,
  isSourceModality,
} from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type Clock,
  type ConversationRepository,
  type DomainEventPublisher,
  type IdGenerator,
} from '../ports';

export interface IngestTextConversationInput {
  readonly tenantId: string;
  readonly title?: string;
  readonly sourceModality?: string; // defaults to TEXT
  readonly turns: ReadonlyArray<{
    readonly speakerId: string;
    readonly text: string;
    readonly timestamp: string; // ISO-8601
  }>;
}

export interface IngestTextConversationDeps {
  readonly conversations: ConversationRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
}

export class IngestTextConversation {
  constructor(private readonly deps: IngestTextConversationDeps) {}

  async execute(
    input: IngestTextConversationInput,
  ): Promise<Result<{ conversationId: string }, ApplicationError>> {
    let tenantId: TenantId;
    try {
      tenantId = TenantId.of(input.tenantId);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'tenantId', reason: 'invalid identifier' });
    }

    const modalityRaw = input.sourceModality ?? 'TEXT';
    if (!isSourceModality(modalityRaw)) {
      return Result.err({
        kind: 'InputInvalid',
        field: 'sourceModality',
        reason: `unknown modality: ${modalityRaw}`,
      });
    }
    const modality: SourceModality = modalityRaw;

    if (!Array.isArray(input.turns) || input.turns.length === 0) {
      return Result.err({
        kind: 'InputInvalid',
        field: 'turns',
        reason: 'at least one turn is required',
      });
    }

    const turnSnapshots: TurnSnapshot[] = [];
    for (let i = 0; i < input.turns.length; i++) {
      const raw = input.turns[i];
      if (!raw.text || typeof raw.text !== 'string') {
        return Result.err({
          kind: 'InputInvalid',
          field: `turns[${i}].text`,
          reason: 'text is required and must be a string',
        });
      }
      const timestamp = new Date(raw.timestamp);
      if (Number.isNaN(timestamp.getTime())) {
        return Result.err({
          kind: 'InputInvalid',
          field: `turns[${i}].timestamp`,
          reason: 'invalid ISO-8601 timestamp',
        });
      }
      let speakerId: SpeakerId;
      try {
        speakerId = SpeakerId.of(raw.speakerId);
      } catch {
        return Result.err({
          kind: 'InputInvalid',
          field: `turns[${i}].speakerId`,
          reason: 'invalid speakerId',
        });
      }
      turnSnapshots.push({
        id: TurnId.of(this.deps.ids.newId()),
        speakerId,
        text: raw.text,
        timestamp,
        turnIndex: TurnIndex.of(i),
      });
    }

    const conversationId = ConversationId.of(this.deps.ids.newId());
    let conversation: Conversation;
    try {
      conversation = Conversation.ingest({
        id: conversationId,
        tenantId,
        title: input.title ?? '',
        sourceModality: modality,
        turns: turnSnapshots,
        now: this.deps.clock.now(),
      });
    } catch (e) {
      return Result.err({
        kind: 'PreconditionFailed',
        reason: (e as Error).message,
      });
    }

    await this.deps.conversations.save(conversation, 0);
    await this.deps.publisher.publish(conversation.pullEvents());
    return Result.ok({ conversationId });
  }
}
