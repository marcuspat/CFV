/**
 * OutboxDomainEventPublisher
 *
 * Generic adapter that satisfies the per-context `DomainEventPublisher`
 * port shape (any aggregate's events can be lifted onto the envelope and
 * appended to the outbox). Application services pass this adapter in
 * place of context-specific publishers.
 */

import { wrapEvent, type EnvelopeContext, type RawDomainEvent } from './envelope';
import type { OutboxStore } from './port';

export interface OutboxDomainEventPublisherDeps {
  readonly outbox: OutboxStore;
  /** Returns the envelope context for the current request/use case. */
  readonly contextProvider: () => EnvelopeContext;
}

export class OutboxDomainEventPublisher {
  constructor(private readonly deps: OutboxDomainEventPublisherDeps) {}

  async publish(events: ReadonlyArray<RawDomainEvent>): Promise<void> {
    if (events.length === 0) return;
    const ctx = this.deps.contextProvider();
    const envelopes = events.map((e) => wrapEvent(e, ctx));
    await this.deps.outbox.append(envelopes);
  }
}
