/**
 * Cognitive Graph — domain errors.
 */

export class CognitiveGraphDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CognitiveGraphDomainError';
  }
}

export class NodeNotFound extends CognitiveGraphDomainError {
  constructor(public readonly nodeId: string) {
    super(`Cognitive element ${nodeId} not in this graph`);
    this.name = 'NodeNotFound';
  }
}

export class DuplicateNode extends CognitiveGraphDomainError {
  constructor(public readonly nodeId: string) {
    super(`Cognitive element ${nodeId} already in graph`);
    this.name = 'DuplicateNode';
  }
}

export class EdgeReferencesUnknownNode extends CognitiveGraphDomainError {
  constructor(public readonly nodeId: string) {
    super(`Edge references unknown node ${nodeId}`);
    this.name = 'EdgeReferencesUnknownNode';
  }
}

export class CrossGraphEdge extends CognitiveGraphDomainError {
  constructor() {
    super('Edge endpoints must belong to the same graph');
    this.name = 'CrossGraphEdge';
  }
}

export class PredictedEdgeAlreadyRealised extends CognitiveGraphDomainError {
  constructor(public readonly predictedEdgeId: string) {
    super(`PredictedEdge ${predictedEdgeId} already realised`);
    this.name = 'PredictedEdgeAlreadyRealised';
  }
}

export class ThreadNotMonotonic extends CognitiveGraphDomainError {
  constructor() {
    super('Thread nodes must have monotonically non-decreasing turnIndex');
    this.name = 'ThreadNotMonotonic';
  }
}
