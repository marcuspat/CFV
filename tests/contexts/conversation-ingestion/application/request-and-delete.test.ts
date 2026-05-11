import { IngestTextConversation } from '../../../../src/server/contexts/conversation-ingestion/application/use-cases/ingest-text-conversation';
import { RequestAnalysis } from '../../../../src/server/contexts/conversation-ingestion/application/use-cases/request-analysis';
import { DeleteConversation } from '../../../../src/server/contexts/conversation-ingestion/application/use-cases/delete-conversation';
import {
  CapturingDomainEventPublisher,
  CountingIdGenerator,
  FixedClock,
  InMemoryAnalysisSessionRepository,
  InMemoryConversationRepository,
} from '../../../../src/server/contexts/conversation-ingestion/infrastructure/in-memory';

const TENANT = '01HJK3R6X7Y8ZAB2C3D4E5F6T0';
const USER = '01HJK3R6X7Y8ZAB2C3D4E5F6Y0';
const SPEAKER = '01HJK3R6X7Y8ZAB2C3D4E5F6A0';
const NOW = new Date('2026-01-01T00:00:00Z');

async function setup() {
  const conversations = new InMemoryConversationRepository();
  const sessions = new InMemoryAnalysisSessionRepository();
  const ids = new CountingIdGenerator();
  const clock = new FixedClock(NOW);
  const publisher = new CapturingDomainEventPublisher();

  const ingest = new IngestTextConversation({ conversations, ids, clock, publisher });
  const requestAnalysis = new RequestAnalysis({
    conversations,
    sessions,
    ids,
    clock,
    publisher,
  });
  const deleteConversation = new DeleteConversation({ conversations, publisher });

  const ingested = await ingest.execute({
    tenantId: TENANT,
    title: 'kickoff',
    sourceModality: 'TEXT',
    turns: [{ speakerId: SPEAKER, text: 'hi', timestamp: NOW.toISOString() }],
  });
  if (!ingested.ok) throw new Error('ingest failed');
  publisher.events.length = 0;
  return { requestAnalysis, deleteConversation, publisher, conversationId: ingested.value.conversationId };
}

describe('RequestAnalysis', () => {
  it('emits AnalysisRequested on first call', async () => {
    const { requestAnalysis, publisher, conversationId } = await setup();
    const r = await requestAnalysis.execute({
      tenantId: TENANT,
      conversationId,
      userId: USER,
      bundleVersion: '1.0.0',
      parameters: { temperature: 0.7 },
    });
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.value.idempotent).toBe(false);
    expect(publisher.events.map((e) => e.type)).toEqual(['AnalysisRequested']);
  });

  it('is idempotent on repeat with the same parameters', async () => {
    const { requestAnalysis, publisher, conversationId } = await setup();
    const first = await requestAnalysis.execute({
      tenantId: TENANT,
      conversationId,
      userId: USER,
      bundleVersion: '1.0.0',
      parameters: { a: 1, b: 2 },
    });
    if (!first.ok) throw new Error('first failed');
    publisher.events.length = 0;

    // Re-order keys to confirm the hash is order-insensitive.
    const second = await requestAnalysis.execute({
      tenantId: TENANT,
      conversationId,
      userId: USER,
      bundleVersion: '1.0.0',
      parameters: { b: 2, a: 1 },
    });
    expect(second.ok).toBe(true);
    expect(second.ok === true && second.value.idempotent).toBe(true);
    if (second.ok) expect(second.value.sessionId).toBe(first.value.sessionId);
    expect(publisher.events).toHaveLength(0); // no duplicate event
  });

  it('rejects an invalid bundleVersion', async () => {
    const { requestAnalysis, conversationId } = await setup();
    const r = await requestAnalysis.execute({
      tenantId: TENANT,
      conversationId,
      userId: USER,
      bundleVersion: 'not-a-semver',
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });
});

describe('DeleteConversation', () => {
  it('soft-deletes and emits ConversationDeleted', async () => {
    const { deleteConversation, publisher, conversationId } = await setup();
    const r = await deleteConversation.execute({
      tenantId: TENANT,
      conversationId,
      reason: 'user request',
    });
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.value.idempotent).toBe(false);
    expect(publisher.events.map((e) => e.type)).toEqual(['ConversationDeleted']);
  });

  it('is idempotent on second delete', async () => {
    const { deleteConversation, publisher, conversationId } = await setup();
    await deleteConversation.execute({ tenantId: TENANT, conversationId, reason: 'first' });
    publisher.events.length = 0;
    const r2 = await deleteConversation.execute({
      tenantId: TENANT,
      conversationId,
      reason: 'second',
    });
    expect(r2.ok).toBe(true);
    expect(r2.ok === true && r2.value.idempotent).toBe(true);
    expect(publisher.events).toHaveLength(0);
  });

  it('requires a reason', async () => {
    const { deleteConversation, conversationId } = await setup();
    const r = await deleteConversation.execute({
      tenantId: TENANT,
      conversationId,
      reason: '   ',
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });
});
