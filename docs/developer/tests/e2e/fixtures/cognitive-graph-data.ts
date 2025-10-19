/**
 * Mock cognitive graph data for E2E testing
 * Represents realistic cognitive fabric structures with different dimensions
 */

export interface MockCognitiveNode {
  id: string;
  type: 'factual_retrieval' | 'logical_inference' | 'creative_synthesis' | 'meta_cognition';
  content: string;
  confidence: number;
  position: { x: number; y: number; z: number };
  radius: number;
  color: string;
  opacity: number;
  metadata: {
    timestamp: number;
    source: string;
    complexity: number;
    energy: number;
  };
}

export interface MockCognitiveEdge {
  id: string;
  source: string;
  target: string;
  type: 'causal' | 'semantic' | 'temporal' | 'hierarchical';
  strength: number;
  confidence: number;
  color: string;
  animated?: boolean;
  metadata: {
    timestamp: number;
    weight: number;
    frequency: number;
  };
}

export interface MockCognitiveGraph {
  id: string;
  name: string;
  description: string;
  nodes: MockCognitiveNode[];
  edges: MockCognitiveEdge[];
  metadata: {
    createdAt: number;
    updatedAt: number;
    version: string;
    dimensions: {
      factual: number;
      logical: number;
      creative: number;
      metacognitive: number;
    };
  };
}

/**
 * Small graph for basic testing
 */
export const smallGraph: MockCognitiveGraph = {
  id: 'graph-small-001',
  name: 'Simple Problem Solving',
  description: 'A basic cognitive graph with 5 nodes demonstrating simple problem-solving',
  nodes: [
    {
      id: 'node-001',
      type: 'factual_retrieval',
      content: 'The user is asking about machine learning algorithms',
      confidence: 0.92,
      position: { x: 0, y: 0, z: 0 },
      radius: 1.2,
      color: '#4CAF50',
      opacity: 0.9,
      metadata: {
        timestamp: Date.now() - 5000,
        source: 'nlp',
        complexity: 0.3,
        energy: 0.7,
      },
    },
    {
      id: 'node-002',
      type: 'logical_inference',
      content: 'User likely needs to understand different ML algorithm categories',
      confidence: 0.85,
      position: { x: 3, y: 1, z: -1 },
      radius: 1.0,
      color: '#2196F3',
      opacity: 0.9,
      metadata: {
        timestamp: Date.now() - 4000,
        source: 'inference',
        complexity: 0.6,
        energy: 0.8,
      },
    },
    {
      id: 'node-003',
      type: 'creative_synthesis',
      content: 'Provide examples: supervised, unsupervised, reinforcement learning',
      confidence: 0.78,
      position: { x: 6, y: 0, z: 0 },
      radius: 0.9,
      color: '#FF9800',
      opacity: 0.85,
      metadata: {
        timestamp: Date.now() - 3000,
        source: 'generative',
        complexity: 0.7,
        energy: 0.9,
      },
    },
    {
      id: 'node-004',
      type: 'meta_cognition',
      content: 'User is satisfied with the comprehensive explanation',
      confidence: 0.96,
      position: { x: 4.5, y: -2, z: 1 },
      radius: 1.1,
      color: '#9C27B0',
      opacity: 0.95,
      metadata: {
        timestamp: Date.now() - 2000,
        source: 'sentiment',
        complexity: 0.2,
        energy: 0.6,
      },
    },
    {
      id: 'node-005',
      type: 'factual_retrieval',
      content: 'User asks for specific implementation examples',
      confidence: 0.88,
      position: { x: 7.5, y: -1, z: -2 },
      radius: 1.0,
      color: '#4CAF50',
      opacity: 0.9,
      metadata: {
        timestamp: Date.now() - 1000,
        source: 'nlp',
        complexity: 0.5,
        energy: 0.8,
      },
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
      color: '#666666',
      animated: true,
      metadata: {
        timestamp: Date.now() - 4500,
        weight: 0.8,
        frequency: 1,
      },
    },
    {
      id: 'edge-002',
      source: 'node-002',
      target: 'node-003',
      type: 'causal',
      strength: 0.7,
      confidence: 0.85,
      color: '#2196F3',
      animated: true,
      metadata: {
        timestamp: Date.now() - 3500,
        weight: 0.7,
        frequency: 1,
      },
    },
    {
      id: 'edge-003',
      source: 'node-003',
      target: 'node-004',
      type: 'temporal',
      strength: 0.6,
      confidence: 0.8,
      color: '#FF9800',
      metadata: {
        timestamp: Date.now() - 2500,
        weight: 0.6,
        frequency: 1,
      },
    },
    {
      id: 'edge-004',
      source: 'node-003',
      target: 'node-005',
      type: 'semantic',
      strength: 0.5,
      confidence: 0.75,
      color: '#666666',
      animated: true,
      metadata: {
        timestamp: Date.now() - 1500,
        weight: 0.5,
        frequency: 1,
      },
    },
  ],
  metadata: {
    createdAt: Date.now() - 10000,
    updatedAt: Date.now(),
    version: '1.0.0',
    dimensions: {
      factual: 2,
      logical: 1,
      creative: 1,
      metacognitive: 1,
    },
  },
};

/**
 * Medium graph for performance testing
 */
export const mediumGraph: MockCognitiveGraph = {
  id: 'graph-medium-001',
  name: 'Complex Algorithm Analysis',
  description: 'A medium-sized cognitive graph for performance testing with 25 nodes',
  nodes: Array.from({ length: 25 }, (_, i) => ({
    id: `node-${String(i + 1).padStart(3, '0')}`,
    type: ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition'][i % 4] as MockCognitiveNode['type'],
    content: `Cognitive element ${i + 1} with complex reasoning about machine learning and data structures`,
    confidence: 0.7 + Math.random() * 0.3,
    position: {
      x: Math.cos(i * 0.5) * (5 + Math.random() * 3),
      y: Math.sin(i * 0.5) * (5 + Math.random() * 3),
      z: (Math.random() - 0.5) * 4,
    },
    radius: 0.8 + Math.random() * 0.6,
    color: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0'][i % 4],
    opacity: 0.8 + Math.random() * 0.2,
    metadata: {
      timestamp: Date.now() - (25 - i) * 1000,
      source: ['nlp', 'inference', 'generative', 'sentiment'][i % 4],
      complexity: 0.3 + Math.random() * 0.7,
      energy: 0.5 + Math.random() * 0.5,
    },
  })),
  edges: Array.from({ length: 40 }, (_, i) => ({
    id: `edge-${String(i + 1).padStart(3, '0')}`,
    source: `node-${String(Math.floor(Math.random() * 25) + 1).padStart(3, '0')}`,
    target: `node-${String(Math.floor(Math.random() * 25) + 1).padStart(3, '0')}`,
    type: ['causal', 'semantic', 'temporal', 'hierarchical'][i % 4] as MockCognitiveEdge['type'],
    strength: 0.3 + Math.random() * 0.7,
    confidence: 0.6 + Math.random() * 0.4,
    color: ['#666666', '#2196F3', '#FF9800', '#9C27B0'][i % 4],
    animated: Math.random() > 0.7,
    metadata: {
      timestamp: Date.now() - (40 - i) * 500,
      weight: 0.3 + Math.random() * 0.7,
      frequency: Math.floor(Math.random() * 3) + 1,
    },
  })),
  metadata: {
    createdAt: Date.now() - 30000,
    updatedAt: Date.now(),
    version: '1.0.0',
    dimensions: {
      factual: 7,
      logical: 6,
      creative: 6,
      metacognitive: 6,
    },
  },
};

/**
 * Large graph for stress testing
 */
export const largeGraph: MockCognitiveGraph = {
  id: 'graph-large-001',
  name: 'Research Paper Analysis',
  description: 'A large cognitive graph for stress testing with 100 nodes',
  nodes: Array.from({ length: 100 }, (_, i) => ({
    id: `node-${String(i + 1).padStart(3, '0')}`,
    type: ['factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition'][i % 4] as MockCognitiveNode['type'],
    content: `Complex cognitive element ${i + 1} analyzing advanced concepts in artificial intelligence, machine learning, neural networks, and cognitive science research`,
    confidence: 0.6 + Math.random() * 0.4,
    position: {
      x: Math.cos(i * 0.1) * (10 + Math.random() * 5),
      y: Math.sin(i * 0.1) * (10 + Math.random() * 5),
      z: (Math.random() - 0.5) * 8,
    },
    radius: 0.6 + Math.random() * 0.4,
    color: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0'][i % 4],
    opacity: 0.7 + Math.random() * 0.3,
    metadata: {
      timestamp: Date.now() - (100 - i) * 200,
      source: ['nlp', 'inference', 'generative', 'sentiment'][i % 4],
      complexity: 0.2 + Math.random() * 0.8,
      energy: 0.4 + Math.random() * 0.6,
    },
  })),
  edges: Array.from({ length: 150 }, (_, i) => ({
    id: `edge-${String(i + 1).padStart(3, '0')}`,
    source: `node-${String(Math.floor(Math.random() * 100) + 1).padStart(3, '0')}`,
    target: `node-${String(Math.floor(Math.random() * 100) + 1).padStart(3, '0')}`,
    type: ['causal', 'semantic', 'temporal', 'hierarchical'][i % 4] as MockCognitiveEdge['type'],
    strength: 0.2 + Math.random() * 0.8,
    confidence: 0.5 + Math.random() * 0.5,
    color: ['#666666', '#2196F3', '#FF9800', '#9C27B0'][i % 4],
    animated: Math.random() > 0.8,
    metadata: {
      timestamp: Date.now() - (150 - i) * 100,
      weight: 0.2 + Math.random() * 0.8,
      frequency: Math.floor(Math.random() * 5) + 1,
    },
  })),
  metadata: {
    createdAt: Date.now() - 60000,
    updatedAt: Date.now(),
    version: '1.0.0',
    dimensions: {
      factual: 25,
      logical: 25,
      creative: 25,
      metacognitive: 25,
    },
  },
};

/**
 * Conversation data for testing real-time updates
 */
export const mockConversation = {
  id: 'conversation-001',
  title: 'Machine Learning Discussion',
  messages: [
    {
      id: 'msg-001',
      text: 'What are the main types of machine learning algorithms?',
      timestamp: Date.now() - 10000,
      sender: 'user',
    },
    {
      id: 'msg-002',
      text: 'I can help you understand the main categories of machine learning algorithms. There are three primary types: supervised learning, unsupervised learning, and reinforcement learning.',
      timestamp: Date.now() - 8000,
      sender: 'assistant',
      cognitiveElements: [
        { type: 'factual_retrieval', confidence: 0.92, content: 'Three main types of ML algorithms' },
        { type: 'creative_synthesis', confidence: 0.85, content: 'Provide comprehensive explanation' },
      ],
    },
    {
      id: 'msg-003',
      text: 'Can you give me specific examples of each type?',
      timestamp: Date.now() - 6000,
      sender: 'user',
    },
    {
      id: 'msg-004',
      text: 'Certainly! For supervised learning: linear regression, decision trees. For unsupervised learning: k-means clustering, PCA. For reinforcement learning: Q-learning, deep Q-networks.',
      timestamp: Date.now() - 4000,
      sender: 'assistant',
      cognitiveElements: [
        { type: 'factual_retrieval', confidence: 0.88, content: 'Specific algorithm examples' },
        { type: 'logical_inference', confidence: 0.82, content: 'Categorize examples by type' },
      ],
    },
  ],
};

/**
 * Performance baseline data
 */
export const performanceBaselines = {
  small: {
    targetFPS: 240,
    acceptableFPS: 180,
    targetMemory: 128,
    acceptableMemory: 256,
    targetLoadTime: 1000,
    acceptableLoadTime: 2000,
  },
  medium: {
    targetFPS: 180,
    acceptableFPS: 120,
    targetMemory: 256,
    acceptableMemory: 384,
    targetLoadTime: 2000,
    acceptableLoadTime: 3000,
  },
  large: {
    targetFPS: 120,
    acceptableFPS: 60,
    targetMemory: 384,
    acceptableMemory: 512,
    targetLoadTime: 3000,
    acceptableLoadTime: 5000,
  },
};

/**
 * Export all fixtures
 */
export const graphFixtures = {
  small: smallGraph,
  medium: mediumGraph,
  large: largeGraph,
};

export const conversationFixtures = {
  basic: mockConversation,
};