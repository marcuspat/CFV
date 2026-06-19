/**
 * Client-local API request/response types for Cognitive Fabric Visualizer.
 * Kept inside src/ so CRA's ModuleScopePlugin is satisfied.
 * Synchronized with the shared backend types in src/types/api.ts.
 */

import {
  CognitiveAnalysisResult,
  Conversation,
  ProcessingStatus,
} from './cognitive';

// --- Conversation management ---
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

export interface ListConversationsResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// --- Cognitive analysis ---
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

export interface ProcessingMetrics {
  totalProcessingTime: number;
  cognitiveDecompositionTime: number;
  graphGenerationTime: number;
  visualizationTime: number;
  memoryUsage: number;
  accuracyMetrics: Record<string, number>;
}

export interface GetAnalysisResultResponse {
  analysisId: string;
  conversationId: string;
  result: CognitiveAnalysisResult;
  processingMetrics: ProcessingMetrics;
}

// --- Export ---
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
  fileSize?: number;
}

// --- Authentication & users ---
export enum UserRole {
  ADMIN = 'admin',
  RESEARCHER = 'researcher',
  ANALYST = 'analyst',
  VIEWER = 'viewer',
}

export interface NotificationSettings {
  email: boolean;
  browser: boolean;
  processingComplete: boolean;
  errors: boolean;
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

export interface AuthRequest {
  email: string;
  password: string;
  username?: string;
  fullName?: string;
  role?: UserRole;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  fullName: string;
  role?: UserRole;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: Date;
  requestId?: string;
}
