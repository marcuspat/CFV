/**
 * API Service for Cognitive Fabric Visualizer Frontend
 * Handles communication with the backend API
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  Conversation,
  CognitiveAnalysisResult,
  ProcessingStatus,
  CreateConversationRequest,
  CreateConversationResponse,
  GetConversationResponse,
  ListConversationsResponse,
  StartAnalysisRequest,
  StartAnalysisResponse,
  GetAnalysisStatusResponse,
  GetAnalysisResultResponse,
  ExportRequest,
  ExportResponse,
} from '../types/cognitive';

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle common errors
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        return response;
      },
      (error) => {
        if (error.response?.status === 401) {
          // Token expired, clear it and redirect to login
          this.clearToken();
          window.location.href = '/login';
        } else if (error.response?.status === 429) {
          // Rate limited
          console.warn('Rate limited. Please try again later.');
        }
        return Promise.reject(error);
      }
    );
  }

  // Authentication methods
  setToken(token: string): void {
    this.token = token;
    localStorage.setItem('cognitive_fabric_token', token);
  }

  clearToken(): void {
    this.token = null;
    localStorage.removeItem('cognitive_fabric_token');
  }

  restoreToken(): void {
    const token = localStorage.getItem('cognitive_fabric_token');
    if (token) {
      this.setToken(token);
    }
  }

  // Conversation methods
  async createConversation(request: CreateConversationRequest): Promise<CreateConversationResponse> {
    const response = await this.client.post('/conversations', request);
    return response.data;
  }

  async getConversation(conversationId: string): Promise<GetConversationResponse> {
    const response = await this.client.get(`/conversations/${conversationId}`);
    return response.data;
  }

  async listConversations(params?: {
    page?: number;
    limit?: number;
    status?: ProcessingStatus;
    domain?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ListConversationsResponse> {
    const response = await this.client.get('/conversations', { params });
    return response.data;
  }

  async updateConversation(conversationId: string, updates: Partial<Conversation>): Promise<Conversation> {
    const response = await this.client.put(`/conversations/${conversationId}`, updates);
    return response.data.conversation;
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.client.delete(`/conversations/${conversationId}`);
  }

  async addTranscriptEntry(conversationId: string, content: string, speaker?: string): Promise<any> {
    const response = await this.client.post(`/conversations/${conversationId}/transcript`, {
      content,
      speaker,
    });
    return response.data;
  }

  // Analysis methods
  async startAnalysis(request: StartAnalysisRequest): Promise<StartAnalysisResponse> {
    const response = await this.client.post('/analysis/start', request);
    return response.data;
  }

  async getAnalysisStatus(analysisId: string): Promise<GetAnalysisStatusResponse> {
    const response = await this.client.get(`/analysis/${analysisId}/status`);
    return response.data;
  }

  async getAnalysisResult(analysisId: string): Promise<GetAnalysisResultResponse> {
    const response = await this.client.get(`/analysis/${analysisId}/result`);
    return response.data;
  }

  async cancelAnalysis(analysisId: string): Promise<void> {
    await this.client.post(`/analysis/${analysisId}/cancel`);
  }

  // Visualization methods
  async getVisualization(conversationId: string, params?: {
    visualizationType?: string;
    width?: number;
    height?: number;
    colorScheme?: string;
    animationEnabled?: boolean;
  }): Promise<any> {
    const response = await this.client.get(`/visualizations/${conversationId}`, { params });
    return response.data;
  }

  async updateVisualization(visualizationId: string, updates: any): Promise<any> {
    const response = await this.client.put(`/visualizations/${visualizationId}`, { updates });
    return response.data;
  }

  async deleteVisualization(visualizationId: string): Promise<void> {
    await this.client.delete(`/visualizations/${visualizationId}`);
  }

  async getVisualizationTypes(): Promise<any> {
    const response = await this.client.get('/visualizations/types/list');
    return response.data;
  }

  // Export methods
  async createExport(request: ExportRequest): Promise<ExportResponse> {
    const response = await this.client.post('/exports', request);
    return response.data;
  }

  async getExportStatus(exportId: string): Promise<ExportResponse> {
    const response = await this.client.get(`/exports/${exportId}`);
    return response.data;
  }

  async downloadExport(exportId: string): Promise<any> {
    const response = await this.client.get(`/exports/${exportId}/download`);
    return response.data;
  }

  async deleteExport(exportId: string): Promise<void> {
    await this.client.delete(`/exports/${exportId}`);
  }

  async listExports(params?: {
    status?: string;
    format?: string;
    conversationId?: string;
    page?: number;
    limit?: number;
  }): Promise<any> {
    const response = await this.client.get('/exports', { params });
    return response.data;
  }

  async getExportFormats(): Promise<any> {
    const response = await this.client.get('/exports/formats/list');
    return response.data;
  }

  // Health check
  async healthCheck(): Promise<any> {
    const response = await this.client.get('/health');
    return response.data;
  }

  async detailedHealthCheck(): Promise<any> {
    const response = await this.client.get('/health/detailed');
    return response.data;
  }

  // Utility methods
  async uploadFile(file: File, onProgress?: (progress: number) => void): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.client.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });

    return response.data;
  }

  // Batch operations
  async batchCreateConversations(conversations: CreateConversationRequest[]): Promise<CreateConversationResponse[]> {
    const promises = conversations.map(conv => this.createConversation(conv));
    return Promise.all(promises);
  }

  async batchDeleteConversations(conversationIds: string[]): Promise<void> {
    const promises = conversationIds.map(id => this.deleteConversation(id));
    await Promise.all(promises);
  }

  // Search functionality
  async searchConversations(query: string, filters?: any): Promise<any> {
    const response = await this.client.get('/conversations/search', {
      params: { query, ...filters },
    });
    return response.data;
  }

  // Analytics
  async getAnalytics(params?: {
    timeRange?: string;
    dimensions?: string[];
    metrics?: string[];
  }): Promise<any> {
    const response = await this.client.get('/analytics', { params });
    return response.data;
  }

  // Settings and preferences
  async getUserPreferences(): Promise<any> {
    const response = await this.client.get('/auth/me');
    return response.data.user.preferences;
  }

  async updateUserPreferences(preferences: any): Promise<any> {
    const response = await this.client.put('/auth/me', { preferences });
    return response.data.user;
  }

  // Error handling helper
  isNetworkError(error: any): boolean {
    return !error.response && error.code === 'NETWORK_ERROR';
  }

  isTimeoutError(error: any): boolean {
    return error.code === 'ECONNABORTED' || error.message.includes('timeout');
  }

  isServerError(error: any): boolean {
    return error.response?.status >= 500;
  }

  isClientError(error: any): boolean {
    return error.response?.status >= 400 && error.response?.status < 500;
  }

  getErrorMessage(error: any): string {
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    if (error.message) {
      return error.message;
    }
    return 'An unexpected error occurred';
  }
}

// Create singleton instance
export const apiService = new ApiService();

// Initialize with token from localStorage if available
apiService.restoreToken();

export default apiService;