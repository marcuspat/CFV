/**
 * NodeDetail — detail panel shown when a 3D node (cognitive element) is selected.
 */
import React from 'react';
import { CognitiveElement, CognitiveDimension } from '../types/cognitive';

const DIM_COLORS: Record<CognitiveDimension, string> = {
  [CognitiveDimension.FACTUAL_RETRIEVAL]: '#4CAF50',
  [CognitiveDimension.LOGICAL_INFERENCE]: '#2196F3',
  [CognitiveDimension.CREATIVE_SYNTHESIS]: '#FF9800',
  [CognitiveDimension.META_COGNITION]: '#9C27B0',
};

function dimLabel(type: CognitiveDimension): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface NodeDetailProps {
  element: CognitiveElement | null;
  connectionsCount: number;
}

export default function NodeDetail({ element, connectionsCount }: NodeDetailProps) {
  if (!element) {
    return (
      <div className="node-detail node-detail--empty">
        <h3 className="panel-title">Node Detail</h3>
        <p className="node-detail-hint">
          Click a glowing node in the visualization to inspect it.
        </p>
      </div>
    );
  }

  const color = DIM_COLORS[element.type] ?? '#757575';
  const confidence = Math.round((element.confidence ?? 0) * 100);

  return (
    <div className="node-detail" style={{ borderTop: `2px solid ${color}` }}>
      <h3 className="panel-title">Node Detail</h3>
      <div className="node-detail-type" style={{ color }}>
        <span className="dimension-dot" style={{ backgroundColor: color }} />
        {dimLabel(element.type)}
      </div>

      <div className="node-detail-text">{element.content}</div>

      <div className="node-detail-stats">
        <div className="node-detail-stat">
          <span className="node-detail-stat-label">Confidence</span>
          <span className="node-detail-stat-value" style={{ color }}>
            {confidence}%
          </span>
        </div>
        <div className="node-detail-stat">
          <span className="node-detail-stat-label">Connections</span>
          <span className="node-detail-stat-value">{connectionsCount}</span>
        </div>
      </div>
    </div>
  );
}
