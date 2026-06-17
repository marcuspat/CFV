/**
 * ElementList — scrollable list of cognitive elements with type colour
 * coding and confidence score. Clicking an element selects its 3D node.
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

interface ElementListProps {
  elements: CognitiveElement[];
  selectedNode?: string;
  onNodeClick: (nodeId: string) => void;
}

export default function ElementList({ elements, selectedNode, onNodeClick }: ElementListProps) {
  return (
    <div className="element-list">
      <h3 className="panel-title">
        Cognitive Elements <span className="panel-count">{elements.length}</span>
      </h3>
      <div className="element-list-scroll">
        {elements.map((el) => {
          const color = DIM_COLORS[el.type] ?? '#757575';
          const confidence = Math.round((el.confidence ?? 0) * 100);
          const isSelected = el.id === selectedNode;
          return (
            <button
              key={el.id}
              type="button"
              className={`element-item${isSelected ? ' element-item--selected' : ''}`}
              style={{ borderLeftColor: color }}
              onClick={() => onNodeClick(el.id)}
            >
              <div className="element-item-head">
                <span className="element-type" style={{ color }}>
                  {dimLabel(el.type)}
                </span>
                <span className="element-confidence">{confidence}%</span>
              </div>
              <div className="element-content">{el.content}</div>
              <div className="element-confidence-track">
                <div
                  className="element-confidence-fill"
                  style={{ width: `${confidence}%`, backgroundColor: color }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
