/**
 * AnalysisSession aggregate.
 *
 * docs/ddd/06-aggregates-and-entities.md § "AnalysisSession".
 *
 * A session is a user-facing handle to one or more Analyses on the same
 * Conversation. The Cognitive Analysis context (Phase 4) owns the
 * `Analysis` aggregate; the session here is just the request entrypoint.
 *
 * Invariant: identical (conversationId, parameterHash) requests return
 * the same analysis target (idempotency at the request level). The
 * application service enforces this by checking the session repository
 * before issuing the AnalysisRequested event.
 */

import type { AnalysisRequested } from './events';
import type {
  ConversationId,
  SessionId,
  TenantId,
  UserId,
} from './value-objects';

export type SessionStatus = 'OPEN' | 'ANALYSIS_REQUESTED' | 'CLOSED';

interface AnalysisSessionState {
  readonly id: SessionId;
  readonly tenantId: TenantId;
  readonly conversationId: ConversationId;
  readonly userId: UserId;
  readonly parameters: Record<string, unknown>;
  readonly status: SessionStatus;
  readonly createdAt: Date;
  readonly version: number;
}

export class AnalysisSession {
  public get id(): SessionId { return this.state.id; }
  public get tenantId(): TenantId { return this.state.tenantId; }
  public get conversationId(): ConversationId { return this.state.conversationId; }
  public get userId(): UserId { return this.state.userId; }
  public get parameters(): Record<string, unknown> { return this.state.parameters; }
  public get status(): SessionStatus { return this.state.status; }
  public get version(): number { return this.state.version; }

  private readonly pending: AnalysisRequested[] = [];

  private constructor(private state: AnalysisSessionState) {}

  static open(args: {
    id: SessionId;
    tenantId: TenantId;
    conversationId: ConversationId;
    userId: UserId;
    parameters: Record<string, unknown>;
    now: Date;
  }): AnalysisSession {
    return new AnalysisSession({
      id: args.id,
      tenantId: args.tenantId,
      conversationId: args.conversationId,
      userId: args.userId,
      parameters: { ...args.parameters },
      status: 'OPEN',
      createdAt: args.now,
      version: 1,
    });
  }

  static rehydrate(state: AnalysisSessionState): AnalysisSession {
    return new AnalysisSession(state);
  }

  requestAnalysis(bundleVersion: string): void {
    if (this.state.status === 'CLOSED') {
      throw new Error(`Session ${this.state.id} is closed`);
    }
    this.state = {
      ...this.state,
      status: 'ANALYSIS_REQUESTED',
      version: this.state.version + 1,
    };
    this.pending.push({
      type: 'AnalysisRequested',
      schemaVersion: 1,
      payload: {
        conversationId: this.state.conversationId,
        requestedBy: this.state.userId,
        bundleVersion,
        parameters: this.state.parameters,
      },
    });
  }

  close(): void {
    if (this.state.status === 'CLOSED') return;
    this.state = {
      ...this.state,
      status: 'CLOSED',
      version: this.state.version + 1,
    };
  }

  pullEvents(): ReadonlyArray<AnalysisRequested> {
    const drained = this.pending.slice();
    this.pending.length = 0;
    return drained;
  }

  snapshot(): AnalysisSessionState {
    return this.state;
  }
}
