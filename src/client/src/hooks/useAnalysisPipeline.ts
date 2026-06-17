/**
 * useAnalysisPipeline — drives the full cognitive-analysis pipeline:
 *
 *   createConversation()
 *     -> startAnalysis(conversationId, conversationText)
 *       -> poll getAnalysisStatus(analysisId) every 2s until completed/failed
 *         -> getAnalysisResult(analysisId)
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { apiService } from '../services/apiService';
import { CognitiveAnalysisResult } from '../types';

export type PipelineStatus =
  | 'idle'
  | 'creating'
  | 'processing'
  | 'completed'
  | 'failed';

interface UseAnalysisPipelineResult {
  startPipeline: (conversationText: string) => Promise<void>;
  result: CognitiveAnalysisResult | null;
  status: PipelineStatus;
  progress: number;
  currentStep: string;
  error: string | null;
  reset: () => void;
}

const POLL_INTERVAL_MS = 2000;

function deriveTitle(text: string): string {
  const firstLine = text.trim().split('\n')[0] || 'Conversation';
  const words = firstLine.trim().split(/\s+/).slice(0, 8).join(' ');
  return words.length > 60 ? `${words.slice(0, 57)}...` : words || 'Conversation';
}

function toTranscript(text: string): string[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines : [text.trim()];
}

export function useAnalysisPipeline(): UseAnalysisPipelineResult {
  const [result, setResult] = useState<CognitiveAnalysisResult | null>(null);
  const [status, setStatus] = useState<PipelineStatus>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Cancellation token — bumped on reset/unmount so in-flight polls bail out.
  const runIdRef = useRef<number>(0);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setResult(null);
    setStatus('idle');
    setProgress(0);
    setCurrentStep('');
    setError(null);
  }, []);

  // Cancel any in-flight polling when the hook unmounts.
  useEffect(() => {
    return () => {
      runIdRef.current += 1;
    };
  }, []);

  const startPipeline = useCallback(async (conversationText: string) => {
    const text = conversationText.trim();
    if (!text) {
      setStatus('failed');
      setError('Conversation text is required.');
      return;
    }

    runIdRef.current += 1;
    const runId = runIdRef.current;
    const isStale = () => runId !== runIdRef.current;

    setResult(null);
    setError(null);
    setProgress(0);
    setStatus('creating');
    setCurrentStep('Creating conversation...');

    try {
      // 1. Create the conversation record.
      const created = await apiService.createConversation({
        title: deriveTitle(text),
        transcript: toTranscript(text),
        metadata: { language: 'en', tags: ['cfv-frontend'] },
      });
      if (isStale()) return;

      // 2. Kick off the analysis job.
      setStatus('processing');
      setCurrentStep('Starting cognitive analysis...');
      const started = await apiService.startAnalysis({
        conversationId: created.conversationId,
        conversationText: text,
        options: { includeRealTime: false, detailLevel: 'comprehensive' },
      });
      if (isStale()) return;

      const analysisId = started.analysisId;

      // 3. Poll status until terminal state.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (isStale()) return;
        const statusResp = await apiService.getAnalysisStatus(analysisId);
        if (isStale()) return;

        setProgress(statusResp.progress ?? 0);
        setCurrentStep(statusResp.currentStep || 'Analyzing...');

        if (statusResp.status === 'completed') {
          break;
        }
        if (statusResp.status === 'failed') {
          throw new Error(
            statusResp.errors?.[0] || 'Analysis failed on the server.'
          );
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }

      // 4. Fetch the final result.
      setCurrentStep('Retrieving results...');
      const resultResp = await apiService.getAnalysisResult(analysisId);
      if (isStale()) return;

      setResult(resultResp.result);
      setProgress(100);
      setCurrentStep('Analysis complete');
      setStatus('completed');
    } catch (err) {
      if (isStale()) return;
      setError(apiService.getErrorMessage(err));
      setStatus('failed');
    }
  }, []);

  return { startPipeline, result, status, progress, currentStep, error, reset };
}

export default useAnalysisPipeline;
