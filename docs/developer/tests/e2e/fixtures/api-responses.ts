/**
 * Mock API responses for E2E testing
 * Simulates backend responses for cognitive graph operations
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
  requestId: string;
}

/**
 * Mock cognitive analysis API response
 */
export const mockCognitiveAnalysisResponse: ApiResponse<{
  graph: any;
  dimensions: {
    factual: { confidence: number; accuracy: number };
    logical: { confidence: number; precision: number };
    creative: { confidence: number; novelty: number };
    metacognitive: { confidence: number; awareness: number };
  };
  metadata: {
    processingTime: number;
    modelVersion: string;
    accuracy: number;
  };
}> = {
  success: true,
  data: {
    graph: {
      id: 'analysis-001',
      nodes: [
        {
          id: 'node-001',
          type: 'factual_retrieval',
          content: 'Extracted factual information from user query',
          confidence: 0.92,
          position: { x: 0, y: 0, z: 0 },
          color: '#4CAF50',
          radius: 1.2,
        },
        {
          id: 'node-002',
          type: 'logical_inference',
          content: 'Inferred user intent and requirements',
          confidence: 0.85,
          position: { x: 3, y: 1, z: -1 },
          color: '#2196F3',
          radius: 1.0,
        },
      ],
      edges: [
        {
          id: 'edge-001',
          source: 'node-001',
          target: 'node-002',
          type: 'semantic',
          strength: 0.8,
          confidence: 0.9,
        },
      ],
    },
    dimensions: {
      factual: { confidence: 0.92, accuracy: 0.89 },
      logical: { confidence: 0.85, precision: 0.82 },
      creative: { confidence: 0.78, novelty: 0.75 },
      metacognitive: { confidence: 0.96, awareness: 0.94 },
    },
    metadata: {
      processingTime: 1250,
      modelVersion: 'v2.1.0',
      accuracy: 0.91,
    },
  },
  timestamp: Date.now(),
  requestId: 'req-001',
};

/**
 * Mock conversation processing response
 */
export const mockConversationProcessingResponse: ApiResponse<{
  analysis: any;
  suggestions: string[];
  confidence: number;
}> = {
  success: true,
  data: {
    analysis: {
      sentiment: 'positive',
      complexity: 'medium',
      topics: ['machine learning', 'algorithms'],
      cognitiveLoad: 0.65,
    },
    suggestions: [
      'Provide more specific examples',
      'Include practical use cases',
      'Add visual representations',
    ],
    confidence: 0.87,
  },
  timestamp: Date.now(),
  requestId: 'req-002',
};

/**
 * Mock export responses
 */
export const mockExportResponses = {
  json: {
    success: true,
    data: {
      url: '/api/exports/cognitive-graph-001.json',
      filename: 'cognitive-graph-001.json',
      size: 1536,
      downloadUrl: 'http://localhost:3000/downloads/cognitive-graph-001.json',
    },
    timestamp: Date.now(),
    requestId: 'req-export-001',
  },
  png: {
    success: true,
    data: {
      url: '/api/exports/cognitive-graph-001.png',
      filename: 'cognitive-graph-001.png',
      size: 2048576,
      dimensions: { width: 1920, height: 1080 },
      downloadUrl: 'http://localhost:3000/downloads/cognitive-graph-001.png',
    },
    timestamp: Date.now(),
    requestId: 'req-export-002',
  },
  svg: {
    success: true,
    data: {
      url: '/api/exports/cognitive-graph-001.svg',
      filename: 'cognitive-graph-001.svg',
      size: 8192,
      downloadUrl: 'http://localhost:3000/downloads/cognitive-graph-001.svg',
    },
    timestamp: Date.now(),
    requestId: 'req-export-003',
  },
};

/**
 * Mock real-time update responses
 */
export const mockRealTimeUpdateResponse: ApiResponse<{
  updateType: 'node_added' | 'node_updated' | 'edge_added' | 'edge_removed';
  element: any;
  timestamp: number;
}> = {
  success: true,
  data: {
    updateType: 'node_added',
    element: {
      id: 'node-new-001',
      type: 'creative_synthesis',
      content: 'New cognitive insight generated',
      confidence: 0.75,
      position: { x: 5, y: 2, z: 1 },
      color: '#FF9800',
      radius: 0.9,
    },
    timestamp: Date.now(),
  },
  timestamp: Date.now(),
  requestId: 'req-update-001',
};

/**
 * Mock error responses
 */
export const mockErrorResponses = {
  invalidInput: {
    success: false,
    error: 'Invalid input data provided',
    timestamp: Date.now(),
    requestId: 'req-error-001',
  },
  processingFailed: {
    success: false,
    error: 'Cognitive analysis processing failed',
    timestamp: Date.now(),
    requestId: 'req-error-002',
  },
  networkTimeout: {
    success: false,
    error: 'Request timeout: cognitive processing took too long',
    timestamp: Date.now(),
    requestId: 'req-error-003',
  },
  exportFailed: {
    success: false,
    error: 'Export generation failed: insufficient memory',
    timestamp: Date.now(),
    requestId: 'req-error-004',
  },
};

/**
 * Mock WebSocket messages for real-time testing
 */
export const mockWebSocketMessages = {
  cognitiveUpdate: {
    type: 'cognitive_update',
    payload: {
      graphId: 'graph-001',
      updates: [
        {
          type: 'node_added',
          node: {
            id: 'node-003',
            type: 'meta_cognition',
            content: 'User shows increased understanding',
            confidence: 0.91,
          },
        },
      ],
    },
    timestamp: Date.now(),
  },
  performanceUpdate: {
    type: 'performance_update',
    payload: {
      fps: 185,
      memory: 234,
      nodeCount: 25,
      edgeCount: 40,
    },
    timestamp: Date.now(),
  },
  interactionEvent: {
    type: 'interaction_event',
    payload: {
      eventType: 'node_click',
      nodeId: 'node-001',
      timestamp: Date.now(),
      coordinates: { x: 150, y: 200 },
    },
  },
};

/**
 * Mock authentication responses
 */
export const mockAuthResponses = {
  login: {
    success: true,
    data: {
      user: {
        id: 'user-001',
        name: 'Test User',
        email: 'test@example.com',
        role: 'researcher',
      },
      token: 'mock-jwt-token-12345',
      expiresIn: 3600,
    },
    timestamp: Date.now(),
    requestId: 'req-auth-001',
  },
  refresh: {
    success: true,
    data: {
      token: 'mock-jwt-token-refreshed-67890',
      expiresIn: 3600,
    },
    timestamp: Date.now(),
    requestId: 'req-auth-002',
  },
  logout: {
    success: true,
    data: {
      message: 'Successfully logged out',
    },
    timestamp: Date.now(),
    requestId: 'req-auth-003',
  },
};