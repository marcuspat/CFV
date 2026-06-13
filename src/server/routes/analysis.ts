/**
 * Cognitive analysis routes — real LLM + PostgreSQL persistence
 */
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, ValidationError, NotFoundError, CognitiveProcessingError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/auth';
import { CognitiveAnalysisResult, StartAnalysisRequest, StartAnalysisResponse, GetAnalysisStatusResponse, GetAnalysisResultResponse, ProcessingStatus } from '../../types';
import { logger } from '../utils/logger';
import { analyzeConversation, isAIProviderConfigured } from '../services/cognitiveAnalysis';
import database from '../config/database';

const router = Router();

// --- DB helpers ---
async function dbQuery(sql: string, params: unknown[] = []) {
    const pool = (database as any).getPool?.();
    if (!pool) throw new Error('PostgreSQL not connected');
    return pool.query(sql, params);
}

async function getJobFromDB(id: string, userId: string) {
    try {
          const res = await dbQuery('SELECT * FROM analysis_jobs WHERE id = $1 AND user_id = $2', [id, userId]);
          return res.rows[0] ?? null;
    } catch { return null; }
}

async function persistJob(job: { id: string; conversationId: string; userId: string; status: string; progress: number; currentStep: string; estimatedTimeRemaining: number }) {
    try {
          await dbQuery(
                  'INSERT INTO analysis_jobs (id, conversation_id, user_id, status, progress, current_step, estimated_time_remaining, started_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())',
                  [job.id, job.conversationId, job.userId, job.status, job.progress, job.currentStep, job.estimatedTimeRemaining]
                );
    } catch (err) { logger.warn('Failed to persist job to DB', { err: String(err) }); }
}

async function patchJob(id: string, fields: Record<string, unknown>) {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const snake = (s: string) => s.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
    const set = keys.map((k, i) => `${snake(k)} = $${i + 2}`).join(', ');
    const vals = keys.map(k => { const v = fields[k]; return v instanceof Date ? v.toISOString() : v; });
    try { await dbQuery(`UPDATE analysis_jobs SET ${set} WHERE id = $1`, [id, ...vals]); }
    catch (err) { logger.warn('Failed to patch job', { id, err: String(err) }); }
}

// --- In-memory fallback ---
interface AnalysisJob {
    id: string; conversationId: string; userId: string;
    status: ProcessingStatus; progress: number; currentStep: string;
    estimatedTimeRemaining?: number; startedAt: Date; completedAt?: Date;
    result?: CognitiveAnalysisResult; error?: string;
}
const memJobs: AnalysisJob[] = [];

async function resolveJob(id: string, userId: string): Promise<AnalysisJob | null> {
    const row = await getJobFromDB(id, userId);
    if (row) return { id: row.id, conversationId: row.conversation_id, userId: row.user_id, status: row.status, progress: row.progress, currentStep: row.current_step, estimatedTimeRemaining: row.estimated_time_remaining, startedAt: new Date(row.started_at), completedAt: row.completed_at ? new Date(row.completed_at) : undefined, result: row.result ? (typeof row.result === 'string' ? JSON.parse(row.result) : row.result) : undefined, error: row.error };
    return memJobs.find(j => j.id === id && j.userId === userId) ?? null;
}

// --- Routes ---
router.post('/start', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { conversationId, conversationText, options } = req.body as StartAnalysisRequest & { conversationText?: string };
    if (!conversationId) throw new ValidationError('conversationId is required');
    if (!isAIProviderConfigured()) throw new CognitiveProcessingError('No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.');

                                     const inFlight = memJobs.find(j => j.conversationId === conversationId && j.status === ProcessingStatus.PROCESSING);
    if (inFlight) throw new ValidationError('Analysis already running for this conversation');

                                     const analysisId = uuidv4();
    const job: AnalysisJob = { id: analysisId, conversationId, userId: user.id, status: ProcessingStatus.PROCESSING, progress: 0, currentStep: 'Queued', estimatedTimeRemaining: 30, startedAt: new Date() };
    memJobs.push(job);
    await persistJob({ id: job.id, conversationId: job.conversationId, userId: job.userId, status: job.status, progress: job.progress, currentStep: job.currentStep, estimatedTimeRemaining: job.estimatedTimeRemaining! });

                                     logger.info('Analysis job created', { analysisId, conversationId, userId: user.id });
    processAnalysis(job, conversationText ?? `Conversation ID: ${conversationId}`).catch(e => logger.error('processAnalysis error', { analysisId, e: String(e) }));

                                     res.status(202).json({ analysisId, status: job.status, estimatedDuration: job.estimatedTimeRemaining } as StartAnalysisResponse);
}));

router.get('/:id/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const job = await resolveJob(req.params.id, req.user!.id);
    if (!job) throw new NotFoundError('Analysis job not found');
    res.json({ analysisId: job.id, status: job.status, progress: job.progress, currentStep: job.currentStep, estimatedTimeRemaining: job.estimatedTimeRemaining, errors: job.error ? [job.error] : undefined } as GetAnalysisStatusResponse);
}));

router.get('/:id/result', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const job = await resolveJob(req.params.id, req.user!.id);
    if (!job) throw new NotFoundError('Analysis job not found');
    if (job.status !== ProcessingStatus.COMPLETED) throw new ValidationError('Analysis not completed yet');
    if (!job.result) throw new ValidationError('Result not available');
    res.json({ analysisId: job.id, conversationId: job.conversationId, result: job.result, processingMetrics: job.result.metrics } as GetAnalysisResultResponse);
}));

router.post('/:id/cancel', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const job = await resolveJob(req.params.id, req.user!.id);
    if (!job) throw new NotFoundError('Analysis job not found');
    if (job.status === ProcessingStatus.COMPLETED) throw new ValidationError('Cannot cancel completed analysis');
    if (job.status === ProcessingStatus.FAILED) throw new ValidationError('Analysis already failed');
    const patch = { status: ProcessingStatus.FAILED, error: 'Cancelled by user', completedAt: new Date() };
    const mem = memJobs.find(j => j.id === job.id);
    if (mem) Object.assign(mem, patch);
    await patchJob(job.id, patch);
    logger.info('Analysis cancelled', { analysisId: job.id, userId: req.user!.id });
    res.json({ message: 'Analysis cancelled', analysisId: job.id, status: ProcessingStatus.FAILED });
}));

// --- Processing pipeline ---
async function step(job: AnalysisJob, s: string, p: number, eta?: number) {
    job.currentStep = s; job.progress = p;
    if (eta !== undefined) job.estimatedTimeRemaining = eta;
    await patchJob(job.id, { currentStep: s, progress: p, estimatedTimeRemaining: eta ?? job.estimatedTimeRemaining });
    logger.debug('Analysis step', { analysisId: job.id, s, p });
}

async function processAnalysis(job: AnalysisJob, conversationText: string): Promise<void> {
    try {
          await step(job, 'Extracting conversation context...', 5, 30);
          await new Promise(r => setTimeout(r, 100));
          await step(job, 'Calling AI cognitive analysis engine...', 15, 25);

      const result = await analyzeConversation(job.conversationId, conversationText);

      await step(job, 'Building cognitive graph...', 70, 5);
          await step(job, 'Persisting results...', 85, 3);

      try {
              await dbQuery('UPDATE analysis_jobs SET result=$1,status=$2,progress=100,current_step=$3,completed_at=NOW() WHERE id=$4',
                                    [JSON.stringify(result), ProcessingStatus.COMPLETED, 'Analysis complete', job.id]);
      } catch (dbErr) { logger.warn('Could not persist result to DB', { dbErr: String(dbErr) }); }

      job.result = result; job.status = ProcessingStatus.COMPLETED;
          job.progress = 100; job.currentStep = 'Analysis complete'; job.completedAt = new Date();
          logger.info('Analysis completed', { analysisId: job.id, elementCount: result.elements.length, durationMs: job.completedAt.getTime() - job.startedAt.getTime() });
    } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          job.status = ProcessingStatus.FAILED; job.error = msg; job.completedAt = new Date();
          await patchJob(job.id, { status: ProcessingStatus.FAILED, error: msg, completedAt: new Date() });
          logger.error('Analysis failed', { analysisId: job.id, error: msg });
    }
}

export default router;
