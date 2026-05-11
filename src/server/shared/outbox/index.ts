/**
 * Shared transactional outbox — public surface.
 */
export {
  type EventEnvelope,
  type EnvelopeContext,
  type EventActor,
  type ActorType,
  type RawDomainEvent,
  wrapEvent,
} from './envelope';
export type { OutboxStore, OutboxReader } from './port';
export { InMemoryOutboxStore } from './in-memory';
export {
  OutboxDomainEventPublisher,
  type OutboxDomainEventPublisherDeps,
} from './domain-event-publisher';
