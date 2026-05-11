/**
 * Conversation Ingestion — domain errors.
 *
 * Mapped onto the canonical ApplicationError surface by application
 * services (docs/ddd/11-application-services.md § "Error Surface").
 */

export class ConversationDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversationDomainError';
  }
}

export class ConversationFrozen extends ConversationDomainError {
  constructor(public readonly conversationId: string) {
    super(`Conversation ${conversationId} is INGESTED and immutable`);
    this.name = 'ConversationFrozen';
  }
}

export class ConversationDeleted extends ConversationDomainError {
  constructor(public readonly conversationId: string) {
    super(`Conversation ${conversationId} has been deleted`);
    this.name = 'ConversationDeleted';
  }
}

export class TurnsMustBeMonotonic extends ConversationDomainError {
  constructor() {
    super('Turns must be supplied in monotonic ascending order on (timestamp, turnIndex)');
    this.name = 'TurnsMustBeMonotonic';
  }
}

export class EmptyConversation extends ConversationDomainError {
  constructor() {
    super('A Conversation must have at least one Turn');
    this.name = 'EmptyConversation';
  }
}

export class SegmentBoundaryOutOfRange extends ConversationDomainError {
  constructor(public readonly turnIndex: number) {
    super(`Segment boundary references unknown turnIndex ${turnIndex}`);
    this.name = 'SegmentBoundaryOutOfRange';
  }
}

export class InvalidStatusTransition extends ConversationDomainError {
  constructor(from: string, to: string) {
    super(`Invalid status transition: ${from} -> ${to}`);
    this.name = 'InvalidStatusTransition';
  }
}
