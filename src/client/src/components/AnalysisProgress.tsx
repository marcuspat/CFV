/**
 * AnalysisProgress — animated progress display while the pipeline runs.
 */
import React from 'react';

interface AnalysisProgressProps {
  progress: number;
  currentStep: string;
  estimatedTime?: number;
}

export default function AnalysisProgress({
  progress,
  currentStep,
  estimatedTime,
}: AnalysisProgressProps) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="progress-screen">
      <div className="glass-panel progress-card">
        <div className="progress-orb">
          <div className="progress-orb-pulse" />
          <div className="progress-orb-core" />
        </div>

        <h2 className="progress-title">Mapping Cognition</h2>
        <p className="progress-step">{currentStep || 'Working…'}</p>

        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="progress-meta">
          <span>{pct}%</span>
          {typeof estimatedTime === 'number' && estimatedTime > 0 && (
            <span>~{Math.ceil(estimatedTime)}s remaining</span>
          )}
        </div>
      </div>
    </div>
  );
}
