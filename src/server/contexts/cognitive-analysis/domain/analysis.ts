/**
 * Analysis aggregate.
 *
 * docs/ddd/06-aggregates-and-entities.md § "Analysis (CORE)".
 *
 * Lifecycle:
 *   STARTED -> RUNNING -> (COMPLETED | DEGRADED | FAILED)
 *
 * Stages run in order: SEGMENT -> DECOMPOSE -> FUSE -> SYMBOLIC ->
 * GRAPH_UPDATE -> THREAD_PREDICT -> NOTIFY (docs/ddd/13-tactical-patterns.md
 * § "Saga / Process Manager"). Each stage transitions PENDING -> RUNNING
 * -> (COMPLETED | FAILED) and emits the matching domain event.
 *
 * Invariants enforced by this aggregate:
 *   1. (conversationId, bundleVersion, parameterHash) determines identity;
 *      duplicate-key creation is the repository's concern (idempotent get-
 *      or-create), but the aggregate exposes the key as part of its
 *      snapshot for that check.
 *   2. Stages must transition through their state machine; jumping
 *      PENDING -> COMPLETED is rejected.
 *   3. Stage ordering is enforced: stage N cannot start before stage N-1
 *      is COMPLETED.
 *   4. Out-of-order stage completion is rejected.
 *   5. status = COMPLETED only when every stage is COMPLETED.
 *   6. A failed stage transitions the aggregate to FAILED with a
 *      degradedReason; a "degraded but proceeding" stage logs to the
 *      degradedReason chain without failing.
 *   7. Idempotency: re-starting an already-completed stage is a no-op.
 */

import {
  AnalysisAlreadyTerminal,
  InvalidStageTransition,
  StageAlreadyCompleted,
  UnknownDimension,
} from './errors';
import type {
  AnalysisCompleted,
  AnalysisDegraded,
  AnalysisFailed,
  AnalysisStageCompleted,
  AnalysisStageFailed,
  AnalysisStageStarted,
  AnalysisStarted,
  CognitiveAnalysisEvent,
  CognitiveElementDetected,
} from './events';
import { evidenceToWire } from './events';
import {
  ANALYSIS_STAGES,
  pendingStage,
  isDimension,
  type AnalysisId,
  type AnalysisStageName,
  type AnalysisStageSnapshot,
  type AnalysisStatus,
  type CognitiveElement,
  type ConversationId,
  type TenantId,
} from './value-objects';

interface AnalysisState {
  readonly id: AnalysisId;
  readonly conversationId: ConversationId;
  readonly tenantId: TenantId;
  readonly bundleVersion: string;
  readonly parameterHash: string;
  readonly parameters: Record<string, unknown>;
  readonly status: AnalysisStatus;
  readonly stages: ReadonlyArray<AnalysisStageSnapshot>;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly degradedReasons: ReadonlyArray<string>;
  readonly droppedMembers: ReadonlyArray<string>;
  readonly elementCount: number;
  readonly aggregateVersion: number;
}

export class Analysis {
  public get id(): AnalysisId { return this.state.id; }
  public get conversationId(): ConversationId { return this.state.conversationId; }
  public get tenantId(): TenantId { return this.state.tenantId; }
  public get bundleVersion(): string { return this.state.bundleVersion; }
  public get parameterHash(): string { return this.state.parameterHash; }
  public get status(): AnalysisStatus { return this.state.status; }
  public get stages(): ReadonlyArray<AnalysisStageSnapshot> { return this.state.stages; }
  public get aggregateVersion(): number { return this.state.aggregateVersion; }
  public get elementCount(): number { return this.state.elementCount; }
  public get degradedReasons(): ReadonlyArray<string> { return this.state.degradedReasons; }
  public get droppedMembers(): ReadonlyArray<string> { return this.state.droppedMembers; }
  public get isTerminal(): boolean {
    return this.state.status === 'COMPLETED' || this.state.status === 'FAILED';
  }

  private readonly pending: CognitiveAnalysisEvent[] = [];

  private constructor(private state: AnalysisState) {}

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  static start(args: {
    id: AnalysisId;
    conversationId: ConversationId;
    tenantId: TenantId;
    bundleVersion: string;
    parameterHash: string;
    parameters: Record<string, unknown>;
    now: Date;
  }): Analysis {
    const stages = ANALYSIS_STAGES.map(pendingStage);
    const a = new Analysis({
      id: args.id,
      conversationId: args.conversationId,
      tenantId: args.tenantId,
      bundleVersion: args.bundleVersion,
      parameterHash: args.parameterHash,
      parameters: { ...args.parameters },
      status: 'STARTED',
      stages,
      startedAt: args.now,
      completedAt: null,
      degradedReasons: [],
      droppedMembers: [],
      elementCount: 0,
      aggregateVersion: 1,
    });
    const ev: AnalysisStarted = {
      type: 'AnalysisStarted',
      schemaVersion: 1,
      payload: {
        analysisId: args.id,
        conversationId: args.conversationId,
        bundleVersion: args.bundleVersion,
        parameters: args.parameters,
      },
    };
    a.pending.push(ev);
    return a;
  }

  static rehydrate(state: AnalysisState): Analysis {
    return new Analysis(state);
  }

  // -------------------------------------------------------------------------
  // Stage transitions
  // -------------------------------------------------------------------------

  startStage(name: AnalysisStageName, now: Date): void {
    this.guardNotTerminal();
    const idx = this.stageIndex(name);
    if (idx > 0) {
      const prev = this.state.stages[idx - 1];
      if (prev.status !== 'COMPLETED') {
        throw new InvalidStageTransition(name, `prev=${prev.status}`, 'RUNNING');
      }
    }
    const current = this.state.stages[idx];
    if (current.status === 'COMPLETED') {
      // Idempotent: re-starting a completed stage is a no-op.
      return;
    }
    if (current.status !== 'PENDING') {
      throw new InvalidStageTransition(name, current.status, 'RUNNING');
    }
    const nextStages = this.state.stages.map((s, i) =>
      i === idx ? { ...s, status: 'RUNNING' as const, startedAt: now } : s,
    );
    this.state = {
      ...this.state,
      status: 'RUNNING',
      stages: nextStages,
      aggregateVersion: this.state.aggregateVersion + 1,
    };
    const ev: AnalysisStageStarted = {
      type: 'AnalysisStageStarted',
      schemaVersion: 1,
      payload: { analysisId: this.state.id, stage: name },
    };
    this.pending.push(ev);
  }

  completeStage(name: AnalysisStageName, now: Date): void {
    this.guardNotTerminal();
    const idx = this.stageIndex(name);
    const current = this.state.stages[idx];
    if (current.status === 'COMPLETED') {
      throw new StageAlreadyCompleted(name);
    }
    if (current.status !== 'RUNNING') {
      throw new InvalidStageTransition(name, current.status, 'COMPLETED');
    }
    const startedAt = current.startedAt ?? now;
    const durationMs = Math.max(0, now.getTime() - startedAt.getTime());
    const nextStages = this.state.stages.map((s, i) =>
      i === idx
        ? { ...s, status: 'COMPLETED' as const, completedAt: now, durationMs }
        : s,
    );
    this.state = {
      ...this.state,
      stages: nextStages,
      aggregateVersion: this.state.aggregateVersion + 1,
    };
    const ev: AnalysisStageCompleted = {
      type: 'AnalysisStageCompleted',
      schemaVersion: 1,
      payload: { analysisId: this.state.id, stage: name, durationMs },
    };
    this.pending.push(ev);
  }

  failStage(args: {
    name: AnalysisStageName;
    errorClass: string;
    retryable: boolean;
    now: Date;
  }): void {
    this.guardNotTerminal();
    const idx = this.stageIndex(args.name);
    const current = this.state.stages[idx];
    if (current.status === 'COMPLETED') {
      throw new StageAlreadyCompleted(args.name);
    }
    const nextStages = this.state.stages.map((s, i) =>
      i === idx
        ? {
            ...s,
            status: 'FAILED' as const,
            completedAt: args.now,
            errorClass: args.errorClass,
            retryable: args.retryable,
          }
        : s,
    );
    this.state = {
      ...this.state,
      stages: nextStages,
      aggregateVersion: this.state.aggregateVersion + 1,
    };
    const ev: AnalysisStageFailed = {
      type: 'AnalysisStageFailed',
      schemaVersion: 1,
      payload: {
        analysisId: this.state.id,
        stage: args.name,
        errorClass: args.errorClass,
        retryable: args.retryable,
      },
    };
    this.pending.push(ev);
  }

  // -------------------------------------------------------------------------
  // Element emission
  // -------------------------------------------------------------------------

  emitElement(element: CognitiveElement): void {
    this.guardNotTerminal();
    if (!isDimension(element.dimension)) {
      throw new UnknownDimension(String(element.dimension));
    }
    this.state = {
      ...this.state,
      elementCount: this.state.elementCount + 1,
      aggregateVersion: this.state.aggregateVersion + 1,
    };
    const ev: CognitiveElementDetected = {
      type: 'CognitiveElementDetected',
      schemaVersion: 1,
      payload: {
        analysisId: this.state.id,
        cognitiveElementId: element.id,
        dimension: element.dimension,
        span: {
          turnId: element.span.turnId,
          startOffset: element.span.startOffset,
          endOffset: element.span.endOffset,
        },
        confidence: element.confidence.value,
        evidence: element.evidence.map(evidenceToWire),
      },
    };
    this.pending.push(ev);
  }

  // -------------------------------------------------------------------------
  // Degradation + termination
  // -------------------------------------------------------------------------

  recordDegradation(args: { reason: string; dropped: ReadonlyArray<string> }): void {
    this.guardNotTerminal();
    const dropped = Array.from(new Set([...this.state.droppedMembers, ...args.dropped]));
    const reasons = [...this.state.degradedReasons, args.reason];
    this.state = {
      ...this.state,
      degradedReasons: reasons,
      droppedMembers: dropped,
      aggregateVersion: this.state.aggregateVersion + 1,
    };
    const ev: AnalysisDegraded = {
      type: 'AnalysisDegraded',
      schemaVersion: 1,
      payload: {
        analysisId: this.state.id,
        reason: args.reason,
        dropped: args.dropped,
      },
    };
    this.pending.push(ev);
  }

  complete(now: Date): void {
    if (this.state.status === 'COMPLETED') return; // idempotent
    if (this.state.status === 'FAILED') {
      throw new AnalysisAlreadyTerminal(this.state.status);
    }
    if (!this.state.stages.every((s) => s.status === 'COMPLETED')) {
      throw new InvalidStageTransition('analysis', this.state.status, 'COMPLETED');
    }
    const isDegraded = this.state.degradedReasons.length > 0;
    const durationMs = Math.max(0, now.getTime() - this.state.startedAt.getTime());
    this.state = {
      ...this.state,
      status: isDegraded ? 'DEGRADED' : 'COMPLETED',
      completedAt: now,
      aggregateVersion: this.state.aggregateVersion + 1,
    };
    const ev: AnalysisCompleted = {
      type: 'AnalysisCompleted',
      schemaVersion: 1,
      payload: {
        analysisId: this.state.id,
        elementCount: this.state.elementCount,
        bundleVersion: this.state.bundleVersion,
        durationMs,
        ...(isDegraded ? { degradedReason: this.state.degradedReasons.join('; ') } : {}),
      },
    };
    this.pending.push(ev);
  }

  fail(args: { errorClass: string; recoverable: boolean }): void {
    if (this.state.status === 'FAILED') return; // idempotent
    if (this.state.status === 'COMPLETED' || this.state.status === 'DEGRADED') {
      throw new AnalysisAlreadyTerminal(this.state.status);
    }
    this.state = {
      ...this.state,
      status: 'FAILED',
      completedAt: this.state.completedAt ?? new Date(),
      aggregateVersion: this.state.aggregateVersion + 1,
    };
    const ev: AnalysisFailed = {
      type: 'AnalysisFailed',
      schemaVersion: 1,
      payload: {
        analysisId: this.state.id,
        errorClass: args.errorClass,
        recoverable: args.recoverable,
      },
    };
    this.pending.push(ev);
  }

  // -------------------------------------------------------------------------
  // Persistence + events
  // -------------------------------------------------------------------------

  snapshot(): AnalysisState {
    return this.state;
  }

  pullEvents(): ReadonlyArray<CognitiveAnalysisEvent> {
    const drained = this.pending.slice();
    this.pending.length = 0;
    return drained;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private guardNotTerminal(): void {
    if (this.state.status === 'COMPLETED' || this.state.status === 'FAILED' || this.state.status === 'DEGRADED') {
      throw new AnalysisAlreadyTerminal(this.state.status);
    }
  }

  private stageIndex(name: AnalysisStageName): number {
    const idx = this.state.stages.findIndex((s) => s.name === name);
    if (idx < 0) throw new InvalidStageTransition(name, 'absent', '?');
    return idx;
  }
}
