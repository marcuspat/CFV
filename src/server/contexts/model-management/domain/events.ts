/**
 * Model Management — domain events.
 *
 * Wire-shape mirrors docs/schemas/events/*.json. Schemas are the source
 * of truth; these TypeScript shapes must remain compatible.
 */

import type { BundleVersion, CognitiveMetrics, UserId } from './value-objects';

export interface BundleDraftCreated {
  readonly type: 'BundleDraftCreated';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly bundleVersion: string; // BundleVersion.value
    readonly createdBy: UserId;
  };
}

export interface BundlePromotedToShadow {
  readonly type: 'BundlePromotedToShadow';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly bundleVersion: string;
  };
}

export interface ShadowAnalysisCompleted {
  readonly type: 'ShadowAnalysisCompleted';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly bundleVersion: string;
    readonly analysisId: string;
    readonly metrics: CognitiveMetrics;
  };
}

export interface BundlePromotedToActive {
  readonly type: 'BundlePromotedToActive';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly bundleVersion: string;
    readonly previousActive?: string;
  };
}

export interface BundleRolledBack {
  readonly type: 'BundleRolledBack';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly from: string;
    readonly to: string;
    readonly reason: string;
  };
}

export interface CalibrationRecomputed {
  readonly type: 'CalibrationRecomputed';
  readonly schemaVersion: 1;
  readonly payload: {
    readonly bundleVersion: string;
    readonly effectiveAt: string; // ISO-8601
  };
}

export type ModelManagementEvent =
  | BundleDraftCreated
  | BundlePromotedToShadow
  | ShadowAnalysisCompleted
  | BundlePromotedToActive
  | BundleRolledBack
  | CalibrationRecomputed;

// Re-export to keep the BundleVersion type accessible from the event module
// without forcing consumers to import from value-objects.
export type { BundleVersion };
