/**
 * Main Cognitive Fabric Dashboard Component
 * Integrates all visualizations and controls
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import CognitiveVisualization3D from './CognitiveVisualization3D';
import CognitiveTimeline from './CognitiveTimeline';
import {
  Conversation,
  CognitiveAnalysisResult,
  VisualizationState,
  AnalysisState,
  PerformanceMetrics,
  CognitiveDimension,
  VisualizationType,
  ProcessingStatus,
} from '../types/cognitive';
import { apiService } from '../services/apiService';
import { webSocketService } from '../services/webSocketService';

interface CognitiveDashboardProps {
  conversation: Conversation;
}

export default function CognitiveDashboard({ conversation }: CognitiveDashboardProps) {
  // State management
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    conversationId: conversation.id,
    status: conversation.processingStatus,
    progress: 0,
    currentStep: '',
  });

  const [visualizationState, setVisualizationState] = useState<VisualizationState>({
    selectedVisualization: VisualizationType.THREE_D_GRAPH,
    filters: [],
    cameraPosition: { x: 30, y: 30, z: 30 },
    isPlaying: false,
    playbackSpeed: 1.0,
    currentTime: 0,
  });

  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    frameTime: 0,
    memoryUsage: 0,
    renderTime: 0,
    nodeCount: 0,
    edgeCount: 0,
  });

  const [selectedNode, setSelectedNode] = useState<string | undefined>();
  const [hoveredNode, setHoveredNode] = useState<string | undefined>();
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  // Refs
  const timelineRef = useRef<HTMLDivElement>(null);
  const visualizationRef = useRef<HTMLDivElement>(null);

  // Start analysis when component mounts
  useEffect(() => {
    if (conversation.processingStatus === 'pending') {
      startAnalysis();
    }
  }, [conversation.id]);

  // WebSocket event handlers
  useEffect(() => {
    const handleAnalysisProgress = (data: any) => {
      setAnalysisState(prev => ({
        ...prev,
        progress: data.progress,
        currentStep: data.currentStep,
        status: ProcessingStatus.PROCESSING,
      }));
    };

    const handleAnalysisComplete = (data: any) => {
      setAnalysisState(prev => ({
        ...prev,
        status: ProcessingStatus.COMPLETED,
        result: data.result,
        progress: 100,
      }));
    };

    const handleCognitiveElementAdded = (data: any) => {
      if (analysisState.result) {
        // Add new cognitive element to existing result
        setAnalysisState(prev => ({
          ...prev,
          result: prev.result ? {
            ...prev.result,
            elements: [...prev.result.elements, data.element],
            graph: {
              ...prev.result.graph,
              nodes: [...prev.result.graph.nodes, /* new node from element */],
            },
          } : undefined,
        }));
      }
    };

    const handleVisualizationUpdate = (data: any) => {
      // Handle real-time visualization updates
      console.log('Visualization update:', data);
    };

    // Subscribe to WebSocket events
    webSocketService.subscribe('analysis_progress', handleAnalysisProgress);
    webSocketService.subscribe('analysis_complete', handleAnalysisComplete);
    webSocketService.subscribe('cognitive_element_added', handleCognitiveElementAdded);
    webSocketService.subscribe('visualization_update', handleVisualizationUpdate);

    return () => {
      webSocketService.unsubscribe('analysis_progress', handleAnalysisProgress);
      webSocketService.unsubscribe('analysis_complete', handleAnalysisComplete);
      webSocketService.unsubscribe('cognitive_element_added', handleCognitiveElementAdded);
      webSocketService.unsubscribe('visualization_update', handleVisualizationUpdate);
    };
  }, [analysisState.result, conversation.id]);

  // Start cognitive analysis
  const startAnalysis = useCallback(async () => {
    try {
      setAnalysisState(prev => ({ ...prev, status: ProcessingStatus.PROCESSING, currentStep: 'Starting analysis...' }));

      const response = await apiService.startAnalysis({
        conversationId: conversation.id,
        options: {
          includeRealTime: true,
          detailLevel: 'comprehensive',
        },
      });

      setAnalysisState(prev => ({
        ...prev,
        analysisId: response.analysisId,
        status: ProcessingStatus.PROCESSING,
      }));

      // Subscribe to WebSocket for real-time updates
      webSocketService.subscribeToConversation(conversation.id);

    } catch (error) {
      console.error('Failed to start analysis:', error);
      setAnalysisState(prev => ({
        ...prev,
        status: ProcessingStatus.FAILED,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [conversation.id]);

  // Handle node interactions
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNode(nodeId === selectedNode ? undefined : nodeId);
  }, [selectedNode]);

  const handleNodeHover = useCallback((nodeId?: string) => {
    setHoveredNode(nodeId);
  }, []);

  // Handle visualization state changes
  const handleStateChange = useCallback((updates: Partial<VisualizationState>) => {
    setVisualizationState(prev => ({ ...prev, ...updates }));
  }, []);

  // Handle performance updates
  const handlePerformanceUpdate = useCallback((metrics: PerformanceMetrics) => {
    setPerformanceMetrics(metrics);
  }, []);

  // Handle timeline navigation
  const handleTimeChange = useCallback((time: number) => {
    setVisualizationState(prev => ({ ...prev, currentTime: time }));
  }, []);

  // Get selected node details
  const selectedNodeDetails = useMemo(() => {
    if (!selectedNode || !analysisState.result) return null;

    const element = analysisState.result.elements.find(e => e.id === selectedNode);
    if (!element) return null;

    return {
      element,
      connections: analysisState.result.elements.filter(e =>
        element.connections?.includes(e.id) ||
        e.connections?.includes(element.id)
      ),
    };
  }, [selectedNode, analysisState.result]);

  // Calculate overall metrics
  const overallMetrics = useMemo(() => {
    if (!analysisState.result) return null;

    const { overall, byDimension } = analysisState.result.metrics;

    return {
      overall,
      dimensions: Object.entries(byDimension).map(([dimension, metrics]: [string, any]) => ({
        dimension: dimension as CognitiveDimension,
        confidence: metrics.confidence,
        accuracy: metrics.accuracy,
        noveltyScore: metrics.noveltyScore,
        selfAwareness: metrics.selfAwareness,
      })),
    };
  }, [analysisState.result]);

  return (
    <div className="cognitive-dashboard" style={{ display: 'flex', height: '100vh', backgroundColor: '#0a0a0a' }}>
      {/* Main visualization area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '20px',
          backgroundColor: '#1a1a1a',
          borderBottom: '1px solid #333'
        }}>
          <h1 style={{ color: '#ffffff', margin: 0, fontSize: '24px' }}>
            {conversation.title}
          </h1>
          <p style={{ color: '#cccccc', margin: '5px 0 0 0' }}>
            {conversation.metadata.domain && `${conversation.metadata.domain} • `}
            {conversation.metadata.language} •
            {conversation.transcript.length} transcript entries
          </p>
        </div>

        {/* Visualization controls */}
        <div style={{
          padding: '15px 20px',
          backgroundColor: '#1a1a1a',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: '20px'
        }}>
          <select
            value={visualizationState.selectedVisualization}
            onChange={(e) => handleStateChange({ selectedVisualization: e.target.value as any })}
            style={{
              padding: '8px 12px',
              backgroundColor: '#2a2a2a',
              color: '#ffffff',
              border: '1px solid #444',
              borderRadius: '4px',
            }}
          >
            <option value="3d_graph">3D Cognitive Graph</option>
            <option value="cognitive_timeline">Cognitive Timeline</option>
            <option value="dimension_heatmap">Dimension Heatmap</option>
            <option value="confidence_overlay">Confidence Overlay</option>
          </select>

          <button
            onClick={() => handleStateChange({ isPlaying: !visualizationState.isPlaying })}
            style={{
              padding: '8px 16px',
              backgroundColor: visualizationState.isPlaying ? '#f44336' : '#4CAF50',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {visualizationState.isPlaying ? 'Pause' : 'Play'}
          </button>

          <div style={{ flex: 1 }} />

          {/* Performance metrics */}
          <div style={{
            display: 'flex',
            gap: '15px',
            fontSize: '12px',
            color: '#cccccc'
          }}>
            <span>FPS: {performanceMetrics.fps.toFixed(0)}</span>
            <span>Nodes: {performanceMetrics.nodeCount}</span>
            <span>Memory: {performanceMetrics.memoryUsage.toFixed(1)}MB</span>
          </div>
        </div>

        {/* Main visualization */}
        <div style={{ flex: 1, position: 'relative' }} ref={visualizationRef}>
          {analysisState.result && (
            <>
              {visualizationState.selectedVisualization === '3d_graph' && (
                <CognitiveVisualization3D
                  graph={analysisState.result.graph}
                  state={visualizationState}
                  onStateChange={handleStateChange}
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  onPerformanceUpdate={handlePerformanceUpdate}
                />
              )}

              {visualizationState.selectedVisualization === 'cognitive_timeline' && (
                <CognitiveTimeline
                  metrics={analysisState.result.metrics}
                  currentTime={visualizationState.currentTime}
                  onTimeChange={handleTimeChange}
                  width={visualizationRef.current?.clientWidth || 800}
                  height={visualizationRef.current?.clientHeight || 600}
                />
              )}

              {/* Other visualization types would be implemented similarly */}
            </>
          )}

          {/* Analysis status overlay */}
          {analysisState.status === 'processing' && (
            <div style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              padding: '15px 20px',
              borderRadius: '8px',
              border: '1px solid #444',
            }}>
              <h3 style={{ color: '#ffffff', margin: '0 0 10px 0' }}>
                Processing Analysis
              </h3>
              <div style={{ color: '#cccccc', marginBottom: '10px' }}>
                {analysisState.currentStep}
              </div>
              <div style={{
                width: '200px',
                height: '4px',
                backgroundColor: '#333',
                borderRadius: '2px',
                overflow: 'hidden',
              }}>
                <div
                  style={{
                    width: `${analysisState.progress}%`,
                    height: '100%',
                    backgroundColor: '#4CAF50',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div style={{ color: '#cccccc', fontSize: '12px', marginTop: '5px' }}>
                {analysisState.progress.toFixed(1)}% Complete
              </div>
            </div>
          )}

          {/* Node details tooltip */}
          {hoveredNode && analysisState.result && (
            <div style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              padding: '15px',
              borderRadius: '8px',
              border: '1px solid #444',
              maxWidth: '300px',
            }}>
              {(() => {
                const element = analysisState.result!.elements.find(e => e.id === hoveredNode);
                if (!element) return null;

                return (
                  <>
                    <h4 style={{ color: '#ffffff', margin: '0 0 8px 0' }}>
                      {element.type.replace('_', ' ').toUpperCase()}
                    </h4>
                    <div style={{ color: '#cccccc', fontSize: '12px' }}>
                      <div>Confidence: {(element.confidence * 100).toFixed(1)}%</div>
                      <div>Time: {element.timestamp.toLocaleTimeString()}</div>
                      <div style={{ marginTop: '8px', fontStyle: 'italic' }}>
                        {element.content.substring(0, 100)}
                        {element.content.length > 100 && '...'}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      {isPanelOpen && (
        <div style={{
          width: '350px',
          backgroundColor: '#1a1a1a',
          borderLeft: '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '20px',
            borderBottom: '1px solid #333',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <h2 style={{ color: '#ffffff', margin: 0, fontSize: '18px' }}>
              Analysis Details
            </h2>
            <button
              onClick={() => setIsPanelOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#cccccc',
                fontSize: '18px',
                cursor: 'pointer',
                padding: '0',
                width: '24px',
                height: '24px',
              }}
            >
              ×
            </button>
          </div>

          {/* Overall metrics */}
          {overallMetrics && (
            <div style={{ padding: '20px', borderBottom: '1px solid #333' }}>
              <h3 style={{ color: '#ffffff', margin: '0 0 15px 0', fontSize: '16px' }}>
                Overall Performance
              </h3>
              {Object.entries(overallMetrics.overall).map(([dimension, score]) => (
                <div key={dimension} style={{ marginBottom: '12px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '4px',
                    fontSize: '12px',
                    color: '#cccccc'
                  }}>
                    <span>{dimension.replace('_', ' ').toUpperCase()}</span>
                    <span>{(score * 100).toFixed(1)}%</span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '6px',
                    backgroundColor: '#333',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}>
                    <div
                      style={{
                        width: `${score * 100}%`,
                        height: '100%',
                        backgroundColor: score >= 0.8 ? '#4CAF50' :
                                       score >= 0.6 ? '#FFC107' : '#F44336',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected node details */}
          {selectedNodeDetails && (
            <div style={{ padding: '20px', borderBottom: '1px solid #333' }}>
              <h3 style={{ color: '#ffffff', margin: '0 0 15px 0', fontSize: '16px' }}>
                Selected Element
              </h3>
              <div style={{ color: '#cccccc', fontSize: '12px' }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Type:</strong> {selectedNodeDetails.element.type.replace('_', ' ').toUpperCase()}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Confidence:</strong> {(selectedNodeDetails.element.confidence * 100).toFixed(1)}%
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Content:</strong>
                </div>
                <div style={{
                  backgroundColor: '#2a2a2a',
                  padding: '10px',
                  borderRadius: '4px',
                  fontStyle: 'italic',
                  lineHeight: '1.4'
                }}>
                  {selectedNodeDetails.element.content}
                </div>
                {selectedNodeDetails.connections.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <strong>Connections ({selectedNodeDetails.connections.length}):</strong>
                    <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                      {selectedNodeDetails.connections.slice(0, 5).map(conn => (
                        <li key={conn.id}>{conn.type.replace('_', ' ').toUpperCase()}</li>
                      ))}
                      {selectedNodeDetails.connections.length > 5 && (
                        <li>... and {selectedNodeDetails.connections.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Analysis controls */}
          <div style={{ padding: '20px', marginTop: 'auto' }}>
            <button
              onClick={startAnalysis}
              disabled={analysisState.status === 'processing'}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: analysisState.status === 'processing' ? '#666' : '#4CAF50',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: analysisState.status === 'processing' ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              {analysisState.status === 'processing' ? 'Processing...' : 'Restart Analysis'}
            </button>
          </div>
        </div>
      )}

      {/* Panel toggle button */}
      {!isPanelOpen && (
        <button
          onClick={() => setIsPanelOpen(true)}
          style={{
            position: 'absolute',
            right: '20px',
            top: '50%',
            transform: 'translateY(-50%)',
            backgroundColor: '#1a1a1a',
            color: '#cccccc',
            border: '1px solid #444',
            borderLeft: 'none',
            padding: '20px 8px',
            borderRadius: '0 4px 4px 0',
            cursor: 'pointer',
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
          }}
        >
          Details
        </button>
      )}
    </div>
  );
}