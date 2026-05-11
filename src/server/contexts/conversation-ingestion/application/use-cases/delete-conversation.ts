/**
 * DeleteConversation use case (soft delete).
 *
 * Marks the conversation DELETED and emits ConversationDeleted. The
 * actual cascade into Cognitive Graph / Visualization happens via
 * downstream event consumers in those contexts.
 */

import { ConversationId, TenantId } from '../../domain/value-objects';
import {
  Result,
  type ApplicationError,
  type ConversationRepository,
  type DomainEventPublisher,
} from '../ports';

export interface DeleteConversationInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly reason: string;
}

export interface DeleteConversationDeps {
  readonly conversations: ConversationRepository;
  readonly publisher: DomainEventPublisher;
}

export class DeleteConversation {
  constructor(private readonly deps: DeleteConversationDeps) {}

  async execute(
    input: DeleteConversationInput,
  ): Promise<Result<{ idempotent: boolean }, ApplicationError>> {
    let tenantId: TenantId;
    let conversationId: ConversationId;
    try {
      tenantId = TenantId.of(input.tenantId);
      conversationId = ConversationId.of(input.conversationId);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'identifier', reason: 'invalid' });
    }
    if (!input.reason?.trim()) {
      return Result.err({ kind: 'InputInvalid', field: 'reason', reason: 'required' });
    }
    const conv = await this.deps.conversations.findById(conversationId, tenantId);
    if (!conv) return Result.err({ kind: 'NotFound', resource: 'conversation' });

    if (conv.isDeleted) {
      return Result.ok({ idempotent: true });
    }
    const previousVersion = conv.version;
    conv.softDelete(input.reason);
    await this.deps.conversations.save(conv, previousVersion);
    await this.deps.publisher.publish(conv.pullEvents());
    return Result.ok({ idempotent: false });
  }
}
