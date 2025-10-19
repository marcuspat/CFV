/**
 * API Request/Response types for Cognitive Fabric Visualizer
 */

import {
  CognitiveAnalysisResult,
  ProcessConversationRequest,
  CognitiveGraph,
  VisualizationData,
  WebSocketMessage,
  Conversation,
  ProcessingStatus,
  VisualizationFilter
} from './cognitive';

// HTTP API Endpoints Types

// Conversation Management
export interface CreateConversationRequest {
  title: string;
  transcript: string[];
  metadata?: {
    domain?: string;
    language?: string;
    tags?: string[];
  };
}

export interface CreateConversationResponse {
  conversationId: string;
  status: ProcessingStatus;
  estimatedDuration?: number;
}

export interface GetConversationResponse {
  conversation: Conversation;
  analysis?: CognitiveAnalysisResult;
  status: ProcessingStatus;
}

export interface ListConversationsQuery {
  page?: number;
  limit?: number;
  status?: ProcessingStatus;
  domain?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'duration';
  sortOrder?: 'asc' | 'desc';
}

export interface ListConversationsResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Cognitive Analysis
export interface StartAnalysisRequest {
  conversationId: string;
  options?: {
    includeRealTime?: boolean;
    detailLevel?: 'summary' | 'detailed' | 'comprehensive';
    customWeights?: Record<string, number>;
  };
}

export interface StartAnalysisResponse {
  analysisId: string;
  status: ProcessingStatus;
  estimatedDuration: number;
}

export interface GetAnalysisStatusResponse {
  analysisId: string;
  status: ProcessingStatus;
  progress: number; // 0-100
  currentStep: string;
  estimatedTimeRemaining?: number;
  errors?: string[];
}

export interface GetAnalysisResultResponse {
  analysisId: string;
  conversationId: string;
  result: CognitiveAnalysisResult;
  processingMetrics: ProcessingMetrics;
}

export interface ProcessingMetrics {
  totalProcessingTime: number; // in milliseconds
  cognitiveDecompositionTime: number;
  graphGenerationTime: number;
  visualizationTime: number;
  memoryUsage: number; // in MB
  accuracyMetrics: Record<string, number>;
}

// Visualization API
export interface GetVisualizationRequest {
  conversationId: string;
  visualizationType: string;
  width?: number;
  height?: number;
  colorScheme?: string;
  animationEnabled?: boolean;
  options?: {
    width?: number;
    height?: number;
    colorScheme?: string;
    animationEnabled?: boolean;
  };
}

export interface GetVisualizationResponse {
  visualizationId: string;
  data: VisualizationData;
  url?: string; // For pre-rendered visualizations
  expiresAt?: Date;
}

export interface UpdateVisualizationRequest {
  visualizationId: string;
  updates: {
    layout?: 'force' | 'hierarchical' | 'circular' | 'grid';
    colorScheme?: string;
    nodeSize?: 'uniform' | 'weighted' | 'proportional';
    edgeThickness?: 'uniform' | 'weighted';
    filters?: VisualizationFilter[];
  };
}

// VisualizationFilter is imported from cognitive.ts

// Export API
export interface ExportRequest {
  conversationId: string;
  format: 'png' | 'svg' | 'json' | 'pdf' | 'csv';
  options?: {
    includeAnalysis?: boolean;
    includeVisualizations?: boolean;
    quality?: 'low' | 'medium' | 'high';
    resolution?: number;
  };
}

export interface ExportResponse {
  exportId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt?: Date;
  fileSize?: number; // in bytes
}

// Real-time WebSocket Events
export interface CognitiveElementEvent {
  type: 'cognitive_element_added' | 'cognitive_element_updated';
  data: {
    elementId: string;
    element: any;
    confidence: number;
    dimension: string;
  };
  timestamp: Date;
  conversationId?: string;
}

export interface ProcessingProgressEvent {
  type: 'processing_progress';
  data: {
    progress: number; // 0-100
    currentStep: string;
    totalSteps: number;
    estimatedTimeRemaining: number;
  };
  timestamp: Date;
  conversationId?: string;
}

export interface VisualizationUpdateEvent {
  type: 'visualization_update';
  data: {
    visualizationId: string;
    updateType: 'node_added' | 'node_removed' | 'edge_added' | 'edge_removed' | 'layout_updated';
    changes: any;
  };
  timestamp: Date;
  conversationId?: string;
}

export interface ErrorEvent {
  type: 'error';
  data: {
    code: string;
    message: string;
    details?: any;
    timestamp: Date;
  };
  timestamp: Date;
  conversationId?: string;
}

// Authentication & User Management
export interface User {
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: UserRole;
  preferences: UserPreferences;
  createdAt: Date;
  lastLoginAt?: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  RESEARCHER = 'researcher',
  ANALYST = 'analyst',
  VIEWER = 'viewer'
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  defaultVisualizationSettings: {
    colorScheme: string;
    animationEnabled: boolean;
    detailLevel: string;
  };
  notifications: NotificationSettings;
}

export interface NotificationSettings {
  email: boolean;
  browser: boolean;
  processingComplete: boolean;
  errors: boolean;
}

export interface AuthRequest {
  email: string;
  password: string;
  username?: string;
  fullName?: string;
  role?: UserRole;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  fullName: string;
  role?: UserRole;
}

// Error Response Types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  requestId?: string;
}

export interface ValidationError extends ApiError {
  field: string;
  value: any;
  constraint: string;
}

// Health Check & System Status
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: ServiceHealth[];
  metrics: SystemMetrics;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy';
  responseTime: number; // in milliseconds
  lastCheck: Date;
  error?: string;
}

export interface SystemMetrics {
  uptime: number; // in seconds
  memoryUsage: number; // in MB
  cpuUsage: number; // percentage
  activeConnections: number;
  processingQueueLength: number;
  cacheHitRate: number; // percentage
}

// Configuration Management
export interface SystemConfiguration {
  features: FeatureFlags;
  performance: PerformanceSettings;
  security: SecuritySettings;
  integrations: IntegrationSettings;
}

export interface FeatureFlags {
  realTimeProcessing: boolean;
  advancedVisualizations: boolean;
  exportFeatures: boolean;
  multiUserSupport: boolean;
  explainabilityFeatures: boolean;
}

export interface PerformanceSettings {
  maxConcurrentAnalyses: number;
  defaultTimeout: number; // in seconds
  cacheTTL: number; // in seconds
  maxFileSize: number; // in bytes
  batchSize: number;
}

export interface SecuritySettings {
  jwtExpirationTime: number; // in seconds
  maxLoginAttempts: number;
  sessionTimeout: number; // in seconds
  allowedOrigins: string[];
  rateLimiting: RateLimitSettings;
}

export interface RateLimitSettings {
  enabled: boolean;
  requestsPerMinute: number;
  burstLimit: number;
  penaltyTime: number; // in seconds
}

export interface IntegrationSettings {
  openaiApiKey: string;
  anthropicApiKey: string;
  rasaWebhookUrl: string;
  mlServiceUrl: string;
  enableExternalApis: boolean;
}

// Search and Filtering
export interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  sort?: SearchSort;
  pagination?: PaginationParams;
}

export interface SearchFilters {
  dimensions?: string[];
  confidenceRange?: [number, number];
  dateRange?: [Date, Date];
  tags?: string[];
  users?: string[];
  status?: string[];
}

export interface SearchSort {
  field: string;
  order: 'asc' | 'desc';
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  facets: SearchFacets;
  suggestions?: string[];
}

export interface SearchResult {
  id: string;
  type: 'conversation' | 'cognitive_element' | 'visualization';
  title: string;
  description: string;
  score: number;
  highlights: string[];
  metadata: Record<string, any>;
}

export interface SearchFacets {
  dimensions: FacetCount[];
  confidenceRanges: FacetCount[];
  dateRanges: FacetCount[];
  tags: FacetCount[];
}

export interface FacetCount {
  value: string;
  count: number;
}

// Analytics and Reporting
export interface AnalyticsQuery {
  metrics: string[];
  dimensions: string[];
  filters?: AnalyticsFilters;
  timeRange: TimeRange;
  granularity: 'hour' | 'day' | 'week' | 'month';
}

export interface AnalyticsFilters {
  userId?: string;
  domain?: string;
  dimension?: string;
  confidenceRange?: [number, number];
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface AnalyticsResponse {
  data: AnalyticsDataPoint[];
  summary: AnalyticsSummary;
  metadata: AnalyticsMetadata;
}

export interface AnalyticsDataPoint {
  timestamp: Date;
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
}

export interface AnalyticsSummary {
  totalConversations: number;
  averageProcessingTime: number;
  averageAccuracy: number;
  mostActiveDimension: string;
  growthRate: number;
}

export interface AnalyticsMetadata {
  queryTime: number; // in milliseconds
  dataPoints: number;
  cached: boolean;
  lastUpdated: Date;
}