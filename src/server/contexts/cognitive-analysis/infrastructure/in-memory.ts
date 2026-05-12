/**
 * In-memory adapters for Cognitive Analysis.
 *
 * Used by unit/component tests and `npm run dev` without the ML sidecar
 * (ADR-0003). Production adapters wrap the OpenAI / Anthropic SDKs and
 * the PostgreSQL `analyses` table.
 */

import { Analysis } from '../domain/analysis';
import { UpstreamUnavailable } from '../domain/errors';
import {
  type ConversationId,
  type AnalysisId,
  type Dimension,
  type ModelInvocation,
  type ModelResponse,
  type TenantId,
  Span,
  TurnId,
} from '../domain/value-objects';
import type { CognitiveAnalysisEvent } from '../domain/events';
import type {
  AnalysisRepository,
  ActiveBundleInputs,
  BundleProvider,
  Clock,
  DomainEventPublisher,
  IdGenerator,
  LanguageModelClient,
} from '../application/ports';

export class AggregateVersionConflict extends Error {
  constructor(public readonly aggregate: string, public readonly id: string) {
    super(`Optimistic-lock conflict on ${aggregate} ${id}`);
    this.name = 'AggregateVersionConflict';
  }
}

// ---------------------------------------------------------------------------
// AnalysisRepository
// ---------------------------------------------------------------------------

export class InMemoryAnalysisRepository implements AnalysisRepository {
  private readonly byId = new Map<string, ReturnType<Analysis['snapshot']>>();
  private readonly byKey = new Map<string, string>(); // "conv::bv::ph" -> analysisId

  async findById(id: AnalysisId, tenantId: TenantId): Promise<Analysis | null> {
    const snap = this.byId.get(id);
    if (!snap || snap.tenantId !== tenantId) return null;
    return Analysis.rehydrate(snap);
  }

  async findByKey(
    conversationId: ConversationId,
    bundleVersion: string,
    parameterHash: string,
  ): Promise<Analysis | null> {
    const key = `${conversationId}::${bundleVersion}::${parameterHash}`;
    const id = this.byKey.get(key);
    if (!id) return null;
    const snap = this.byId.get(id);
    return snap ? Analysis.rehydrate(snap) : null;
  }

  async save(analysis: Analysis, expectedAggregateVersion: number): Promise<void> {
    const existing = this.byId.get(analysis.id);
    if (existing) {
      if (existing.aggregateVersion !== expectedAggregateVersion) {
        throw new AggregateVersionConflict('Analysis', analysis.id);
      }
    } else if (expectedAggregateVersion !== 0) {
      throw new AggregateVersionConflict('Analysis', analysis.id);
    }
    const snap = analysis.snapshot();
    this.byId.set(snap.id, snap);
    this.byKey.set(`${snap.conversationId}::${snap.bundleVersion}::${snap.parameterHash}`, snap.id);
  }

  size(): number {
    return this.byId.size;
  }
}

// ---------------------------------------------------------------------------
// FakeBundleProvider — supplies a fixture ActiveBundleInputs to the saga.
// ---------------------------------------------------------------------------

export class FakeBundleProvider implements BundleProvider {
  constructor(private readonly bundle: ActiveBundleInputs) {}
  async active(): Promise<ActiveBundleInputs> {
    return this.bundle;
  }
}

// ---------------------------------------------------------------------------
// FakeLanguageModelClient — deterministic candidate emitter.
//
// Used to test the saga without provider calls. The fake honours the
// LanguageModelClient port contract (ADR-0017): the provider-specific
// shape never crosses the port; the fake just emits canonical
// MemberCandidate values.
// ---------------------------------------------------------------------------

export interface FakeMemberConfig {
  readonly memberId: string;
  /** Per-dimension raw confidence this member assigns to every segment. */
  readonly perDimensionRaw: Partial<Record<Dimension, number>>;
  /** Per-dimension proportion of segment covered by the detected span (0..1). */
  readonly spanCoverage?: number;
}

const ALL_DIMENSIONS: ReadonlyArray<Dimension> = [
  'FACTUAL_RETRIEVAL',
  'LOGICAL_INFERENCE',
  'CREATIVE_SYNTHESIS',
  'META_COGNITION',
];

export class FakeLanguageModelClient implements LanguageModelClient {
  readonly memberId: string;
  public shouldFail = false;
  /** Optional: a function that is called with each invocation; can throw. */
  public hook: ((req: ModelInvocation) => void) | null = null;

  constructor(private readonly config: FakeMemberConfig) {
    this.memberId = config.memberId;
  }

  async invoke(request: ModelInvocation): Promise<ModelResponse> {
    if (this.hook) this.hook(request);
    if (this.shouldFail) throw new UpstreamUnavailable(this.memberId);
    const len = request.segmentText.length;
    const coverage = this.config.spanCoverage ?? 1;
    const endOffset = Math.max(1, Math.floor(len * coverage));
    const span = Span.of(TurnId.of(request.segmentTurnId), 0, endOffset);
    const candidates = ALL_DIMENSIONS.flatMap((dim) => {
      const raw = this.config.perDimensionRaw[dim];
      if (raw === undefined) return [];
      return [
        {
          memberId: request.memberId,
          span,
          dimension: dim,
          rawConfidence: raw,
          evidence: [
            {
              span,
              verbatim: request.segmentText.slice(0, endOffset),
            },
          ],
        },
      ];
    });
    return {
      memberId: request.memberId,
      candidates,
      selfReportedConfidence: averageOf(Object.values(this.config.perDimensionRaw) as number[]),
    };
  }
}

function averageOf(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Test-only Id generator / Clock / publisher.
// ---------------------------------------------------------------------------

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

export class CapturingDomainEventPublisher implements DomainEventPublisher {
  readonly events: CognitiveAnalysisEvent[] = [];
  async publish(events: ReadonlyArray<CognitiveAnalysisEvent>): Promise<void> {
    for (const e of events) this.events.push(e);
  }
}
