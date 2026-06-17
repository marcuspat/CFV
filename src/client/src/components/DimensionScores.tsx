/**
 * DimensionScores — colour-coded bars for the four cognitive dimensions.
 */
import React from 'react';
import { CognitiveDimension } from '../types/cognitive';

const DIM_COLORS: Record<CognitiveDimension, string> = {
  [CognitiveDimension.FACTUAL_RETRIEVAL]: '#4CAF50',
  [CognitiveDimension.LOGICAL_INFERENCE]: '#2196F3',
  [CognitiveDimension.CREATIVE_SYNTHESIS]: '#FF9800',
  [CognitiveDimension.META_COGNITION]: '#9C27B0',
};

const DIM_LABELS: Record<CognitiveDimension, string> = {
  [CognitiveDimension.FACTUAL_RETRIEVAL]: 'Factual Retrieval',
  [CognitiveDimension.LOGICAL_INFERENCE]: 'Logical Inference',
  [CognitiveDimension.CREATIVE_SYNTHESIS]: 'Creative Synthesis',
  [CognitiveDimension.META_COGNITION]: 'Meta Cognition',
};

interface DimensionScoresProps {
  scores: Record<CognitiveDimension, number>;
}

export default function DimensionScores({ scores }: DimensionScoresProps) {
  const order: CognitiveDimension[] = [
    CognitiveDimension.FACTUAL_RETRIEVAL,
    CognitiveDimension.LOGICAL_INFERENCE,
    CognitiveDimension.CREATIVE_SYNTHESIS,
    CognitiveDimension.META_COGNITION,
  ];

  return (
    <div className="dimension-scores">
      <h3 className="panel-title">Cognitive Dimensions</h3>
      {order.map((dim) => {
        const raw = scores?.[dim] ?? 0;
        const pct = Math.round(Math.max(0, Math.min(1, raw)) * 100);
        const color = DIM_COLORS[dim];
        return (
          <div key={dim} className="dimension-row">
            <div className="dimension-row-head">
              <span className="dimension-label">
                <span className="dimension-dot" style={{ backgroundColor: color }} />
                {DIM_LABELS[dim]}
              </span>
              <span className="dimension-value">{pct}</span>
            </div>
            <div className="dimension-track">
              <div
                className="dimension-fill"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${color}99, ${color})`,
                  boxShadow: `0 0 12px ${color}88`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
