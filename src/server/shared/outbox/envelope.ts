/**
 * Canonical domain event envelope (matches docs/schemas/events/Envelope.v1.json).
 *
 * Every event flowing through the outbox is wrapped in this shape before
 * persistence. The shape is part of the published-language contract
 * (docs/ddd/08-domain-events.md); changing it is a major-version event.
 */

export type ActorType = 'USER' | 'SERVICE' | 'SYSTEM';

export interface EventActor {
  readonly type: ActorType;
  readonly id: string;
}

export interface EventEnvelope<P = unknown> {
  readonly eventId: string;
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly occurredAt: string;       // ISO-8601 string
  readonly tenantId: string;
  readonly actor: EventActor;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly payload: P;
}

/** The minimum shape a context's domain event must expose. */
export interface RawDomainEvent<P = unknown> {
  readonly type: string;
  readonly schemaVersion: number;
  readonly payload: P;
}

export interface EnvelopeContext {
  readonly tenantId: string;
  readonly actor: EventActor;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly occurredAt: Date;
  readonly newEventId: () => string;
}

/**
 * Lift a raw domain event onto the canonical envelope. Pure function —
 * no side effects.
 */
export function wrapEvent<P>(
  event: RawDomainEvent<P>,
  ctx: EnvelopeContext,
): EventEnvelope<P> {
  return {
    eventId: ctx.newEventId(),
    eventType: event.type,
    schemaVersion: event.schemaVersion,
    occurredAt: ctx.occurredAt.toISOString(),
    tenantId: ctx.tenantId,
    actor: ctx.actor,
    correlationId: ctx.correlationId,
    ...(ctx.causationId ? { causationId: ctx.causationId } : {}),
    payload: event.payload,
  };
}
