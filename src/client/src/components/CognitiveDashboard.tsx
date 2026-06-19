/**
 * CognitiveDashboard — two-panel results view.
 *
 *   left  : full-height 3D cognitive visualization
 *   right : dimension scores + element list + node detail
 */
import React, { useState, useMemo, useCallback } from 'react';
import CognitiveVisualization3D from './CognitiveVisualization3D';
import DimensionScores from './DimensionScores';
import ElementList from './ElementList';
import NodeDetail from './NodeDetail';
import {
  CognitiveAnalysisResult,
  VisualizationState,
  VisualizationType,
  PerformanceMetrics,
} from '../types/cognitive';

interface CognitiveDashboardProps {
  result: CognitiveAnalysisResult;
  onNodeClick: (nodeId: string) => void;
  selectedNode?: string;
  onReset?: () => void;
}

export default function CognitiveDashboard({
  result,
  onNodeClick,
  selectedNode,
  onReset,
}: CognitiveDashboardProps) {
  const [hoveredNode, setHoveredNode] = useState<string | undefined>();
  const [perf, setPerf] = useState<PerformanceMetrics>({
    fps: 0,
    frameTime: 0,
    memoryUsage: 0,
    renderTime: 0,
    nodeCount: 0,
    edgeCount: 0,
  });
  const [vizState, setVizState] = useState<VisualizationState>({
    selectedVisualization: VisualizationType.THREE_D_GRAPH,
    filters: [],
    cameraPosition: { x: 30, y: 30, z: 30 },
    isPlaying: true,
    playbackSpeed: 1.0,
    currentTime: 0,
  });

  const handleStateChange = useCallback((updates: Partial<VisualizationState>) => {
    setVizState((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleNodeHover = useCallback((nodeId?: string) => {
    setHoveredNode(nodeId);
  }, []);

  const handlePerf = useCallback((metrics: PerformanceMetrics) => {
    setPerf(metrics);
  }, []);

  // Merge external selection into the visualization state.
  const mergedState = useMemo<VisualizationState>(
    () => ({ ...vizState, selectedNode, hoveredNode }),
    [vizState, selectedNode, hoveredNode]
  );

  const selectedElement = useMemo(
    () => result.elements.find((e) => e.id === selectedNode) ?? null,
    [result.elements, selectedNode]
  );

  const connectionsCount = selectedElement?.connections?.length ?? 0;

  return (
    <div className="dashboard">
      {/* Left: 3D visualization */}
      <div className="dashboard-viz">
        <CognitiveVisualization3D
          graph={result.graph}
          state={mergedState}
          onStateChange={handleStateChange}
          onNodeClick={onNodeClick}
          onNodeHover={handleNodeHover}
          onPerformanceUpdate={handlePerf}
        />

        <div className="viz-hud glass-panel">
          <span className="viz-hud-stat">
            <strong>{perf.fps}</strong> fps
          </span>
          <span className="viz-hud-stat">
            <strong>{result.graph.nodes.length}</strong> nodes
          </span>
          <span className="viz-hud-stat">
            <strong>{result.graph.edges.length}</strong> edges
          </span>
        </div>

        {onReset && (
          <button type="button" className="btn btn-ghost viz-reset" onClick={onReset}>
            ← New analysis
          </button>
        )}
      </div>

      {/* Right: analysis panels */}
      <aside className="dashboard-panel">
        <div className="glass-panel panel-section">
          <DimensionScores scores={result.metrics.overall} />
        </div>

        <div className="glass-panel panel-section">
          <NodeDetail element={selectedElement} connectionsCount={connectionsCount} />
        </div>

        <div className="glass-panel panel-section panel-section--grow">
          <ElementList
            elements={result.elements}
            selectedNode={selectedNode}
            onNodeClick={onNodeClick}
          />
        </div>
      </aside>
    </div>
  );
}
