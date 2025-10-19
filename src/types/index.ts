/**
 * Type definitions export for Cognitive Fabric Visualizer
 */

// Export all cognitive types
export * from './cognitive';
export * from './api';

// Re-export commonly used types for convenience
export type {
  CognitiveElement,
  CognitiveGraph,
  CognitiveAnalysisResult,
  Conversation,
  ProcessConversationRequest,
  WebSocketMessage
} from './cognitive';

export type {
  ApiError,
  HealthCheckResponse,
  CreateConversationRequest,
  CreateConversationResponse,
  GetConversationResponse,
  ListConversationsResponse,
  StartAnalysisRequest,
  StartAnalysisResponse,
  GetAnalysisStatusResponse,
  GetAnalysisResultResponse,
  ExportRequest,
  ExportResponse
} from './api';

// Database configuration types
export interface DatabaseConfiguration {
  postgres: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean;
    maxConnections?: number;
  };
  neo4j: {
    uri: string;
    username: string;
    password: string;
    database?: string;
    maxConnectionPoolSize?: number;
  };
  redis: {
    url: string;
    keyPrefix?: string;
  };
}