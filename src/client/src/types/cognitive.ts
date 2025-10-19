/**
 * Frontend types for Cognitive Fabric Visualizer
 * Synchronized with backend types
 */

export enum CognitiveDimension {
  FACTUAL_RETRIEVAL = 'factual_retrieval',
  LOGICAL_INFERENCE = 'logical_inference',
  CREATIVE_SYNTHESIS = 'creative_synthesis',
  META_COGNITION = 'meta_cognition'
}

export interface CognitiveElement {
  id: string;
  type: CognitiveDimension;
  content: string;
  confidence: number;
  timestamp: Date;
  position?: Vector3D;
  connections?: string[];
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface CognitiveNode {
  id: string;
  position: Vector3D;
  velocity?: Vector3D;
  force?: Vector3D;
  mass: number;
  radius: number;
  element: CognitiveElement;
  color: string;
  opacity: number;
  confidence?: number;
}

export interface CognitiveGraph {
  nodes: CognitiveNode[];
  edges: CognitiveEdge[];
  metrics: GraphMetrics;
}

export interface CognitiveEdge {
  id: string;
  source: string;
  target: string;
  strength: number;
  type: string;
  animated?: boolean;
  color?: string;
}

export interface GraphMetrics {
  nodeCount: number;
  edgeCount: number;
  density: number;
  clusteringCoefficient: number;
  averagePathLength: number;
  modularity: number;
}

export interface Conversation {
  id: string;
  title: string;
  transcript: string[];
  metadata: ConversationMetadata;
  processingStatus: ProcessingStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMetadata {
  duration: number;
  participantCount: number;
  language: string;
  domain?: string;
  tags: string[];
}

export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  pending = 'pending',
  processing = 'processing',
  completed = 'completed',
  failed = 'failed'
}

export interface CognitiveAnalysisResult {
  conversationId: string;
  elements: CognitiveElement[];
  graph: CognitiveGraph;
  metrics: CognitiveMetrics;
  visualizations: VisualizationData[];
  explainability: ExplainabilityData;
}

export interface CognitiveMetrics {
  overall: Record<CognitiveDimension, number>;
  byDimension: Record<CognitiveDimension, any>;
  temporalEvolution: TemporalMetrics[];
  confidenceDistribution: ConfidenceDistribution;
}

export interface TemporalMetrics {
  timestamp: Date;
  cognitiveLoad: number;
  dimensionActivity: Record<CognitiveDimension, number>;
  complexityScore: number;
}

export interface ConfidenceDistribution {
  high: number;
  medium: number;
  low: number;
}

export interface VisualizationData {
  id: string;
  type: VisualizationType;
  data: any;
  config: VisualizationConfig;
}

export enum VisualizationType {
  THREE_D_GRAPH = '3d_graph',
  COGNITIVE_TIMELINE = 'cognitive_timeline',
  DIMENSION_HEATMAP = 'dimension_heatmap',
  CONFIDENCE_OVERLAY = 'confidence_overlay',
  NETWORK_DIAGRAM = 'network_diagram'
}

export interface VisualizationConfig {
  width: number;
  height: number;
  colorScheme: string;
  animationEnabled: boolean;
  interactive: boolean;
  exportFormats: string[];
  layout?: string;
  nodeSize?: string;
  edgeThickness?: string;
  filters?: VisualizationFilter[];
  lastUpdated?: Date;
}

export interface VisualizationFilter {
  dimension: string;
  enabled: boolean;
  confidenceRange?: [number, number];
  timeRange?: [Date, Date];
}

export interface ExplainabilityData {
  featureImportance: FeatureImportance[];
  decisionPaths: DecisionPath[];
  modelExplanations: ModelExplanation[];
  userFeedback: UserFeedback[];
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  dimension: CognitiveDimension;
}

export interface DecisionPath {
  id: string;
  steps: DecisionStep[];
  confidence: number;
  outcome: string;
}

export interface DecisionStep {
  operation: string;
  input: any;
  output: any;
  confidence: number;
}

export interface ModelExplanation {
  model: string;
  method: string;
  explanation: any;
  fidelity: number;
}

export interface UserFeedback {
  userId: string;
  elementId: string;
  rating: number;
  comment: string;
  timestamp: Date;
}

// UI State Types
export interface VisualizationState {
  selectedVisualization: VisualizationType;
  filters: VisualizationFilter[];
  cameraPosition: Vector3D;
  selectedNode?: string;
  hoveredNode?: string;
  isPlaying: boolean;
  playbackSpeed: number;
  currentTime: number;
}

export interface AnalysisState {
  conversationId: string;
  analysisId?: string;
  status: ProcessingStatus;
  progress: number;
  currentStep: string;
  result?: CognitiveAnalysisResult;
  error?: string;
}

export interface AuthState {
  user?: {
    id: string;
    email: string;
    username: string;
    fullName: string;
    role: string;
  };
  token?: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  error?: string;
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: Date;
  conversationId?: string;
}

// Performance Metrics
export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  renderTime: number;
  nodeCount: number;
  edgeCount: number;
}

// Color Schemes
export interface ColorScheme {
  name: string;
  colors: Record<CognitiveDimension, string>;
  background: string;
  grid: string;
  highlight: string;
}

export const defaultColorSchemes: ColorScheme[] = [
  {
    name: 'cognitive',
    colors: {
      [CognitiveDimension.FACTUAL_RETRIEVAL]: '#4CAF50',
      [CognitiveDimension.LOGICAL_INFERENCE]: '#2196F3',
      [CognitiveDimension.CREATIVE_SYNTHESIS]: '#FF9800',
      [CognitiveDimension.META_COGNITION]: '#9C27B0',
    },
    background: '#0a0a0a',
    grid: '#333333',
    highlight: '#ffffff',
  },
  {
    name: 'ocean',
    colors: {
      [CognitiveDimension.FACTUAL_RETRIEVAL]: '#00BCD4',
      [CognitiveDimension.LOGICAL_INFERENCE]: '#3F51B5',
      [CognitiveDimension.CREATIVE_SYNTHESIS]: '#009688',
      [CognitiveDimension.META_COGNITION]: '#607D8B',
    },
    background: '#001f3f',
    grid: '#003366',
    highlight: '#66ccff',
  },
  {
    name: 'sunset',
    colors: {
      [CognitiveDimension.FACTUAL_RETRIEVAL]: '#FF5722',
      [CognitiveDimension.LOGICAL_INFERENCE]: '#FFC107',
      [CognitiveDimension.CREATIVE_SYNTHESIS]: '#E91E63',
      [CognitiveDimension.META_COGNITION]: '#9C27B0',
    },
    background: '#1a0a0a',
    grid: '#4a2a2a',
    highlight: '#ffcc66',
  },
];