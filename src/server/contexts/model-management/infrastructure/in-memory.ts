/**
 * In-memory adapters for Model Management ports.
 *
 * Same shape as the other contexts' in-memory packs: optimistic
 * concurrency, deep-clone-on-load semantics, and explicit handling of
 * the "at most one ACTIVE bundle" invariant in the bundle repository's
 * save path.
 */

import { AnalysisBundle } from '../domain/analysis-bundle';
import { ShadowDeployment } from '../domain/shadow-deployment';
import type { ModelManagementEvent } from '../domain/events';
import type {
  BundleVersion,
} from '../domain/value-objects';
import type {
  AnalysisBundleRepository,
  BundleArtifactStore,
  Clock,
  DomainEventPublisher,
  IdGenerator,
  ModelRegistry,
  ShadowDeploymentRepository,
} from '../application/ports';

export class AggregateVersionConflict extends Error {
  constructor(public readonly aggregate: string, public readonly id: string) {
    super(`Optimistic-lock conflict on ${aggregate} ${id}`);
    this.name = 'AggregateVersionConflict';
  }
}

export class ActiveBundleInvariantViolated extends Error {
  constructor(public readonly current: string, public readonly incoming: string) {
    super(
      `Cannot have two ACTIVE bundles: ${current} is already active; cannot also activate ${incoming}`,
    );
    this.name = 'ActiveBundleInvariantViolated';
  }
}

// ---------------------------------------------------------------------------
// AnalysisBundleRepository
// ---------------------------------------------------------------------------

export class InMemoryAnalysisBundleRepository implements AnalysisBundleRepository {
  private readonly byVersion = new Map<string, ReturnType<AnalysisBundle['snapshot']>>();

  async findActive(): Promise<AnalysisBundle | null> {
    for (const snap of this.byVersion.values()) {
      if (snap.status === 'ACTIVE') return AnalysisBundle.rehydrate(snap);
    }
    return null;
  }

  async findByVersion(version: BundleVersion): Promise<AnalysisBundle | null> {
    const snap = this.byVersion.get(version.value);
    return snap ? AnalysisBundle.rehydrate(snap) : null;
  }

  async save(
    bundle: AnalysisBundle,
    expectedAggregateVersion: number,
    alsoSave?: ReadonlyArray<{
      bundle: AnalysisBundle;
      expectedAggregateVersion: number;
    }>,
  ): Promise<void> {
    const allWrites = [
      { bundle, expectedAggregateVersion },
      ...(alsoSave ?? []),
    ];

    // Phase 1: optimistic-lock check on each write.
    for (const w of allWrites) {
      const existing = this.byVersion.get(w.bundle.bundleVersion.value);
      if (existing) {
        if (existing.aggregateVersion !== w.expectedAggregateVersion) {
          throw new AggregateVersionConflict('AnalysisBundle', w.bundle.bundleVersion.value);
        }
      } else if (w.expectedAggregateVersion !== 0) {
        throw new AggregateVersionConflict('AnalysisBundle', w.bundle.bundleVersion.value);
      }
    }

    // Phase 2: at-most-one-ACTIVE invariant. Compute the post-write set
    // of active versions and reject if it would exceed 1.
    const postState = new Map(this.byVersion);
    for (const w of allWrites) {
      postState.set(w.bundle.bundleVersion.value, w.bundle.snapshot());
    }
    let actives: string[] = [];
    for (const snap of postState.values()) {
      if (snap.status === 'ACTIVE') actives.push(snap.version.value);
    }
    if (actives.length > 1) {
      throw new ActiveBundleInvariantViolated(
        actives.filter((v) => v !== bundle.bundleVersion.value)[0]!,
        bundle.bundleVersion.value,
      );
    }

    // Phase 3: commit.
    for (const w of allWrites) {
      this.byVersion.set(w.bundle.bundleVersion.value, w.bundle.snapshot());
    }
  }

  size(): number {
    return this.byVersion.size;
  }

  /** Test helper: snapshot the current statuses of all bundles. */
  statuses(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const snap of this.byVersion.values()) out[snap.version.value] = snap.status;
    return out;
  }
}

// ---------------------------------------------------------------------------
// ShadowDeploymentRepository
// ---------------------------------------------------------------------------

export class InMemoryShadowDeploymentRepository implements ShadowDeploymentRepository {
  private readonly byBundleVersion = new Map<string, ReturnType<ShadowDeployment['snapshot']>>();

  async findByBundle(version: BundleVersion): Promise<ShadowDeployment | null> {
    const snap = this.byBundleVersion.get(version.value);
    return snap ? ShadowDeployment.rehydrate(snap) : null;
  }

  async save(deployment: ShadowDeployment, expectedAggregateVersion: number): Promise<void> {
    const existing = this.byBundleVersion.get(deployment.bundleVersion.value);
    if (existing) {
      if (existing.aggregateVersion !== expectedAggregateVersion) {
        throw new AggregateVersionConflict(
          'ShadowDeployment',
          deployment.bundleVersion.value,
        );
      }
    } else if (expectedAggregateVersion !== 0) {
      throw new AggregateVersionConflict(
        'ShadowDeployment',
        deployment.bundleVersion.value,
      );
    }
    this.byBundleVersion.set(deployment.bundleVersion.value, deployment.snapshot());
  }
}

// ---------------------------------------------------------------------------
// ModelRegistry — read-only adapter on top of the repository.
// ---------------------------------------------------------------------------

export class RepositoryBackedModelRegistry implements ModelRegistry {
  constructor(private readonly bundles: AnalysisBundleRepository) {}

  async activeBundle(): Promise<AnalysisBundle> {
    const active = await this.bundles.findActive();
    if (!active) {
      throw new Error('No ACTIVE bundle has been promoted yet');
    }
    return active;
  }

  async bundleByVersion(version: BundleVersion): Promise<AnalysisBundle | null> {
    return this.bundles.findByVersion(version);
  }
}

// ---------------------------------------------------------------------------
// BundleArtifactStore — in-memory blob store for DGNN checkpoints etc.
// ---------------------------------------------------------------------------

export class InMemoryBundleArtifactStore implements BundleArtifactStore {
  private readonly objects = new Map<string, Uint8Array>();
  private counter = 0;

  async put(args: { bundleVersion: string; name: string; bytes: Uint8Array }): Promise<string> {
    this.counter += 1;
    const key = `bundle/${args.bundleVersion}/${args.name}-${this.counter}`;
    this.objects.set(key, args.bytes);
    return key;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
}

// ---------------------------------------------------------------------------
// Test-only IdGenerator / Clock / event capturer
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
  readonly events: ModelManagementEvent[] = [];
  async publish(events: ReadonlyArray<ModelManagementEvent>): Promise<void> {
    for (const e of events) this.events.push(e);
  }
}
