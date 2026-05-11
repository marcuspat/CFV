/**
 * In-memory adapters for Conversation Ingestion ports.
 *
 * Same shape as the Identity context's in-memory pack: optimistic
 * concurrency checks, tenant-isolated reads, and structural-clone
 * semantics on save/load.
 */

import { AnalysisSession } from '../domain/analysis-session';
import { Conversation } from '../domain/conversation';
import type {
  ConversationId,
  SessionId,
  TenantId,
} from '../domain/value-objects';
import type {
  AnalysisSessionRepository,
  Clock,
  ConversationRepository,
  DomainEventPublisher,
  IdGenerator,
} from '../application/ports';
import type { ConversationIngestionEvent } from '../domain/events';

export class AggregateVersionConflict extends Error {
  constructor(public readonly aggregate: string, public readonly id: string) {
    super(`Optimistic-lock conflict on ${aggregate} ${id}`);
    this.name = 'AggregateVersionConflict';
  }
}

// ---------------------------------------------------------------------------
// ConversationRepository
// ---------------------------------------------------------------------------

export class InMemoryConversationRepository implements ConversationRepository {
  private readonly byId = new Map<string, ReturnType<Conversation['snapshot']>>();
  private readonly byTenant = new Map<string, string[]>();

  async findById(id: ConversationId, tenantId: TenantId): Promise<Conversation | null> {
    const snap = this.byId.get(id);
    if (!snap || snap.tenantId !== tenantId) return null;
    return Conversation.rehydrate(snap);
  }

  async save(conversation: Conversation, expectedVersion: number): Promise<void> {
    const existing = this.byId.get(conversation.id);
    if (existing) {
      if (existing.version !== expectedVersion) {
        throw new AggregateVersionConflict('Conversation', conversation.id);
      }
    } else if (expectedVersion !== 0) {
      throw new AggregateVersionConflict('Conversation', conversation.id);
    }
    const snap = conversation.snapshot();
    this.byId.set(snap.id, snap);
    const list = this.byTenant.get(snap.tenantId) ?? [];
    if (!list.includes(snap.id)) {
      list.push(snap.id);
      this.byTenant.set(snap.tenantId, list);
    }
  }

  async listForTenant(
    tenantId: TenantId,
    page: { offset: number; limit: number },
  ): Promise<ReadonlyArray<Conversation>> {
    const ids = this.byTenant.get(tenantId) ?? [];
    const slice = ids.slice(page.offset, page.offset + page.limit);
    return slice
      .map((id) => this.byId.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((snap) => Conversation.rehydrate(snap));
  }

  size(): number {
    return this.byId.size;
  }
}

// ---------------------------------------------------------------------------
// AnalysisSessionRepository
// ---------------------------------------------------------------------------

export class InMemoryAnalysisSessionRepository implements AnalysisSessionRepository {
  private readonly byId = new Map<string, ReturnType<AnalysisSession['snapshot']>>();
  private readonly idempotentKey = new Map<string, string>(); // hashKey -> sessionId

  async findById(id: SessionId, tenantId: TenantId): Promise<AnalysisSession | null> {
    const snap = this.byId.get(id);
    if (!snap || snap.tenantId !== tenantId) return null;
    return AnalysisSession.rehydrate(snap);
  }

  async findIdempotent(
    tenantId: TenantId,
    conversationId: ConversationId,
    parameterHash: string,
  ): Promise<AnalysisSession | null> {
    const key = `${tenantId}::${conversationId}::${parameterHash}`;
    const sessionId = this.idempotentKey.get(key);
    if (!sessionId) return null;
    const snap = this.byId.get(sessionId);
    return snap ? AnalysisSession.rehydrate(snap) : null;
  }

  async save(
    session: AnalysisSession,
    expectedVersion: number,
    parameterHash: string,
  ): Promise<void> {
    const existing = this.byId.get(session.id);
    if (existing) {
      if (existing.version !== expectedVersion) {
        throw new AggregateVersionConflict('AnalysisSession', session.id);
      }
    } else if (expectedVersion !== 0) {
      throw new AggregateVersionConflict('AnalysisSession', session.id);
    }
    const snap = session.snapshot();
    this.byId.set(snap.id, snap);
    const key = `${snap.tenantId}::${snap.conversationId}::${parameterHash}`;
    this.idempotentKey.set(key, snap.id);
  }
}

// ---------------------------------------------------------------------------
// Capturing publisher / test ID generator / clock
// ---------------------------------------------------------------------------

export class CapturingDomainEventPublisher implements DomainEventPublisher {
  readonly events: ConversationIngestionEvent[] = [];
  async publish(events: ReadonlyArray<ConversationIngestionEvent>): Promise<void> {
    for (const e of events) this.events.push(e);
  }
}

export class CountingIdGenerator implements IdGenerator {
  private counter = 0;
  newId(): string {
    this.counter += 1;
    const stem = this.counter.toString(32).toUpperCase().replace(/I|L|O|U/g, '0');
    return stem.padStart(26, '0');
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date { return new Date(this.current.getTime()); }
  advance(ms: number): void { this.current = new Date(this.current.getTime() + ms); }
}
