/**
 * SegmentConversation use case.
 *
 * Calls the primary DialogueSegmenter; on UpstreamUnavailable falls back
 * to a heuristic adapter (ADR-0014). Applies the resulting segment set
 * to the aggregate and emits ConversationSegmented.
 */

import {
  ConversationId,
  TenantId,
} from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type ConversationRepository,
  type DialogueSegmenter,
  type DomainEventPublisher,
} from '../ports';

export interface SegmentConversationInput {
  readonly tenantId: string;
  readonly conversationId: string;
}

export interface SegmentConversationDeps {
  readonly conversations: ConversationRepository;
  readonly primarySegmenter: DialogueSegmenter;
  readonly fallbackSegmenter: DialogueSegmenter;
  readonly publisher: DomainEventPublisher;
}

export class UpstreamUnavailable extends Error {
  constructor(public readonly upstream: string) {
    super(`Upstream unavailable: ${upstream}`);
    this.name = 'UpstreamUnavailable';
  }
}

export class SegmentConversation {
  constructor(private readonly deps: SegmentConversationDeps) {}

  async execute(
    input: SegmentConversationInput,
  ): Promise<Result<{ segmentCount: number; source: 'RASA' | 'FALLBACK' }, ApplicationError>> {
    let tenantId: TenantId;
    let conversationId: ConversationId;
    try {
      tenantId = TenantId.of(input.tenantId);
      conversationId = ConversationId.of(input.conversationId);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'identifier', reason: 'invalid' });
    }

    const conversation = await this.deps.conversations.findById(conversationId, tenantId);
    if (!conversation) return Result.err({ kind: 'NotFound', resource: 'conversation' });
    if (conversation.isDeleted) return Result.err({ kind: 'NotFound', resource: 'conversation' });

    let boundaries;
    let source: 'RASA' | 'FALLBACK';
    try {
      boundaries = await this.deps.primarySegmenter.segment(conversation);
      source = this.deps.primarySegmenter.source;
    } catch (e) {
      if (!(e instanceof UpstreamUnavailable)) throw e;
      boundaries = await this.deps.fallbackSegmenter.segment(conversation);
      source = this.deps.fallbackSegmenter.source;
    }

    const previousVersion = conversation.version;
    try {
      conversation.applySegments({ boundaries, source });
    } catch (e) {
      return Result.err({
        kind: 'PreconditionFailed',
        reason: (e as Error).message,
      });
    }
    await this.deps.conversations.save(conversation, previousVersion);
    await this.deps.publisher.publish(conversation.pullEvents());
    return Result.ok({ segmentCount: boundaries.length, source });
  }
}
