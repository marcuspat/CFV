/**
 * ShadowDeployment aggregate.
 *
 * Tracks the accumulating set of shadow-analysis results for one
 * AnalysisBundle while it sits in SHADOW status (ADR-0022).
 *
 * Invariants:
 *   - One ShadowDeployment per BundleVersion.
 *   - Recording a result for the same analysisId twice is idempotent.
 *   - Closed deployments do not accept further results.
 */

import type { ShadowAnalysisCompleted } from './events';
import type {
  BundleVersion,
  CognitiveMetrics,
  ShadowDeploymentId,
} from './value-objects';
import { isCognitiveMetrics } from './value-objects';

export type DeploymentStatus = 'OPEN' | 'CLOSED';

interface ShadowDeploymentState {
  readonly id: ShadowDeploymentId;
  readonly bundleVersion: BundleVersion;
  readonly status: DeploymentStatus;
  readonly createdAt: Date;
  readonly results: ReadonlyArray<{
    readonly analysisId: string;
    readonly metrics: CognitiveMetrics;
    readonly recordedAt: Date;
  }>;
  readonly aggregateVersion: number;
}

export class ShadowDeployment {
  public get id(): ShadowDeploymentId { return this.state.id; }
  public get bundleVersion(): BundleVersion { return this.state.bundleVersion; }
  public get status(): DeploymentStatus { return this.state.status; }
  public get results(): ReadonlyArray<{
    analysisId: string;
    metrics: CognitiveMetrics;
    recordedAt: Date;
  }> { return this.state.results; }
  public get aggregateVersion(): number { return this.state.aggregateVersion; }

  private readonly pending: ShadowAnalysisCompleted[] = [];

  private constructor(private state: ShadowDeploymentState) {}

  static open(args: {
    id: ShadowDeploymentId;
    bundleVersion: BundleVersion;
    now: Date;
  }): ShadowDeployment {
    return new ShadowDeployment({
      id: args.id,
      bundleVersion: args.bundleVersion,
      status: 'OPEN',
      createdAt: args.now,
      results: [],
      aggregateVersion: 1,
    });
  }

  static rehydrate(state: ShadowDeploymentState): ShadowDeployment {
    return new ShadowDeployment(state);
  }

  recordResult(args: {
    analysisId: string;
    metrics: CognitiveMetrics;
    now: Date;
  }): void {
    if (this.state.status !== 'OPEN') {
      throw new Error(`Shadow deployment ${this.state.id} is CLOSED`);
    }
    if (!isCognitiveMetrics(args.metrics)) {
      throw new Error('malformed CognitiveMetrics');
    }
    if (this.state.results.some((r) => r.analysisId === args.analysisId)) {
      // Idempotent — the same analysis result twice is a no-op.
      return;
    }
    this.state = {
      ...this.state,
      results: [
        ...this.state.results,
        { analysisId: args.analysisId, metrics: args.metrics, recordedAt: args.now },
      ],
      aggregateVersion: this.state.aggregateVersion + 1,
    };
    this.pending.push({
      type: 'ShadowAnalysisCompleted',
      schemaVersion: 1,
      payload: {
        bundleVersion: this.state.bundleVersion.value,
        analysisId: args.analysisId,
        metrics: args.metrics,
      },
    });
  }

  close(): void {
    if (this.state.status === 'CLOSED') return;
    this.state = {
      ...this.state,
      status: 'CLOSED',
      aggregateVersion: this.state.aggregateVersion + 1,
    };
  }

  pullEvents(): ReadonlyArray<ShadowAnalysisCompleted> {
    const drained = this.pending.slice();
    this.pending.length = 0;
    return drained;
  }

  snapshot(): ShadowDeploymentState {
    return this.state;
  }
}
