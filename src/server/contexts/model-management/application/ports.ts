/**
 * Model Management — application ports.
 *
 * Pure interfaces only; adapters in `infrastructure/`. The published port
 * other contexts (Cognitive Analysis, Cognitive Graph) consume is
 * `ModelRegistry` — they ask for the active bundle by reading through it,
 * not by reaching into our repository.
 */

import type { AnalysisBundle } from '../domain/analysis-bundle';
import type { ModelManagementEvent } from '../domain/events';
import type { ShadowDeployment } from '../domain/shadow-deployment';
import type { BundleVersion } from '../domain/value-objects';

// ---------------------------------------------------------------------------
// Repositories
// ---------------------------------------------------------------------------

export interface AnalysisBundleRepository {
  /** Returns the currently-ACTIVE bundle, or null if none yet. */
  findActive(): Promise<AnalysisBundle | null>;
  findByVersion(version: BundleVersion): Promise<AnalysisBundle | null>;
  /**
   * Save the bundle. Implementations enforce the "at most one ACTIVE"
   * invariant: if `bundle.status === 'ACTIVE'`, any other ACTIVE bundle
   * in the store must have been RETIREd in the same unit of work.
   *
   * @param expectedAggregateVersion the pre-mutation aggregateVersion of
   *        the bundle, or 0 when persisting a fresh DRAFT.
   * @param alsoSave bundles whose state changed transitively (e.g. the
   *        bundle being displaced during a promoteToActive); persisted
   *        atomically with the primary bundle.
   */
  save(
    bundle: AnalysisBundle,
    expectedAggregateVersion: number,
    alsoSave?: ReadonlyArray<{ bundle: AnalysisBundle; expectedAggregateVersion: number }>,
  ): Promise<void>;
}

export interface ShadowDeploymentRepository {
  findByBundle(version: BundleVersion): Promise<ShadowDeployment | null>;
  save(deployment: ShadowDeployment, expectedAggregateVersion: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Published port — read-only view consumed by other contexts.
// ---------------------------------------------------------------------------

export interface ModelRegistry {
  /** Returns the active bundle; throws if none has been promoted yet. */
  activeBundle(): Promise<AnalysisBundle>;
  /** Look up any historical bundle (read-only). */
  bundleByVersion(version: BundleVersion): Promise<AnalysisBundle | null>;
}

// ---------------------------------------------------------------------------
// Adapter ports
// ---------------------------------------------------------------------------

export interface BundleArtifactStore {
  /** Persist a binary artefact (DGNN checkpoint etc.); returns the key. */
  put(args: { bundleVersion: string; name: string; bytes: Uint8Array }): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export interface IdGenerator { newId(): string; }
export interface Clock { now(): Date; }
export interface DomainEventPublisher {
  publish(events: ReadonlyArray<ModelManagementEvent>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Result / errors
// ---------------------------------------------------------------------------

export type Result<Ok, Err> =
  | { readonly ok: true; readonly value: Ok }
  | { readonly ok: false; readonly error: Err };

export const Result = {
  ok<Ok>(value: Ok): Result<Ok, never> { return { ok: true, value }; },
  err<Err>(error: Err): Result<never, Err> { return { ok: false, error }; },
};

export type ApplicationError =
  | { kind: 'InputInvalid'; field: string; reason: string }
  | { kind: 'NotFound'; resource: string }
  | { kind: 'Conflict'; reason: string }
  | { kind: 'PreconditionFailed'; reason: string };
