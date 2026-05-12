/**
 * Cognitive Analysis — domain errors.
 *
 * Application services map these onto the canonical ApplicationError
 * surface (docs/ddd/11-application-services.md § "Error Surface").
 */

export class CognitiveAnalysisDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CognitiveAnalysisDomainError';
  }
}

export class InvalidStageTransition extends CognitiveAnalysisDomainError {
  constructor(stage: string, from: string, to: string) {
    super(`Stage ${stage}: invalid transition ${from} -> ${to}`);
    this.name = 'InvalidStageTransition';
  }
}

export class StageAlreadyCompleted extends CognitiveAnalysisDomainError {
  constructor(stage: string) {
    super(`Stage ${stage} is already COMPLETED`);
    this.name = 'StageAlreadyCompleted';
  }
}

export class AnalysisAlreadyTerminal extends CognitiveAnalysisDomainError {
  constructor(status: string) {
    super(`Analysis is already in terminal status ${status}`);
    this.name = 'AnalysisAlreadyTerminal';
  }
}

export class UnknownDimension extends CognitiveAnalysisDomainError {
  constructor(value: string) {
    super(`Unknown cognitive dimension: ${value}`);
    this.name = 'UnknownDimension';
  }
}

/**
 * Raised by LanguageModelClient adapters when a provider is unavailable.
 * The application service interprets this as "drop this member; continue
 * if at least one member succeeded" — per ADR-0008 the ensemble must
 * support N≥2 members but degrades gracefully on outages.
 */
export class UpstreamUnavailable extends Error {
  constructor(public readonly upstream: string) {
    super(`Upstream unavailable: ${upstream}`);
    this.name = 'UpstreamUnavailable';
  }
}

export class UpstreamMalformedResponse extends Error {
  constructor(public readonly upstream: string, reason: string) {
    super(`Upstream ${upstream} returned malformed response: ${reason}`);
    this.name = 'UpstreamMalformedResponse';
  }
}
