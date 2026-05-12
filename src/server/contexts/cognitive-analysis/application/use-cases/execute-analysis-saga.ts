/**
 * ExecuteAnalysisSaga — the orchestrator for the Cognitive Analysis
 * pipeline (ADR-0012, docs/ddd/13-tactical-patterns.md § "Saga").
 *
 * Stages executed in order:
 *
 *   SEGMENT       — caller has already segmented the conversation; the
 *                   stage records timing for observability.
 *   DECOMPOSE     — invoke each LanguageModelClient (ACL boundary) in
 *                   parallel. Members that throw UpstreamUnavailable
 *                   are DROPPED with a recordDegradation; if all members
 *                   fail, the analysis fails.
 *   FUSE          — FusionEngine combines the surviving members'
 *                   candidates with weighted-average confidence.
 *   SYMBOLIC      — SymbolicReasoner applies hard/soft rules.
 *   GRAPH_UPDATE  — emits CognitiveElementDetected events. The downstream
 *                   Cognitive Graph context (Phase 5) consumes them.
 *   THREAD_PREDICT— placeholder stage; Phase 5 will hand control to the
 *                   Cognitive Graph saga.
 *   NOTIFY        — emits AnalysisCompleted.
 *
 * Idempotency: the saga is keyed by (conversationId, bundleVersion,
 * parameterHash). A repeat invocation with the same key returns the
 * existing analysisId and is a no-op if the analysis is already
 * terminal.
 *
 * All stage handlers are idempotent on (analysisId, stage) — re-running
 * a completed stage is a no-op.
 */

import { createHash } from 'node:crypto';

import { Analysis } from '../../domain/analysis';
import { ConfidenceCalibrator } from '../../domain/confidence-calibrator';
import { FusionEngine } from '../../domain/fusion-engine';
import { SymbolicReasoner } from '../../domain/symbolic-reasoner';
import { UpstreamUnavailable } from '../../domain/errors';
import {
  AnalysisId,
  CognitiveElementId,
  ConversationId,
  MemberId,
  TenantId,
  isDimension,
  type CognitiveElement,
  type MemberCandidate,
} from '../../domain/value-objects';
import {
  Result,
  type ActiveBundleInputs,
  type AnalysisRepository,
  type ApplicationError,
  type BundleProvider,
  type Clock,
  type DomainEventPublisher,
  type IdGenerator,
  type LanguageModelClient,
  type SegmentInput,
} from '../ports';

export interface ExecuteAnalysisSagaInput {
  readonly tenantId: string;
  readonly conversationId: string;
  readonly parameters?: Record<string, unknown>;
  readonly segments: ReadonlyArray<SegmentInput>;
}

export interface ExecuteAnalysisSagaOutput {
  readonly analysisId: string;
  readonly elementCount: number;
  readonly status: string;
  readonly degraded: boolean;
}

export interface ExecuteAnalysisSagaDeps {
  readonly analyses: AnalysisRepository;
  readonly bundles: BundleProvider;
  readonly llms: ReadonlyArray<LanguageModelClient>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly publisher: DomainEventPublisher;
}

export class ExecuteAnalysisSaga {
  constructor(private readonly deps: ExecuteAnalysisSagaDeps) {}

  async execute(
    input: ExecuteAnalysisSagaInput,
  ): Promise<Result<ExecuteAnalysisSagaOutput, ApplicationError>> {
    let tenantId: TenantId;
    let conversationId: ConversationId;
    try {
      tenantId = TenantId.of(input.tenantId);
      conversationId = ConversationId.of(input.conversationId);
    } catch {
      return Result.err({ kind: 'InputInvalid', field: 'identifier', reason: 'invalid' });
    }
    if (input.segments.length === 0) {
      return Result.err({ kind: 'InputInvalid', field: 'segments', reason: 'at least one required' });
    }

    const bundle = await this.deps.bundles.active();
    const parameters = input.parameters ?? {};
    const parameterHash = hashParameters(parameters);

    // ---- Idempotency: get-or-create the Analysis aggregate. ---------------
    const existing = await this.deps.analyses.findByKey(
      conversationId,
      bundle.bundleVersion,
      parameterHash,
    );
    if (existing) {
      if (existing.isTerminal) {
        return Result.ok({
          analysisId: existing.id,
          elementCount: existing.elementCount,
          status: existing.status,
          degraded: existing.degradedReasons.length > 0,
        });
      }
      // Non-terminal duplicate: caller should wait for the in-flight run.
      return Result.err({
        kind: 'Conflict',
        reason: `analysis ${existing.id} is in-flight`,
      });
    }

    const analysisId = AnalysisId.of(this.deps.ids.newId());
    const analysis = Analysis.start({
      id: analysisId,
      conversationId,
      tenantId,
      bundleVersion: bundle.bundleVersion,
      parameterHash,
      parameters,
      now: this.deps.clock.now(),
    });

    // Run all stages. Errors at each stage are translated to
    // failStage + a terminal `fail`; the application service does NOT
    // throw on a degraded path.
    try {
      this.runStage(analysis, 'SEGMENT', () => Promise.resolve());

      const decomposed = await this.runDecomposeStage(analysis, bundle, input.segments);
      const fused = this.runFuseStage(analysis, decomposed.candidates, decomposed.activeMembers, bundle);
      const reasoned = this.runSymbolicStage(analysis, fused, bundle);
      this.runGraphUpdateStage(analysis, reasoned, analysisId, bundle);
      this.runStage(analysis, 'THREAD_PREDICT', () => Promise.resolve());
      this.runStage(analysis, 'NOTIFY', () => Promise.resolve());

      analysis.complete(this.deps.clock.now());
    } catch (e) {
      const err = e as Error;
      analysis.fail({ errorClass: err.name || 'Error', recoverable: false });
      await this.persist(analysis);
      return Result.err({ kind: 'PreconditionFailed', reason: err.message });
    }

    await this.persist(analysis);
    return Result.ok({
      analysisId: analysis.id,
      elementCount: analysis.elementCount,
      status: analysis.status,
      degraded: analysis.degradedReasons.length > 0,
    });
  }

  // -------------------------------------------------------------------------
  // Stage runners
  // -------------------------------------------------------------------------

  /**
   * Wrap a stage in start/complete/fail accounting. Pure stages that do
   * nothing (SEGMENT, THREAD_PREDICT, NOTIFY) still flow through here so
   * the aggregate accumulates the stage events.
   */
  private runStage(
    analysis: Analysis,
    stage: Parameters<Analysis['startStage']>[0],
    body: () => void | Promise<void>,
  ): void {
    const startedAt = this.deps.clock.now();
    analysis.startStage(stage, startedAt);
    try {
      const result = body();
      if (result instanceof Promise) {
        // Promise body — caller is responsible for awaiting. We treat
        // the synchronous portion as the stage body for timing.
      }
    } catch (e) {
      analysis.failStage({
        name: stage,
        errorClass: (e as Error).name || 'Error',
        retryable: false,
        now: this.deps.clock.now(),
      });
      throw e;
    }
    analysis.completeStage(stage, this.deps.clock.now());
  }

  private async runDecomposeStage(
    analysis: Analysis,
    bundle: ActiveBundleInputs,
    segments: ReadonlyArray<SegmentInput>,
  ): Promise<{ candidates: ReadonlyArray<MemberCandidate>; activeMembers: ReadonlyArray<MemberId> }> {
    const startedAt = this.deps.clock.now();
    analysis.startStage('DECOMPOSE', startedAt);

    const activeMembers: MemberId[] = [];
    const dropped: string[] = [];
    const allCandidates: MemberCandidate[] = [];

    // Per-segment per-member invocation. Errors per-member are caught and
    // mapped to a degradation; we drop the member for the *whole analysis*
    // on first failure (cost optimisation; future ADR could partition).
    const memberAlive = new Map<string, boolean>();
    for (const llm of this.deps.llms) memberAlive.set(llm.memberId, true);

    for (const segment of segments) {
      const responses = await Promise.all(
        this.deps.llms.map(async (llm) => {
          if (!memberAlive.get(llm.memberId)) return null;
          try {
            const res = await llm.invoke({
              memberId: MemberId.of(llm.memberId),
              segmentText: segment.text,
              segmentTurnId: segment.firstTurnId as any,
              promptTemplates: bundle.promptTemplates as any,
            });
            return res;
          } catch (e) {
            if (e instanceof UpstreamUnavailable) {
              memberAlive.set(llm.memberId, false);
              dropped.push(llm.memberId);
              return null;
            }
            throw e;
          }
        }),
      );
      for (const res of responses) {
        if (!res) continue;
        for (const c of res.candidates) {
          if (!isDimension(c.dimension)) continue;
          allCandidates.push(c);
        }
      }
    }

    for (const llm of this.deps.llms) {
      if (memberAlive.get(llm.memberId)) {
        activeMembers.push(MemberId.of(llm.memberId));
      }
    }

    if (activeMembers.length === 0) {
      analysis.failStage({
        name: 'DECOMPOSE',
        errorClass: 'AllMembersUnavailable',
        retryable: true,
        now: this.deps.clock.now(),
      });
      throw new Error('All ensemble members unavailable');
    }

    if (dropped.length > 0) {
      analysis.recordDegradation({
        reason: `dropped members: ${dropped.join(',')}`,
        dropped,
      });
    }

    analysis.completeStage('DECOMPOSE', this.deps.clock.now());
    return { candidates: allCandidates, activeMembers };
  }

  private runFuseStage(
    analysis: Analysis,
    candidates: ReadonlyArray<MemberCandidate>,
    activeMembers: ReadonlyArray<MemberId>,
    bundle: ActiveBundleInputs,
  ): ReturnType<typeof FusionEngine.fuse> {
    analysis.startStage('FUSE', this.deps.clock.now());
    const fused = FusionEngine.fuse({
      candidates,
      memberWeights: bundle.memberWeights,
      activeMembers,
    });
    analysis.completeStage('FUSE', this.deps.clock.now());
    return fused;
  }

  private runSymbolicStage(
    analysis: Analysis,
    fused: ReturnType<typeof FusionEngine.fuse>,
    bundle: ActiveBundleInputs,
  ): ReturnType<typeof SymbolicReasoner.apply> {
    analysis.startStage('SYMBOLIC', this.deps.clock.now());
    const reasoned = SymbolicReasoner.apply({
      candidates: fused,
      rules: bundle.rulePredicates,
    });
    analysis.completeStage('SYMBOLIC', this.deps.clock.now());
    return reasoned;
  }

  private runGraphUpdateStage(
    analysis: Analysis,
    reasoned: ReturnType<typeof SymbolicReasoner.apply>,
    analysisId: AnalysisId,
    bundle: ActiveBundleInputs,
  ): void {
    analysis.startStage('GRAPH_UPDATE', this.deps.clock.now());
    for (const r of reasoned) {
      const calibrated = ConfidenceCalibrator.calibrate(
        r.attenuatedRawConfidence,
        r.candidate.dimension,
        bundle.calibration,
      );
      const element: CognitiveElement = {
        id: CognitiveElementId.of(this.deps.ids.newId()),
        analysisId,
        span: r.candidate.span,
        dimension: r.candidate.dimension,
        confidence: calibrated,
        evidence: r.candidate.evidence,
        bundleVersion: bundle.bundleVersion,
      };
      analysis.emitElement(element);
    }
    analysis.completeStage('GRAPH_UPDATE', this.deps.clock.now());
  }

  private async persist(analysis: Analysis): Promise<void> {
    // Save with expectedAggregateVersion = 0 for the fresh insert; we
    // started a new aggregate (no concurrent writer).
    await this.deps.analyses.save(analysis, 0);
    await this.deps.publisher.publish(analysis.pullEvents());
  }
}

// ---------------------------------------------------------------------------
// Internal — deterministic parameter hash.
// ---------------------------------------------------------------------------

function hashParameters(params: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(sortKeys(params))).digest('hex');
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

/** Test helper — exposed for tests that want to compute the same hash. */
export function hashAnalysisParameters(params: Record<string, unknown>): string {
  return hashParameters(params);
}
