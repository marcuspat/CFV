/**
 * Cognitive analysis routes — real LLM + persisted analysis jobs
 * (PostgreSQL via analysisJobRepository, with in-memory fallback).
 */
import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, ValidationError, NotFoundError, CognitiveProcessingError } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  StartAnalysisResponse,
  GetAnalysisStatusResponse,
  GetAnalysisResultResponse,
  ProcessingStatus,
} from '../../types';
import { logger } from '../utils/logger';
import { analyzeConversation, isAIProviderConfigured } from '../services/cognitiveAnalysis';
import {
  AnalysisJob,
  createJob,
  getJob,
  patchJob,
  findInFlightByConversation,
} from '../services/analysisJobRepository';

const router = Router();

// --- Validation schemas ---
const startAnalysisSchema = z.object({
  conversationId: z.string().min(1, 'conversationId is required'),
  conversationText: z.string().min(1).max(100000).optional(),
  options: z
    .object({
      includeRealTime: z.boolean().optional(),
      detailLevel: z.enum(['summary', 'detailed', 'comprehensive']).optional(),
      customWeights: z.record(z.number()).optional(),
    })
    .optional(),
});

// --- Routes ---
router.post('/start', validateBody(startAnalysisSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { conversationId, conversationText } = req.body as {
    conversationId: string;
    conversationText?: string;
  };

  if (!isAIProviderConfigured()) {
    throw new CognitiveProcessingError('No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.');
  }

  const inFlight = await findInFlightByConversation(conversationId);
  if (inFlight) {
    throw new ValidationError('Analysis already running for this conversation');
  }

  const job: AnalysisJob = {
    id: uuidv4(),
    conversationId,
    userId: user.id,
    status: ProcessingStatus.PROCESSING,
    progress: 0,
    currentStep: 'Queued',
    estimatedTimeRemaining: 30,
    startedAt: new Date(),
  };
  await createJob(job);

  logger.info('Analysis job created', { analysisId: job.id, conversationId, userId: user.id });

  processAnalysis(job, conversationText ?? `Conversation ID: ${conversationId}`).catch((e) =>
    logger.error('processAnalysis error', { analysisId: job.id, e: String(e) })
  );

  res.status(202).json({
    analysisId: job.id,
    status: job.status,
    estimatedDuration: job.estimatedTimeRemaining,
  } as StartAnalysisResponse);
}));

router.get('/:id/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const job = await getJob(req.params.id, req.user!.id);
  if (!job) throw new NotFoundError('Analysis job not found');
  res.json({
    analysisId: job.id,
    status: job.status,
    progress: job.progress,
    currentStep: job.currentStep,
    estimatedTimeRemaining: job.estimatedTimeRemaining,
    errors: job.error ? [job.error] : undefined,
  } as GetAnalysisStatusResponse);
}));

router.get('/:id/result', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const job = await getJob(req.params.id, req.user!.id);
  if (!job) throw new NotFoundError('Analysis job not found');
  if (job.status !== ProcessingStatus.COMPLETED) throw new ValidationError('Analysis not completed yet');
  if (!job.result) throw new ValidationError('Result not available');
  res.json({
    analysisId: job.id,
    conversationId: job.conversationId,
    result: job.result,
    processingMetrics: {
      totalProcessingTime: 0,
      cognitiveDecompositionTime: 0,
      graphGenerationTime: 0,
      visualizationTime: 0,
      memoryUsage: 0,
      accuracyMetrics: {},
    },
  } as GetAnalysisResultResponse);
}));

router.post('/:id/cancel', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const job = await getJob(req.params.id, req.user!.id);
  if (!job) throw new NotFoundError('Analysis job not found');
  if (job.status === ProcessingStatus.COMPLETED) throw new ValidationError('Cannot cancel completed analysis');
  if (job.status === ProcessingStatus.FAILED) throw new ValidationError('Analysis already failed');
  await patchJob(job.id, { status: ProcessingStatus.FAILED, error: 'Cancelled by user', completedAt: new Date() });
  logger.info('Analysis cancelled', { analysisId: job.id, userId: req.user!.id });
  res.json({ message: 'Analysis cancelled', analysisId: job.id, status: ProcessingStatus.FAILED });
}));

// --- Processing pipeline ---
async function step(jobId: string, s: string, p: number, eta?: number): Promise<void> {
  await patchJob(jobId, { currentStep: s, progress: p, estimatedTimeRemaining: eta });
  logger.debug('Analysis step', { analysisId: jobId, s, p });
}

async function processAnalysis(job: AnalysisJob, conversationText: string): Promise<void> {
  try {
    await step(job.id, 'Extracting conversation context...', 5, 30);
    await new Promise((r) => setTimeout(r, 100));
    await step(job.id, 'Calling AI cognitive analysis engine...', 15, 25);

    const result = await analyzeConversation(job.conversationId, conversationText);

    await step(job.id, 'Building cognitive graph...', 70, 5);
    await step(job.id, 'Persisting results...', 85, 3);

    await patchJob(job.id, {
      status: ProcessingStatus.COMPLETED,
      progress: 100,
      currentStep: 'Analysis complete',
      result,
      completedAt: new Date(),
    });

    logger.info('Analysis completed', {
      analysisId: job.id,
      elementCount: result.elements.length,
      durationMs: Date.now() - job.startedAt.getTime(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await patchJob(job.id, { status: ProcessingStatus.FAILED, error: msg, completedAt: new Date() });
    logger.error('Analysis failed', { analysisId: job.id, error: msg });
  }
}

export default router;
