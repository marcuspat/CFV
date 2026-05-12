/**
 * AnalysisBundle aggregate.
 *
 * docs/ddd/06-aggregates-and-entities.md § "AnalysisBundle".
 *
 * Root: AnalysisBundle. Children (modelled as snapshot value objects):
 * Member[], RulePack, DgnnModel, CalibrationParameters.
 *
 * Lifecycle (ADR-0008, ADR-0022):
 *
 *     DRAFT --> SHADOW --> ACTIVE --> RETIRED
 *                  |          |
 *                  +----------+    (rollback re-pins a *prior* ACTIVE
 *                                   back to ACTIVE and RETIREs the
 *                                   currently-ACTIVE one)
 *
 * Invariants enforced here:
 *   1. A bundle is mutable only in DRAFT. Once promoted to SHADOW, all
 *      member / rule-pack / dgnn / calibration fields are frozen.
 *   2. Promotion to ACTIVE requires (a) the bundle to be SHADOW *and*
 *      (b) BundlePromotionPolicy to certify the eval metrics. The
 *      domain enforces (a); the application service enforces (b) by
 *      consulting the policy before calling promoteToActive.
 *   3. Rollback is a re-pin, never a mutation: a previously-ACTIVE bundle
 *      can be transitioned RETIRED -> ACTIVE only via `restoreFromRollback`,
 *      and only by the application service that has already RETIREd the
 *      currently-active one.
 *   4. RETIRED is a terminal state for the forward path; the only way
 *      out is via `restoreFromRollback`.
 *   5. Completeness for promotion: a bundle must carry ≥1 Member, a
 *      RulePack, a DGNN model descriptor, and calibration parameters
 *      before it may leave DRAFT.
 */

import {
  ActiveBundleConflict,
  BundleImmutable,
  BundleIncomplete,
  InvalidBundleTransition,
} from './errors';
import type {
  BundleDraftCreated,
  BundlePromotedToActive,
  BundlePromotedToShadow,
  BundleRolledBack,
  CalibrationRecomputed,
  ModelManagementEvent,
} from './events';
import {
  type BundleStatus,
  type BundleVersion,
  type CalibrationParameters,
  type DgnnModelSnapshot,
  type MemberSnapshot,
  type RulePackSnapshot,
  type UserId,
  isCalibrationParameters,
} from './value-objects';

interface AnalysisBundleState {
  readonly version: BundleVersion;
  readonly status: BundleStatus;
  readonly createdBy: UserId;
  readonly createdAt: Date;
  readonly members: ReadonlyArray<MemberSnapshot>;
  readonly rulePack: RulePackSnapshot | null;
  readonly dgnnModel: DgnnModelSnapshot | null;
  readonly calibration: CalibrationParameters | null;
  readonly promotedAt: Date | null;
  readonly retiredAt: Date | null;
  /** Optimistic-concurrency token (incremented on every state mutation). */
  readonly aggregateVersion: number;
}

export class AnalysisBundle {
  public get bundleVersion(): BundleVersion { return this.state.version; }
  public get status(): BundleStatus { return this.state.status; }
  public get createdBy(): UserId { return this.state.createdBy; }
  public get createdAt(): Date { return this.state.createdAt; }
  public get members(): ReadonlyArray<MemberSnapshot> { return this.state.members; }
  public get rulePack(): RulePackSnapshot | null { return this.state.rulePack; }
  public get dgnnModel(): DgnnModelSnapshot | null { return this.state.dgnnModel; }
  public get calibration(): CalibrationParameters | null { return this.state.calibration; }
  public get aggregateVersion(): number { return this.state.aggregateVersion; }
  public get isMutable(): boolean { return this.state.status === 'DRAFT'; }
  public get isActive(): boolean { return this.state.status === 'ACTIVE'; }
  public get isShadow(): boolean { return this.state.status === 'SHADOW'; }
  public get isRetired(): boolean { return this.state.status === 'RETIRED'; }

  private readonly pending: ModelManagementEvent[] = [];

  private constructor(private state: AnalysisBundleState) {}

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  static createDraft(args: {
    version: BundleVersion;
    createdBy: UserId;
    now: Date;
  }): AnalysisBundle {
    const bundle = new AnalysisBundle({
      version: args.version,
      status: 'DRAFT',
      createdBy: args.createdBy,
      createdAt: args.now,
      members: [],
      rulePack: null,
      dgnnModel: null,
      calibration: null,
      promotedAt: null,
      retiredAt: null,
      aggregateVersion: 1,
    });
    const ev: BundleDraftCreated = {
      type: 'BundleDraftCreated',
      schemaVersion: 1,
      payload: {
        bundleVersion: args.version.value,
        createdBy: args.createdBy,
      },
    };
    bundle.pending.push(ev);
    return bundle;
  }

  static rehydrate(state: AnalysisBundleState): AnalysisBundle {
    return new AnalysisBundle(state);
  }

  // -------------------------------------------------------------------------
  // Draft-only mutations
  // -------------------------------------------------------------------------

  addMember(member: MemberSnapshot): void {
    this.guardMutable();
    if (this.state.members.some((m) => m.id === member.id)) {
      throw new BundleIncomplete(`duplicate member id ${member.id}`);
    }
    this.state = {
      ...this.state,
      members: [...this.state.members, member],
      aggregateVersion: this.state.aggregateVersion + 1,
    };
  }

  setRulePack(pack: RulePackSnapshot): void {
    this.guardMutable();
    this.state = {
      ...this.state,
      rulePack: pack,
      aggregateVersion: this.state.aggregateVersion + 1,
    };
  }

  setDgnnModel(model: DgnnModelSnapshot): void {
    this.guardMutable();
    this.state = {
      ...this.state,
      dgnnModel: model,
      aggregateVersion: this.state.aggregateVersion + 1,
    };
  }

  setCalibration(calibration: CalibrationParameters): void {
    this.guardMutable();
    if (!isCalibrationParameters(calibration)) {
      throw new BundleIncomplete('malformed calibration parameters');
    }
    this.state = {
      ...this.state,
      calibration,
      aggregateVersion: this.state.aggregateVersion + 1,
    };
  }

  /**
   * Recompute calibration on an already-ACTIVE bundle is permitted (and
   * does not break immutability since calibration is a separately
   * versioned addendum per ADR-0022). For SHADOW and RETIRED bundles it
   * is forbidden; use `recomputeCalibration` only.
   */
  recomputeCalibration(calibration: CalibrationParameters, now: Date): void {
    if (this.state.status !== 'ACTIVE' && this.state.status !== 'DRAFT') {
      throw new InvalidBundleTransition(this.state.status, 'recomputeCalibration');
    }
    if (!isCalibrationParameters(calibration)) {
      throw new BundleIncomplete('malformed calibration parameters');
    }
    this.state = {
      ...this.state,
      calibration,
      aggregateVersion: this.state.aggregateVersion + 1,
    };
    const ev: CalibrationRecomputed = {
      type: 'CalibrationRecomputed',
      schemaVersion: 1,
      payload: {
        bundleVersion: this.state.version.value,
        effectiveAt: now.toISOString(),
      },
    };
    this.pending.push(ev);
  }

  // -------------------------------------------------------------------------
  // Forward state transitions
  // -------------------------------------------------------------------------

  promoteToShadow(): void {
    if (this.state.status !== 'DRAFT') {
      throw new InvalidBundleTransition(this.state.status, 'SHADOW');
    }
    this.assertComplete();
    this.state = {
      ...this.state,
      status: 'SHADOW',
      aggregateVersion: this.state.aggregateVersion + 1,
    };
    const ev: BundlePromotedToShadow = {
      type: 'BundlePromotedToShadow',
      schemaVersion: 1,
      payload: { bundleVersion: this.state.version.value },
    };
    this.pending.push(ev);
  }

  /**
   * Promote SHADOW -> ACTIVE. The eligibility decision (eval metrics
   * meet the promotion floor) is the application service's responsibility,
   * delegated to `BundlePromotionPolicy`. The aggregate enforces the
   * state-machine transition and the "at most one ACTIVE" invariant.
   *
   * @param displacedActive the bundle that was ACTIVE immediately before
   *        this promotion, or null if none. The repository is the
   *        authoritative source of this value; the application service
   *        passes it through.
   */
  promoteToActive(args: {
    now: Date;
    displacedActive: AnalysisBundle | null;
  }): void {
    if (this.state.status !== 'SHADOW') {
      throw new InvalidBundleTransition(this.state.status, 'ACTIVE');
    }
    if (args.displacedActive && !args.displacedActive.isActive) {
      // Caller passed a non-active bundle; that's a programming error.
      throw new InvalidBundleTransition(
        args.displacedActive.status,
        `displaced (expected ACTIVE)`,
      );
    }
    if (args.displacedActive) {
      args.displacedActive.retireOnDisplacement(args.now);
    }
    this.state = {
      ...this.state,
      status: 'ACTIVE',
      promotedAt: args.now,
      aggregateVersion: this.state.aggregateVersion + 1,
    };
    const ev: BundlePromotedToActive = {
      type: 'BundlePromotedToActive',
      schemaVersion: 1,
      payload: {
        bundleVersion: this.state.version.value,
        ...(args.displacedActive
          ? { previousActive: args.displacedActive.bundleVersion.value }
          : {}),
      },
    };
    this.pending.push(ev);
  }

  retire(): void {
    if (this.state.status === 'RETIRED') return; // idempotent
    if (this.state.status === 'DRAFT') {
      throw new InvalidBundleTransition('DRAFT', 'RETIRED');
    }
    this.state = {
      ...this.state,
      status: 'RETIRED',
      retiredAt: this.state.retiredAt ?? new Date(),
      aggregateVersion: this.state.aggregateVersion + 1,
    };
  }

  // -------------------------------------------------------------------------
  // Rollback path
  // -------------------------------------------------------------------------

  /**
   * Pin a previously-ACTIVE-now-RETIRED bundle back to ACTIVE. Paired
   * with `retireOnDisplacement` on the currently-active bundle by the
   * application service.
   */
  restoreFromRollback(args: {
    fromVersion: BundleVersion;
    reason: string;
    now: Date;
  }): void {
    if (this.state.status !== 'RETIRED') {
      throw new InvalidBundleTransition(this.state.status, 'ACTIVE (rollback)');
    }
    if (!args.reason.trim()) {
      throw new BundleIncomplete('rollback reason is required');
    }
    this.state = {
      ...this.state,
      status: 'ACTIVE',
      promotedAt: args.now,
      retiredAt: null,
      aggregateVersion: this.state.aggregateVersion + 1,
    };
    const ev: BundleRolledBack = {
      type: 'BundleRolledBack',
      schemaVersion: 1,
      payload: {
        from: args.fromVersion.value,
        to: this.state.version.value,
        reason: args.reason.trim(),
      },
    };
    this.pending.push(ev);
  }

  // -------------------------------------------------------------------------
  // Persistence + events
  // -------------------------------------------------------------------------

  snapshot(): AnalysisBundleState {
    return this.state;
  }

  pullEvents(): ReadonlyArray<ModelManagementEvent> {
    const drained = this.pending.slice();
    this.pending.length = 0;
    return drained;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Called by `promoteToActive` on the bundle being displaced. */
  private retireOnDisplacement(now: Date): void {
    if (this.state.status !== 'ACTIVE') {
      throw new InvalidBundleTransition(this.state.status, 'displacement');
    }
    this.state = {
      ...this.state,
      status: 'RETIRED',
      retiredAt: now,
      aggregateVersion: this.state.aggregateVersion + 1,
    };
  }

  private guardMutable(): void {
    if (!this.isMutable) {
      throw new BundleImmutable(this.state.version.value, this.state.status);
    }
  }

  private assertComplete(): void {
    if (this.state.members.length === 0) {
      throw new BundleIncomplete('no ensemble members');
    }
    if (!this.state.rulePack) {
      throw new BundleIncomplete('no rule pack');
    }
    if (!this.state.dgnnModel) {
      throw new BundleIncomplete('no DGNN model');
    }
    if (!this.state.calibration) {
      throw new BundleIncomplete('no calibration parameters');
    }
    const weightSum = this.state.members.reduce((s, m) => s + m.fusionWeight, 0);
    if (Math.abs(weightSum - 1) > 1e-6) {
      throw new BundleIncomplete(
        `member fusionWeights must sum to 1 (sum=${weightSum.toFixed(6)})`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Aggregate-wide invariant assertion used by the repository.
  //
  // Exposes the "at most one ACTIVE" check as a domain rule the
  // application service / repository can re-use without leaking aggregate
  // internals.
  // -------------------------------------------------------------------------
  static assertNoCompetingActive(
    incoming: AnalysisBundle,
    existingActiveVersion: string | null,
    displaceAcknowledged: boolean,
  ): void {
    if (
      incoming.status === 'ACTIVE' &&
      existingActiveVersion &&
      existingActiveVersion !== incoming.bundleVersion.value &&
      !displaceAcknowledged
    ) {
      throw new ActiveBundleConflict(existingActiveVersion);
    }
  }
}
