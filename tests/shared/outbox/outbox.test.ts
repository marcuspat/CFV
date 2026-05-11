import {
  InMemoryOutboxStore,
  OutboxDomainEventPublisher,
  wrapEvent,
  type EnvelopeContext,
} from '../../../src/server/shared/outbox';

const TENANT = '01HJK3R6X7Y8ZAB2C3D4E5F6T0';
const ACTOR_ID = '01HJK3R6X7Y8ZAB2C3D4E5F6Y0';
const CORR_ID = '01HJK3R6X7Y8ZAB2C3D4E5F6Z0';
const NOW = new Date('2026-01-01T00:00:00Z');

let counter = 0;
function newId(): string {
  counter += 1;
  const stem = counter.toString(32).toUpperCase().replace(/I|L|O|U/g, '0');
  return stem.padStart(26, '0');
}

const ctx: EnvelopeContext = {
  tenantId: TENANT,
  actor: { type: 'SYSTEM', id: ACTOR_ID },
  correlationId: CORR_ID,
  occurredAt: NOW,
  newEventId: newId,
};

beforeEach(() => {
  counter = 0;
});

describe('wrapEvent', () => {
  it('lifts a raw event onto the canonical envelope', () => {
    const env = wrapEvent(
      { type: 'UserRegistered', schemaVersion: 1, payload: { foo: 'bar' } },
      ctx,
    );
    expect(env.eventType).toBe('UserRegistered');
    expect(env.schemaVersion).toBe(1);
    expect(env.occurredAt).toBe(NOW.toISOString());
    expect(env.tenantId).toBe(TENANT);
    expect(env.actor.id).toBe(ACTOR_ID);
    expect(env.correlationId).toBe(CORR_ID);
    expect(env.payload).toEqual({ foo: 'bar' });
    expect(typeof env.eventId).toBe('string');
  });

  it('omits causationId unless supplied', () => {
    const env = wrapEvent(
      { type: 'X', schemaVersion: 1, payload: {} },
      ctx,
    );
    expect('causationId' in env).toBe(false);
  });

  it('preserves causationId when supplied', () => {
    const env = wrapEvent(
      { type: 'X', schemaVersion: 1, payload: {} },
      { ...ctx, causationId: '01HJK3R6X7Y8ZAB2C3D4E5F6W0' },
    );
    expect(env.causationId).toBe('01HJK3R6X7Y8ZAB2C3D4E5F6W0');
  });
});

describe('InMemoryOutboxStore', () => {
  it('appends envelopes and exposes them via readUnpublished in order', async () => {
    const store = new InMemoryOutboxStore();
    const envA = wrapEvent({ type: 'A', schemaVersion: 1, payload: { i: 1 } }, ctx);
    const envB = wrapEvent({ type: 'B', schemaVersion: 1, payload: { i: 2 } }, ctx);
    await store.append([envA, envB]);
    expect(store.size()).toBe(2);
    const unpub = await store.readUnpublished(10);
    expect(unpub.map((e) => e.eventType)).toEqual(['A', 'B']);
  });

  it('is idempotent on duplicate eventId', async () => {
    const store = new InMemoryOutboxStore();
    const env = wrapEvent({ type: 'A', schemaVersion: 1, payload: {} }, ctx);
    await store.append([env, env]);
    expect(store.size()).toBe(1);
  });

  it('markPublished hides rows from subsequent reads', async () => {
    const store = new InMemoryOutboxStore();
    const env = wrapEvent({ type: 'A', schemaVersion: 1, payload: {} }, ctx);
    await store.append([env]);
    await store.markPublished([env.eventId]);
    const unpub = await store.readUnpublished(10);
    expect(unpub).toHaveLength(0);
  });
});

describe('OutboxDomainEventPublisher', () => {
  it('wraps events with the provided envelope context and appends to the store', async () => {
    const store = new InMemoryOutboxStore();
    const publisher = new OutboxDomainEventPublisher({
      outbox: store,
      contextProvider: () => ctx,
    });
    await publisher.publish([
      { type: 'UserRegistered', schemaVersion: 1, payload: { x: 1 } },
      { type: 'UserDisabled', schemaVersion: 1, payload: { y: 2 } },
    ]);
    expect(store.all().map((e) => e.eventType)).toEqual([
      'UserRegistered',
      'UserDisabled',
    ]);
    for (const env of store.all()) {
      expect(env.tenantId).toBe(TENANT);
      expect(env.correlationId).toBe(CORR_ID);
    }
  });

  it('is a no-op on empty input', async () => {
    const store = new InMemoryOutboxStore();
    const publisher = new OutboxDomainEventPublisher({
      outbox: store,
      contextProvider: () => {
        throw new Error('contextProvider should not be called');
      },
    });
    await publisher.publish([]);
    expect(store.size()).toBe(0);
  });
});
