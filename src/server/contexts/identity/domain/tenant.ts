/**
 * Identity & Access — Tenant aggregate.
 *
 * See docs/ddd/06-aggregates-and-entities.md.
 *
 * Invariants:
 *   - `region` is set at creation and never changed (ADR-0021); cross-
 *     region migration is a separate delete + recreate flow.
 */

import type { TenantId } from './value-objects';
import type { TenantCreated } from './events';

export interface RetentionPolicySnapshot {
  readonly retainMedia: boolean;
  readonly maxAgeDays: number;
}

interface TenantState {
  readonly id: TenantId;
  readonly name: string;
  readonly region: string;
  readonly retentionPolicy: RetentionPolicySnapshot;
  readonly featureFlags: ReadonlyArray<string>;
  readonly createdAt: Date;
  readonly version: number;
}

const DEFAULT_RETENTION: RetentionPolicySnapshot = {
  retainMedia: false,
  maxAgeDays: 365,
};

export class Tenant {
  public get id(): TenantId {
    return this.state.id;
  }
  public get region(): string {
    return this.state.region;
  }
  public get version(): number {
    return this.state.version;
  }

  private readonly pending: TenantCreated[] = [];

  private constructor(private state: TenantState) {}

  static create(args: {
    id: TenantId;
    name: string;
    region: string;
    now: Date;
    retentionPolicy?: RetentionPolicySnapshot;
    featureFlags?: ReadonlyArray<string>;
  }): Tenant {
    if (!args.name.trim()) {
      throw new Error('Tenant name is required');
    }
    if (!args.region.trim()) {
      throw new Error('Tenant region is required');
    }
    const tenant = new Tenant({
      id: args.id,
      name: args.name.trim(),
      region: args.region.trim(),
      retentionPolicy: args.retentionPolicy ?? DEFAULT_RETENTION,
      featureFlags: args.featureFlags ?? [],
      createdAt: args.now,
      version: 1,
    });
    tenant.pending.push({
      type: 'TenantCreated',
      schemaVersion: 1,
      payload: {
        tenantId: tenant.state.id,
        name: tenant.state.name,
        region: tenant.state.region,
      },
    });
    return tenant;
  }

  static rehydrate(state: TenantState): Tenant {
    return new Tenant(state);
  }

  snapshot(): TenantState {
    return this.state;
  }

  pullEvents(): ReadonlyArray<TenantCreated> {
    const drained = this.pending.slice();
    this.pending.length = 0;
    return drained;
  }
}
