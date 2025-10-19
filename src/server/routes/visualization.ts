/**
 * Visualization routes for Cognitive Fabric Visualizer
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from './auth';
import {
  VisualizationData,
  VisualizationType,
  VisualizationConfig,
  ExportFormat,
  GetVisualizationRequest,
  GetVisualizationResponse,
  UpdateVisualizationRequest
} from '../../types';
import { logger } from '../utils/logger';

const router = Router();

// Mock visualization storage
interface StoredVisualization {
  id: string;
  conversationId: string;
  userId: string;
  type: VisualizationType;
  data: VisualizationData;
  config: VisualizationConfig;
  createdAt: Date;
  expiresAt?: Date;
}

const visualizations: StoredVisualization[] = [];

// Get visualization for conversation
router.get('/:conversationId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { conversationId } = req.params;
  const {
    visualizationType = '3d_graph',
    width = 1200,
    height = 800,
    colorScheme = 'cognitive',
    animationEnabled = true
  }: GetVisualizationRequest = req.query as any;

  if (!conversationId) {
    throw new ValidationError('Conversation ID is required');
  }

  // Check if visualization already exists and is not expired
  let storedViz = visualizations.find(v =>
    v.conversationId === conversationId &&
    v.userId === user.id &&
    v.type === visualizationType &&
    (!v.expiresAt || v.expiresAt > new Date())
  );

  // Generate new visualization if not found
  if (!storedViz) {
    const vizData = generateMockVisualization(conversationId, visualizationType, {
      width: Number(width),
      height: Number(height),
      colorScheme,
      animationEnabled,
      interactive: true,
      exportFormats: [ExportFormat.PNG, ExportFormat.SVG, ExportFormat.JSON],
    });

    storedViz = {
      id: uuidv4(),
      conversationId,
      userId: user.id,
      type: visualizationType,
      data: vizData,
      config: {
        width: Number(width),
        height: Number(height),
        colorScheme,
        animationEnabled,
        interactive: true,
        exportFormats: [ExportFormat.PNG, ExportFormat.SVG, ExportFormat.JSON],
      },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };

    visualizations.push(storedViz);

    logger.info('Visualization generated', {
      visualizationId: storedViz.id,
      conversationId,
      userId: user.id,
      type: visualizationType,
    });
  }

  const response: GetVisualizationResponse = {
    visualizationId: storedViz.id,
    data: storedViz.data,
    expiresAt: storedViz.expiresAt,
  };

  res.json(response);
}));

// Update visualization settings
router.put('/:visualizationId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { visualizationId } = req.params;
  const updates: UpdateVisualizationRequest = req.body;

  const vizIndex = visualizations.findIndex(v =>
    v.id === visualizationId && v.userId === user.id
  );

  if (vizIndex === -1) {
    throw new NotFoundError('Visualization not found');
  }

  const storedViz = visualizations[vizIndex];

  // Apply updates
  if (updates.updates) {
    if (updates.updates.layout) {
      storedViz.data.config.layout = updates.updates.layout;
    }
    if (updates.updates.colorScheme) {
      storedViz.config.colorScheme = updates.updates.colorScheme;
    }
    if (updates.updates.nodeSize) {
      storedViz.data.config.nodeSize = updates.updates.nodeSize;
    }
    if (updates.updates.edgeThickness) {
      storedViz.data.config.edgeThickness = updates.updates.edgeThickness;
    }
    if (updates.updates.filters) {
      storedViz.data.config.filters = updates.updates.filters;
    }
  }

  // Update timestamp
  storedViz.data.lastUpdated = new Date();

  logger.info('Visualization updated', {
    visualizationId,
    userId: user.id,
    updates: Object.keys(updates.updates || {}),
  });

  res.json({
    visualizationId: storedViz.id,
    data: storedViz.data,
  });
}));

// Delete visualization
router.delete('/:visualizationId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { visualizationId } = req.params;

  const vizIndex = visualizations.findIndex(v =>
    v.id === visualizationId && v.userId === user.id
  );

  if (vizIndex === -1) {
    throw new NotFoundError('Visualization not found');
  }

  visualizations.splice(vizIndex, 1);

  logger.info('Visualization deleted', {
    visualizationId,
    userId: user.id,
  });

  res.status(204).send();
}));

// Get visualization as rendered image
router.get('/:visualizationId/render', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { visualizationId } = req.params;
  const { format = 'png', quality = 'high' }: { format?: string; quality?: string } = req.query;

  const storedViz = visualizations.find(v =>
    v.id === visualizationId && v.userId === user.id
  );

  if (!storedViz) {
    throw new NotFoundError('Visualization not found');
  }

  // In production, this would generate actual image files
  // For now, return a placeholder URL
  const renderUrl = `/api/visualizations/${visualizationId}/render.${format}?quality=${quality}`;

  logger.info('Visualization render requested', {
    visualizationId,
    userId: user.id,
    format,
    quality,
  });

  res.json({
    renderUrl,
    format,
    quality,
    expiresAt: storedViz.expiresAt,
  });
}));

// List visualization types
router.get('/types/list', asyncHandler(async (req: Request, res: Response) => {
  const types = [
    {
      type: VisualizationType.THREE_D_GRAPH,
      name: '3D Cognitive Graph',
      description: 'Interactive 3D visualization of cognitive elements and their relationships',
      supportedFormats: [ExportFormat.PNG, ExportFormat.SVG, ExportFormat.JSON],
      interactive: true,
      realTime: true,
    },
    {
      type: VisualizationType.COGNITIVE_TIMELINE,
      name: 'Cognitive Timeline',
      description: 'Temporal evolution of cognitive dimensions throughout conversation',
      supportedFormats: [ExportFormat.PNG, ExportFormat.SVG, ExportFormat.PDF],
      interactive: false,
      realTime: false,
    },
    {
      type: VisualizationType.DIMENSION_HEATMAP,
      name: 'Dimension Heatmap',
      description: 'Heat map showing activity levels across cognitive dimensions',
      supportedFormats: [ExportFormat.PNG, ExportFormat.SVG, ExportFormat.JSON],
      interactive: true,
      realTime: false,
    },
    {
      type: VisualizationType.CONFIDENCE_OVERLAY,
      name: 'Confidence Overlay',
      description: 'Visualization showing confidence levels across cognitive elements',
      supportedFormats: [ExportFormat.PNG, ExportFormat.SVG, ExportFormat.JSON],
      interactive: true,
      realTime: false,
    },
    {
      type: VisualizationType.NETWORK_DIAGRAM,
      name: 'Network Diagram',
      description: '2D network diagram of cognitive relationships',
      supportedFormats: [ExportFormat.PNG, ExportFormat.SVG, ExportFormat.JSON],
      interactive: true,
      realTime: true,
    },
  ];

  res.json({
    types,
  });
}));

function generateMockVisualization(
  conversationId: string,
  type: VisualizationType,
  config: VisualizationConfig
): VisualizationData {
  const mockData = {
    [VisualizationType.THREE_D_GRAPH]: {
      nodes: [
        { id: 'node-1', x: 0, y: 0, z: 0, label: 'Factual Element', confidence: 0.92, color: '#4CAF50' },
        { id: 'node-2', x: 10, y: 5, z: -2, label: 'Logical Element', confidence: 0.85, color: '#2196F3' },
        { id: 'node-3', x: -5, y: 8, z: 3, label: 'Creative Element', confidence: 0.72, color: '#FF9800' },
        { id: 'node-4', x: 3, y: -6, z: 1, label: 'Meta Element', confidence: 0.96, color: '#9C27B0' },
      ],
      edges: [
        { source: 'node-1', target: 'node-2', strength: 0.8, animated: true },
        { source: 'node-2', target: 'node-3', strength: 0.6, animated: false },
        { source: 'node-3', target: 'node-4', strength: 0.7, animated: true },
      ],
      layout: 'force',
      physics: {
        enabled: true,
        gravity: -0.5,
        charge: -100,
        linkStrength: 0.5,
      },
    },
    [VisualizationType.COGNITIVE_TIMELINE]: {
      timeline: [
        { time: 0, factual: 0.8, logical: 0.3, creative: 0.1, meta: 0.2 },
        { time: 30, factual: 0.6, logical: 0.7, creative: 0.4, meta: 0.3 },
        { time: 60, factual: 0.4, logical: 0.9, creative: 0.8, meta: 0.6 },
        { time: 90, factual: 0.5, logical: 0.7, creative: 0.9, meta: 0.8 },
      ],
      events: [
        { time: 15, type: 'insight', description: 'Key insight detected' },
        { time: 45, type: 'shift', description: 'Cognitive shift occurred' },
        { time: 75, type: 'synthesis', description: 'Creative synthesis achieved' },
      ],
    },
    [VisualizationType.DIMENSION_HEATMAP]: {
      matrix: [
        [0.8, 0.3, 0.1, 0.2],
        [0.6, 0.7, 0.4, 0.3],
        [0.4, 0.9, 0.8, 0.6],
        [0.5, 0.7, 0.9, 0.8],
      ],
      labels: {
        rows: ['Segment 1', 'Segment 2', 'Segment 3', 'Segment 4'],
        columns: ['Factual', 'Logical', 'Creative', 'Meta'],
      },
      colorScale: 'viridis',
    },
    [VisualizationType.CONFIDENCE_OVERLAY]: {
      confidenceMap: [
        { x: 0, y: 0, confidence: 0.92, dimension: 'factual' },
        { x: 10, y: 5, confidence: 0.85, dimension: 'logical' },
        { x: -5, y: 8, confidence: 0.72, dimension: 'creative' },
        { x: 3, y: -6, confidence: 0.96, dimension: 'meta' },
      ],
      thresholds: {
        high: 0.8,
        medium: 0.6,
        low: 0.0,
      },
    },
    [VisualizationType.NETWORK_DIAGRAM]: {
      nodes: [
        { id: 'n1', label: 'Factual Retrieval', group: 'factual', size: 20, x: 100, y: 100 },
        { id: 'n2', label: 'Logical Inference', group: 'logical', size: 15, x: 200, y: 150 },
        { id: 'n3', label: 'Creative Synthesis', group: 'creative', size: 12, x: 150, y: 250 },
        { id: 'n4', label: 'Meta Cognition', group: 'meta', size: 18, x: 50, y: 200 },
      ],
      edges: [
        { from: 'n1', to: 'n2', width: 3, color: '#666' },
        { from: 'n2', to: 'n3', width: 2, color: '#666' },
        { from: 'n3', to: 'n4', width: 4, color: '#666' },
      ],
      layout: 'forcedirected',
    },
  };

  return {
    id: uuidv4(),
    type,
    data: mockData[type] || mockData[VisualizationType.THREE_D_GRAPH],
    config: {
      ...config,
      lastUpdated: new Date(),
    },
  };
}

export default router;