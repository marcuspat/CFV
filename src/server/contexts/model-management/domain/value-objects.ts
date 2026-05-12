/**
 * Model Management — value objects.
 *
 * docs/ddd/06-aggregates-and-entities.md § "AnalysisBundle" and
 * docs/ddd/07-value-objects.md § "Model Management".
 *
 * This module is `domain/` (ADR-0016): no framework or persistence imports.
 */

// ---------------------------------------------------------------------------
// Branded identifiers
// ---------------------------------------------------------------------------

declare const idBrand: unique symbol;
type Brand<T, B extends string> = T & { readonly [idBrand]: B };

export type UserId = Brand<string, 'UserId'>;
export type MemberId = Brand<string, 'MemberId'>;
export type DgnnModelId = Brand<string, 'DgnnModelId'>;
export type RulePackId = Brand<string, 'RulePackId'>;
export type ShadowDeploymentId = Brand<string, 'ShadowDeploymentId'>;

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
function asId<T extends string>(raw: string, label: string): T {
  if (!ULID_RE.test(raw)) throw new InvalidIdentifier(label, raw);
  return raw as T;
}
export const UserId             = { of: (s: string): UserId             => asId<UserId>(s, 'UserId') };
export const MemberId           = { of: (s: string): MemberId           => asId<MemberId>(s, 'MemberId') };
export const DgnnModelId        = { of: (s: string): DgnnModelId        => asId<DgnnModelId>(s, 'DgnnModelId') };
export const RulePackId         = { of: (s: string): RulePackId         => asId<RulePackId>(s, 'RulePackId') };
export const ShadowDeploymentId = { of: (s: string): ShadowDeploymentId => asId<ShadowDeploymentId>(s, 'ShadowDeploymentId') };

// ---------------------------------------------------------------------------
// BundleVersion — SemVer-like string with optional build suffix
// ---------------------------------------------------------------------------

const BUNDLE_VERSION_RE = /^\d+\.\d+\.\d+(\+[A-Za-z0-9.-]+)?$/;

export class BundleVersion {
  private constructor(public readonly value: string) {}

  static of(raw: string): BundleVersion {
    if (!BUNDLE_VERSION_RE.test(raw)) {
      throw new InvalidBundleVersion(raw);
    }
    return new BundleVersion(raw);
  }

  /** Compares only MAJOR.MINOR.PATCH; the build suffix is informational. */
  compare(other: BundleVersion): -1 | 0 | 1 {
    const [a, b] = [this.value, other.value].map((v) => v.split('+')[0].split('.').map(Number));
    for (let i = 0; i < 3; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return 0;
  }

  equals(other: BundleVersion): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

// ---------------------------------------------------------------------------
// Bundle status (state machine)
// ---------------------------------------------------------------------------

export const BUNDLE_STATUSES = ['DRAFT', 'SHADOW', 'ACTIVE', 'RETIRED'] as const;
export type BundleStatus = (typeof BUNDLE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Member (one Ensemble participant — ADR-0008)
// ---------------------------------------------------------------------------

export interface MemberSnapshot {
  readonly id: MemberId;
  readonly provider: string;       // e.g. 'openai', 'anthropic'
  readonly modelName: string;      // e.g. 'gpt-4.1-2025-03', 'claude-3.7-sonnet'
  /** Stable per-dimension prompt templates frozen into this bundle. */
  readonly promptTemplates: Record<string, string>;
  /** Per-member weight in the fusion stage (0..1). */
  readonly fusionWeight: number;
}

export function makeMember(args: MemberSnapshot): MemberSnapshot {
  if (args.fusionWeight < 0 || args.fusionWeight > 1) {
    throw new InvalidMember(`fusionWeight ${args.fusionWeight} out of [0,1]`);
  }
  if (!args.provider.trim() || !args.modelName.trim()) {
    throw new InvalidMember('provider and modelName are required');
  }
  return {
    ...args,
    promptTemplates: { ...args.promptTemplates },
  };
}

// ---------------------------------------------------------------------------
// RulePack (symbolic stage — ADR-0009)
// ---------------------------------------------------------------------------

export interface SymbolicRule {
  readonly name: string;
  /** "hard" rules are constraints; "soft" rules carry weights. */
  readonly kind: 'hard' | 'soft';
  readonly weight: number; // 0..1; ignored for hard rules but stored for audit
}

export interface RulePackSnapshot {
  readonly id: RulePackId;
  readonly rules: ReadonlyArray<SymbolicRule>;
}

export function makeRulePack(args: RulePackSnapshot): RulePackSnapshot {
  for (const r of args.rules) {
    if (!r.name.trim()) throw new InvalidRulePack('rule name required');
    if (r.weight < 0 || r.weight > 1) {
      throw new InvalidRulePack(`weight ${r.weight} for ${r.name} out of [0,1]`);
    }
  }
  return { id: args.id, rules: [...args.rules] };
}

// ---------------------------------------------------------------------------
// DGNN model artefact descriptor (ADR-0010)
// ---------------------------------------------------------------------------

export interface DgnnModelSnapshot {
  readonly id: DgnnModelId;
  /** Object-storage key for the checkpoint bytes. */
  readonly artefactKey: string;
  /** Reported per-dimension eval metrics at training time. */
  readonly trainingMetrics: CognitiveMetrics;
}

// ---------------------------------------------------------------------------
// Calibration parameters (ADR-0013)
// ---------------------------------------------------------------------------

export interface CalibrationParameters {
  /** Platt-scaling slope (a) and intercept (b) per cognitive dimension. */
  readonly factualRetrieval:  { readonly a: number; readonly b: number };
  readonly logicalInference:  { readonly a: number; readonly b: number };
  readonly creativeSynthesis: { readonly a: number; readonly b: number };
  readonly metaCognition:     { readonly a: number; readonly b: number };
}

export function isCalibrationParameters(value: unknown): value is CalibrationParameters {
  if (!value || typeof value !== 'object') return false;
  const required = [
    'factualRetrieval',
    'logicalInference',
    'creativeSynthesis',
    'metaCognition',
  ];
  for (const k of required) {
    const v = (value as Record<string, unknown>)[k];
    if (!v || typeof v !== 'object') return false;
    const ab = v as Record<string, unknown>;
    if (typeof ab.a !== 'number' || typeof ab.b !== 'number') return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Cognitive metrics (per-dimension targets — ADR-0008 / ADR-0009 / ADR-0010)
// ---------------------------------------------------------------------------

export interface CognitiveMetrics {
  readonly factualRetrievalAccuracy:  number; // target ≥ 0.92
  readonly logicalInferencePrecision: number; // target ≥ 0.85
  readonly creativeSynthesisRougeL:   number; // target ≥ 0.60
  readonly metaCognitionF1:           number; // target ≥ 0.96
}

export const DEFAULT_PROMOTION_FLOOR: CognitiveMetrics = {
  factualRetrievalAccuracy:  0.92,
  logicalInferencePrecision: 0.85,
  creativeSynthesisRougeL:   0.60,
  metaCognitionF1:           0.96,
};

export function isCognitiveMetrics(v: unknown): v is CognitiveMetrics {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.factualRetrievalAccuracy === 'number' &&
    typeof m.logicalInferencePrecision === 'number' &&
    typeof m.creativeSynthesisRougeL === 'number' &&
    typeof m.metaCognitionF1 === 'number'
  );
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InvalidIdentifier extends Error {
  constructor(label: string, raw: string) {
    super(`Invalid ${label}: ${raw}`);
    this.name = 'InvalidIdentifier';
  }
}
export class InvalidBundleVersion extends Error {
  constructor(raw: string) {
    super(`Invalid bundle version: ${raw}`);
    this.name = 'InvalidBundleVersion';
  }
}
export class InvalidMember extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidMember';
  }
}
export class InvalidRulePack extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidRulePack';
  }
}
