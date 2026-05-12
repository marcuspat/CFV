/**
 * Model Management — domain errors.
 *
 * Mapped onto the canonical ApplicationError surface by application
 * services (docs/ddd/11-application-services.md).
 */

export class ModelManagementDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelManagementDomainError';
  }
}

export class BundleImmutable extends ModelManagementDomainError {
  constructor(public readonly version: string, public readonly status: string) {
    super(`Bundle ${version} is ${status} and immutable`);
    this.name = 'BundleImmutable';
  }
}

export class InvalidBundleTransition extends ModelManagementDomainError {
  constructor(from: string, to: string) {
    super(`Invalid bundle transition: ${from} -> ${to}`);
    this.name = 'InvalidBundleTransition';
  }
}

export class BundleNotEligibleForPromotion extends ModelManagementDomainError {
  constructor(reason: string) {
    super(`Bundle is not eligible for promotion: ${reason}`);
    this.name = 'BundleNotEligibleForPromotion';
  }
}

export class BundleIncomplete extends ModelManagementDomainError {
  constructor(reason: string) {
    super(`Bundle is incomplete: ${reason}`);
    this.name = 'BundleIncomplete';
  }
}

export class ActiveBundleConflict extends ModelManagementDomainError {
  constructor(public readonly currentActive: string) {
    super(
      `An ACTIVE bundle already exists (${currentActive}); promotion requires displacing it explicitly`,
    );
    this.name = 'ActiveBundleConflict';
  }
}
