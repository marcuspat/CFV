/**
 * Analysis-job repository — PostgreSQL-backed with an in-memory fallback when
 * the database is unavailable. Jobs track the cognitive-analysis pipeline state
 * and (on completion) the full result, so they survive restarts when Postgres
 * is connected.
 */
import database from '../config/database';
import { CognitiveAnalysisResult, ProcessingStatus } from '../../types';

export interface AnalysisJob {
  id: string;
  conversationId: string;
  userId: string;
  status: ProcessingStatus;
  progress: number;
  currentStep: string;
  estimatedTimeRemaining?: number;
  startedAt: Date;
  completedAt?: Date;
  result?: CognitiveAnalysisResult;
  error?: string;
}

const memJobs = new Map<string, AnalysisJob>();

function usingDb(): boolean {
  return database.isConnected;
}

// Patchable fields -> column names.
const FIELD_TO_COLUMN: Record<string, string> = {
  status: 'status',
  progress: 'progress',
  currentStep: 'current_step',
  estimatedTimeRemaining: 'estimated_time_remaining',
  result: 'result',
  error: 'error',
  completedAt: 'completed_at',
};

function rowToJob(row: Record<string, unknown>): AnalysisJob {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    userId: String(row.user_id),
    status: row.status as ProcessingStatus,
    progress: Number(row.progress ?? 0),
    currentStep: String(row.current_step ?? ''),
    estimatedTimeRemaining:
      row.estimated_time_remaining === null || row.estimated_time_remaining === undefined
        ? undefined
        : Number(row.estimated_time_remaining),
    startedAt: row.started_at ? new Date(row.started_at as string) : new Date(),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
    result: row.result
      ? typeof row.result === 'string'
        ? (JSON.parse(row.result) as CognitiveAnalysisResult)
        : (row.result as CognitiveAnalysisResult)
      : undefined,
    error: (row.error as string) ?? undefined,
  };
}

export async function createJob(job: AnalysisJob): Promise<void> {
  if (usingDb()) {
    await database.query(
      `INSERT INTO analysis_jobs
         (id, conversation_id, user_id, status, progress, current_step, estimated_time_remaining, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        job.id,
        job.conversationId,
        job.userId,
        job.status,
        job.progress,
        job.currentStep,
        job.estimatedTimeRemaining ?? null,
      ]
    );
    return;
  }
  memJobs.set(job.id, { ...job });
}

export async function getJob(id: string, userId: string): Promise<AnalysisJob | null> {
  if (usingDb()) {
    const res = await database.query(
      'SELECT * FROM analysis_jobs WHERE id = $1 AND user_id = $2 LIMIT 1',
      [id, userId]
    );
    return res.rows[0] ? rowToJob(res.rows[0]) : null;
  }
  const job = memJobs.get(id);
  return job && job.userId === userId ? job : null;
}

export async function findInFlightByConversation(
  conversationId: string
): Promise<AnalysisJob | null> {
  if (usingDb()) {
    const res = await database.query(
      'SELECT * FROM analysis_jobs WHERE conversation_id = $1 AND status = $2 LIMIT 1',
      [conversationId, ProcessingStatus.PROCESSING]
    );
    return res.rows[0] ? rowToJob(res.rows[0]) : null;
  }
  for (const job of memJobs.values()) {
    if (job.conversationId === conversationId && job.status === ProcessingStatus.PROCESSING) {
      return job;
    }
  }
  return null;
}

export async function patchJob(id: string, fields: Partial<AnalysisJob>): Promise<void> {
  if (usingDb()) {
    const setClauses: string[] = [];
    const vals: unknown[] = [];
    for (const [key, value] of Object.entries(fields)) {
      const col = FIELD_TO_COLUMN[key];
      if (!col) continue;
      const isResult = key === 'result';
      vals.push(isResult ? JSON.stringify(value) : value instanceof Date ? value.toISOString() : value);
      setClauses.push(`${col} = $${vals.length + 1}${isResult ? '::jsonb' : ''}`);
    }
    if (setClauses.length === 0) return;
    await database.query(`UPDATE analysis_jobs SET ${setClauses.join(', ')} WHERE id = $1`, [
      id,
      ...vals,
    ]);
    return;
  }
  const job = memJobs.get(id);
  if (job) Object.assign(job, fields);
}
