/**
 * Cognitive Fabric Visualizer — application root.
 *
 * Phase state machine:  auth → input → analyzing → complete | error
 */
import React, { useCallback, useState } from 'react';
import './App.css';
import { useAuth } from './hooks/useAuth';
import { useAnalysisPipeline } from './hooks/useAnalysisPipeline';
import AuthForm from './components/AuthForm';
import ConversationInput from './components/ConversationInput';
import AnalysisProgress from './components/AnalysisProgress';
import CognitiveDashboard from './components/CognitiveDashboard';

type Phase = 'auth' | 'input' | 'analyzing' | 'complete' | 'error';

function App() {
  const auth = useAuth();
  const pipeline = useAnalysisPipeline();
  const [selectedNode, setSelectedNode] = useState<string | undefined>();

  const phase: Phase = !auth.isAuthenticated
    ? 'auth'
    : pipeline.status === 'completed'
    ? 'complete'
    : pipeline.status === 'failed'
    ? 'error'
    : pipeline.status === 'creating' || pipeline.status === 'processing'
    ? 'analyzing'
    : 'input';

  const handleAnalyze = useCallback(
    (text: string) => {
      setSelectedNode(undefined);
      void pipeline.startPipeline(text);
    },
    [pipeline]
  );

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNode((prev) => (prev === nodeId ? undefined : nodeId));
  }, []);

  const handleReset = useCallback(() => {
    setSelectedNode(undefined);
    pipeline.reset();
  }, [pipeline]);

  const handleLogout = useCallback(() => {
    setSelectedNode(undefined);
    pipeline.reset();
    void auth.logout();
  }, [auth, pipeline]);

  return (
    <div className="app-root">
      {phase === 'auth' && (
        <AuthForm
          onSubmit={auth.login}
          isLoading={auth.isLoading}
          error={auth.error}
        />
      )}

      {phase === 'input' && (
        <ConversationInput
          onSubmit={handleAnalyze}
          isLoading={false}
          onLogout={handleLogout}
        />
      )}

      {phase === 'analyzing' && (
        <AnalysisProgress
          progress={pipeline.progress}
          currentStep={pipeline.currentStep}
        />
      )}

      {phase === 'complete' && pipeline.result && (
        <CognitiveDashboard
          result={pipeline.result}
          onNodeClick={handleNodeClick}
          selectedNode={selectedNode}
          onReset={handleReset}
        />
      )}

      {phase === 'error' && (
        <div className="error-screen">
          <div className="glass-panel error-card">
            <div className="error-mark">!</div>
            <h2 className="error-title">Analysis Failed</h2>
            <p className="error-message">
              {pipeline.error || 'Something went wrong during analysis.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={handleReset}>
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
