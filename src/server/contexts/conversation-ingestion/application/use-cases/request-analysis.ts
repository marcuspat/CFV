/**
 * RequestAnalysis use case.
 *
 * Idempotent: a repeat call with the same (conversationId, parameters)
 * returns the same sessionId. The parameter hash is content-addressed so
 * different parameter orderings collapse to the same key.
 */

import { createHash } from 'node:crypto';

import { AnalysisSession } from '../../domain/analysis-session';
import {
  ConversationId,
  SessionId,
  TenantId,
  UserId,
} from '../../domain/value-objects';
import {
  Result,
  type AnalysisSessionRepository,
  type ApplicationError,
  type Clock,
  type ConversationRepository,
  type DomainEventPublisher,
  type IdGenerator,
} from '../ports';

export interface RequestAnalysisInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly userId: string;
  readonly bundleVersion: string;
  readonly parameters?: Record<string, unknown>;
}

export interface RequestAnalysisDeps {
  readonly conversations: ConversationRepository;
  readonly sessions: AnalysisSessionRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
}

export class RequestAnalysis {
  constructor(private readonly deps: RequestAnalysisDeps) {}

  async execute(
    input: RequestAnalysisInput,
  ): Promise<Result<{ sessionId: string; idempotent: boolean }, ApplicationError>> {
    let tenantId: TenantId;
    let conversationId: ConversationId;
    let userId: UserId;
    try {
      tenantId = TenantId.of(input.tenantId);
      conversationId = ConversationId.of(input.conversationId);
      userId = UserId.of(input.userId);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'identifier', reason: 'invalid' });
    }

    if (!input.bundleVersion || !/^\d+\.\d+\.\d+/.test(input.bundleVersion)) {
      return Result.err({
        kind: 'InputInvalid',
        field: 'bundleVersion',
        reason: 'expected semver',
      });
    }

    const conv = await this.deps.conversations.findById(conversationId, tenantId);
    if (!conv) return Result.err({ kind: 'NotFound', resource: 'conversation' });
    if (conv.isDeleted) return Result.err({ kind: 'NotFound', resource: 'conversation' });

    const parameters = input.parameters ?? {};
    const parameterHash = hashParameters({ ...parameters, bundleVersion: input.bundleVersion });

    const existing = await this.deps.sessions.findIdempotent(
      tenantId,
      conversationId,
      parameterHash,
    );
    if (existing) {
      return Result.ok({ sessionId: existing.id, idempotent: true });
    }

    const session = AnalysisSession.open({
      id: SessionId.of(this.deps.ids.newId()),
      tenantId,
      conversationId,
      userId,
      parameters,
      now: this.deps.clock.now(),
    });
    session.requestAnalysis(input.bundleVersion);

    await this.deps.sessions.save(session, 0, parameterHash);
    await this.deps.publisher.publish(session.pullEvents());
    return Result.ok({ sessionId: session.id, idempotent: false });
  }
}

/**
 * Deterministic content hash of the parameter set, key-order-insensitive.
 * Stable across runs: keys are sorted; primitive values are stringified.
 */
function hashParameters(params: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortKeys(params));
  return createHash('sha256').update(canonical).digest('hex');
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = sortKeys(obj[k]);
    return out;
  }
  return value;
}
