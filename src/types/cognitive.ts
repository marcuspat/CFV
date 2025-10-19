/**
 * Core types for Cognitive Fabric Visualizer
 * Four-dimensional cognitive analysis framework
 */

// Cognitive Dimensions
export enum CognitiveDimension {
  FACTUAL_RETRIEVAL = 'factual_retrieval',
  LOGICAL_INFERENCE = 'logical_inference',
  CREATIVE_SYNTHESIS = 'creative_synthesis',
  META_COGNITION = 'meta_cognition'
}

// Performance Targets per Dimension
export interface CognitivePerformanceTargets {
  factual_retrieval: number; // Target: 0.92 accuracy
  logical_inference: number; // Target: 0.85 precision
  creative_synthesis: number; // Target: 0.60 ROUGE-L
  meta_cognition: number; // Target: 0.96 F1-score
}

// Cognitive Element Base
export interface CognitiveElement {
  id: string;
  type: CognitiveDimension;
  content: string;
  confidence: number;
  timestamp: Date;
  position?: Vector3D;
  connections?: string[]; // IDs of connected elements
}

// Specific Cognitive Element Types
export interface FactualRetrievalElement extends CognitiveElement {
  type: CognitiveDimension.FACTUAL_RETRIEVAL;
  entities: Entity[];
  semanticRoles: SemanticRole[];
  knowledgeGraphId?: string;
  verificationScore: number;
}

export interface LogicalInferenceElement extends CognitiveElement {
  type: CognitiveDimension.LOGICAL_INFERENCE;
  premise: string;
  conclusion: string;
  argumentType: ArgumentType;
  causalLinks: CausalLink[];
  logicalStrength: number;
}

export interface CreativeSynthesisElement extends CognitiveElement {
  type: CognitiveDimension.CREATIVE_SYNTHESIS;
  noveltyScore: number;
  counterfactuals: Counterfactual[];
  synthesisType: SynthesisType;
  innovationMarkers: string[];
}

export interface MetaCognitionElement extends CognitiveElement {
  type: CognitiveDimension.META_COGNITION;
  selfCorrection: boolean;
  planningIndicators: string[];
  cognitiveLoad: number;
  strategyMonitoring: StrategyMonitoring[];
}

// Supporting Types
export interface Entity {
  text: string;
  type: EntityType;
  confidence: number;
  start: number;
  end: number;
}

export enum EntityType {
  PERSON = 'PERSON',
  ORGANIZATION = 'ORGANIZATION',
  LOCATION = 'LOCATION',
  DATE = 'DATE',
  CONCEPT = 'CONCEPT',
  EVENT = 'EVENT'
}

export interface SemanticRole {
  role: string;
  entity: string;
  confidence: number;
}

export enum ArgumentType {
  DEDUCTIVE = 'deductive',
  INDUCTIVE = 'inductive',
  ABDUCTIVE = 'abductive',
  ANALOGICAL = 'analogical'
}

export interface CausalLink {
  from: string;
  to: string;
  strength: number;
  type: CausalType;
}

export enum CausalType {
  DIRECT = 'direct',
  INDIRECT = 'indirect',
  BIDIRECTIONAL = 'bidirectional'
}

export interface Counterfactual {
  premise: string;
  outcome: string;
  probability: number;
}

export enum SynthesisType {
  NOVEL_COMBINATION = 'novel_combination',
  METAPHORICAL = 'metaphorical',
  ANALOGICAL = 'analogical',
  REFRAMING = 'reframing'
}

export interface StrategyMonitoring {
  strategy: string;
  effectiveness: number;
  timestamp: Date;
}

// 3D Visualization Types
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
}

export interface CognitiveEdge {
  id: string;
  source: string;
  target: string;
  strength: number;
  type: EdgeType;
  animated?: boolean;
  color?: string;
}

export enum EdgeType {
  CAUSAL = 'causal',
  SEMANTIC = 'semantic',
  TEMPORAL = 'temporal',
  LOGICAL = 'logical',
  STRUCTURAL = 'structural'
}

// Conversation Processing Types
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
  duration: number; // in seconds
  participantCount: number;
  language: string;
  domain?: string;
  tags: string[];
}

export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// API Request/Response Types
export interface ProcessConversationRequest {
  transcript: string[];
  options?: ProcessingOptions;
}

export interface ProcessingOptions {
  includeVisualizations: boolean;
  detailLevel: DetailLevel;
  enableRealTime: boolean;
  customWeights?: Partial<CognitivePerformanceTargets>;
}

export enum DetailLevel {
  SUMMARY = 'summary',
  DETAILED = 'detailed',
  COMPREHENSIVE = 'comprehensive'
}

export interface CognitiveAnalysisResult {
  conversationId: string;
  elements: CognitiveElement[];
  graph: CognitiveGraph;
  metrics: CognitiveMetrics;
  visualizations: VisualizationData[];
  explainability: ExplainabilityData;
}

export interface CognitiveGraph {
  nodes: CognitiveNode[];
  edges: CognitiveEdge[];
  metrics: GraphMetrics;
}

export interface GraphMetrics {
  nodeCount: number;
  edgeCount: number;
  density: number;
  clusteringCoefficient: number;
  averagePathLength: number;
  modularity: number;
}

export interface CognitiveMetrics {
  overall: CognitivePerformanceTargets;
  byDimension: Record<CognitiveDimension, CognitivePerformanceMetrics>;
  temporalEvolution: TemporalMetrics[];
  confidenceDistribution: ConfidenceDistribution;
}

export interface CognitivePerformanceMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  rougeScore?: number;
  confidence: number;
  consistency: number;
  noveltyScore?: number;
  selfAwareness?: number;
}

export interface TemporalMetrics {
  timestamp: Date;
  cognitiveLoad: number;
  dimensionActivity: Record<CognitiveDimension, number>;
  complexityScore: number;
}

export interface ConfidenceDistribution {
  high: number; // > 0.8
  medium: number; // 0.5-0.8
  low: number; // < 0.5
}

export interface VisualizationFilter {
  dimension: string;
  enabled: boolean;
  confidenceRange?: [number, number];
  timeRange?: [Date, Date];
}

export interface VisualizationData {
  id: string;
  type: VisualizationType;
  data: any;
  config: VisualizationConfig;
  lastUpdated?: Date;
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
  exportFormats: ExportFormat[];
  layout?: 'force' | 'hierarchical' | 'circular' | 'grid';
  nodeSize?: 'uniform' | 'weighted' | 'proportional';
  edgeThickness?: 'uniform' | 'weighted';
  filters?: VisualizationFilter[];
  lastUpdated?: Date;
}

export enum ExportFormat {
  PNG = 'png',
  SVG = 'svg',
  JSON = 'json',
  PDF = 'pdf',
  CSV = 'csv'
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
  method: 'lime' | 'shap' | 'attention' | 'custom';
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

// WebSocket Message Types
export interface WebSocketMessage {
  type: MessageType;
  data: any;
  timestamp: Date;
  conversationId?: string;
}

export enum MessageType {
  // Connection management
  CONNECTION_ESTABLISHED = 'connection_established',
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  PING = 'ping',
  PONG = 'pong',
  SUBSCRIPTION_CONFIRMED = 'subscription_confirmed',
  UNSUBSCRIPTION_CONFIRMED = 'unsubscription_confirmed',

  // Conversation updates
  CONVERSATION_UPDATE = 'conversation_update',
  COGNITIVE_ELEMENT_ADDED = 'cognitive_element_added',
  COGNITIVE_ELEMENT_UPDATED = 'cognitive_element_updated',
  PROCESSING_PROGRESS = 'processing_progress',
  ANALYSIS_COMPLETE = 'analysis_complete',
  ANALYSIS_PROGRESS = 'analysis_progress',

  // Visualization updates
  VISUALIZATION_UPDATE = 'visualization_update',

  // Error handling
  ERROR = 'error'
}

// Database Types
export interface DatabaseConfiguration {
  postgres: PostgresConfig;
  neo4j: Neo4jConfig;
  redis: RedisConfig;
}

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
}

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
  maxConnectionPoolSize?: number;
}

export interface RedisConfig {
  url: string;
  keyPrefix?: string;
  ttl?: number;
}