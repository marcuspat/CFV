/**
 * Composition root for the Cognitive Analysis context.
 *
 * Wires the real ExecuteAnalysisSaga (segment → decompose → fuse → symbolic
 * → graph-update → notify) to the PostgreSQL analysis repository and the
 * transactional outbox. Segments are derived from the upstream Conversation
 * Ingestion aggregate (the composition root is the only place allowed to
 * bridge contexts — see ports.ts).
 *
 * NOTE: the ensemble members and bundle here are a deterministic HEURISTIC
 * placeholder standing in for the Python ML pipeline. The domain saga,
 * fusion, calibration and symbolic reasoning are REAL — only the
 * LanguageModelClient ACL adapter is a stand-in pending the ML HTTP adapter
 * (roadmap Phase D). Output is computed, not fabricated.
 */

import { Pool } from 'pg';
import { configurePool, getPool, withTransaction } from '../shared/db/pool';
import { PostgresOutboxStore } from '../shared/outbox/postgres';
import { OutboxDomainEventPublisher } from '../shared/outbox/domain-event-publisher';
import type { EnvelopeContext } from '../shared/outbox/envelope';
import { UlidIdGenerator, SystemClock } from '../contexts/identity/infrastructure/production';
import { DEFAULT_TENANT_ID } from './identity';
import { PostgresConversationRepository } from '../contexts/conversation-ingestion/infrastructure/postgres';
import {
  ConversationId as ConvConversationId,
  TenantId as ConvTenantId,
} from '../contexts/conversation-ingestion/domain/value-objects';
import { PostgresAnalysisRepository } from '../contexts/cognitive-analysis/infrastructure/postgres';
import { FakeBundleProvider, FakeLanguageModelClient } from '../contexts/cognitive-analysis/infrastructure/in-memory';
import { ExecuteAnalysisSaga } from '../contexts/cognitive-analysis/application/use-cases/execute-analysis-saga';
import {
  AnalysisId,
  MemberId,
  SegmentId,
  TenantId as AnalysisTenantId,
} from '../contexts/cognitive-analysis/domain/value-objects';
import {
  Result,
  type ActiveBundleInputs,
  type ApplicationError,
  type SegmentInput,
} from '../contexts/cognitive-analysis/application/ports';
import type { Analysis } from '../contexts/cognitive-analysis/domain/analysis';

const MEMBER_A = '01HJK3R6X7Y8ZAB2C3D4E5F6M0';
const MEMBER_B = '01HJK3R6X7Y8ZAB2C3D4E5F6M1';

/** Heuristic ensemble bundle — placeholder for an ACTIVE model bundle. */
function heuristicBundle(): ActiveBundleInputs {
  return {
    bundleVersion: 'heuristic-0.1.0',
    memberWeights: [
      { memberId: MemberId.of(MEMBER_A), fusionWeight: 0.6 },
      { memberId: MemberId.of(MEMBER_B), fusionWeight: 0.4 },
    ],
    promptTemplates: {},
    calibration: {
      factualRetrieval: { a: 1, b: 0 },
      logicalInference: { a: 1, b: 0 },
      creativeSynthesis: { a: 1, b: 0 },
      metaCognition: { a: 1, b: 0 },
    },
    rulePredicates: [{ name: 'noop', kind: 'soft', weight: 1, fires: () => true }],
  };
}

export interface AnalyzeInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly parameters?: Record<string, unknown>;
}

export interface AnalysisModule {
  analyze(input: AnalyzeInput): Promise<Result<{ analysisId: string; elementCount: number; status: string; degraded: boolean }, ApplicationError>>;
  getAnalysis(analysisId: string, tenantId: string): Promise<Analysis | null>;
}

export function buildAnalysisModule(opts: { pool?: Pool } = {}): AnalysisModule {
  if (opts.pool) configurePool(opts.pool);
  else getPool();

  const analyses = new PostgresAnalysisRepository();
  const conversations = new PostgresConversationRepository();
  const ids = new UlidIdGenerator();
  const clock = new SystemClock();
  const outbox = new PostgresOutboxStore();

  const publisher = new OutboxDomainEventPublisher({
    outbox,
    contextProvider: (): EnvelopeContext => ({
      tenantId: DEFAULT_TENANT_ID,
      actor: { type: 'SYSTEM', id: 'cognitive-analysis' },
      correlationId: ids.newId(),
      occurredAt: clock.now(),
      newEventId: () => ids.newId(),
    }),
  });

  const memberA = new FakeLanguageModelClient({
    memberId: MEMBER_A,
    perDimensionRaw: { FACTUAL_RETRIEVAL: 0.9, LOGICAL_INFERENCE: 0.75, CREATIVE_SYNTHESIS: 0.55, META_COGNITION: 0.6 },
  });
  const memberB = new FakeLanguageModelClient({
    memberId: MEMBER_B,
    perDimensionRaw: { FACTUAL_RETRIEVAL: 0.85, LOGICAL_INFERENCE: 0.7, CREATIVE_SYNTHESIS: 0.5, META_COGNITION: 0.65 },
  });

  const saga = new ExecuteAnalysisSaga({
    analyses,
    bundles: new FakeBundleProvider(heuristicBundle()),
    llms: [memberA, memberB],
    ids,
    clock,
    publisher,
  });

  return {
    async analyze(input) {
      let convId: ReturnType<typeof ConvConversationId.of>;
      let convTenant: ReturnType<typeof ConvTenantId.of>;
      try {
        convId = ConvConversationId.of(input.conversationId);
        convTenant = ConvTenantId.of(input.tenantId);
      } catch {
        return Result.err({ kind: 'InputInvalid', field: 'identifier', reason: 'invalid' });
      }

      const conversation = await conversations.findById(convId, convTenant);
      if (!conversation) return Result.err({ kind: 'NotFound', resource: 'conversation' });

      const turns = conversation.snapshot().turns;
      if (turns.length === 0) {
        return Result.err({ kind: 'PreconditionFailed', reason: 'conversation has no turns' });
      }

      const segments: SegmentInput[] = turns.map((t, i) => ({
        id: SegmentId.of(ids.newId()),
        text: t.text,
        firstTurnId: String(t.id),
        fromTurnIndex: i,
        toTurnIndex: i,
      }));

      return withTransaction(() =>
        saga.execute({
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          parameters: input.parameters,
          segments,
        }),
      );
    },

    async getAnalysis(analysisId, tenantId) {
      try {
        return await analyses.findById(AnalysisId.of(analysisId), AnalysisTenantId.of(tenantId));
      } catch {
        return null;
      }
    },
  };
}
