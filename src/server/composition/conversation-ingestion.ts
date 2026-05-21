/**
 * Composition root for the Conversation Ingestion context.
 *
 * Wires the ingest/delete use cases to PostgreSQL repositories + the
 * transactional outbox, and exposes the conversation repository for reads
 * (queries bypass the write-side use cases). Relies on the shared pool
 * being configured (see shared/db/pool.ts); pass a pool to configure it.
 */

import { Pool } from 'pg';
import { configurePool, getPool, withTransaction } from '../shared/db/pool';
import { PostgresOutboxStore } from '../shared/outbox/postgres';
import { OutboxDomainEventPublisher } from '../shared/outbox/domain-event-publisher';
import type { EnvelopeContext } from '../shared/outbox/envelope';
import { PostgresConversationRepository } from '../contexts/conversation-ingestion/infrastructure/postgres';
import { IngestTextConversation } from '../contexts/conversation-ingestion/application/use-cases/ingest-text-conversation';
import { DeleteConversation } from '../contexts/conversation-ingestion/application/use-cases/delete-conversation';
import { UlidIdGenerator, SystemClock } from '../contexts/identity/infrastructure/production';
import { DEFAULT_TENANT_ID } from './identity';

export interface ConversationModule {
  readonly conversations: PostgresConversationRepository;
  readonly ingestText: IngestTextConversation['execute'];
  readonly deleteConversation: DeleteConversation['execute'];
}

export function buildConversationModule(opts: { pool?: Pool } = {}): ConversationModule {
  if (opts.pool) configurePool(opts.pool);
  else getPool(); // assert a pool is configured

  const conversations = new PostgresConversationRepository();
  const ids = new UlidIdGenerator();
  const clock = new SystemClock();
  const outbox = new PostgresOutboxStore();

  const publisher = new OutboxDomainEventPublisher({
    outbox,
    contextProvider: (): EnvelopeContext => ({
      tenantId: DEFAULT_TENANT_ID,
      actor: { type: 'SYSTEM', id: 'conversation-ingestion' },
      correlationId: ids.newId(),
      occurredAt: clock.now(),
      newEventId: () => ids.newId(),
    }),
  });

  const ingestUC = new IngestTextConversation({ conversations, ids, clock, publisher });
  const deleteUC = new DeleteConversation({ conversations, publisher });

  return {
    conversations,
    ingestText: (input) => withTransaction(() => ingestUC.execute(input)),
    deleteConversation: (input) => withTransaction(() => deleteUC.execute(input)),
  };
}
