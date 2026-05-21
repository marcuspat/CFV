/**
 * Cognitive analysis routes — backed by the Cognitive Analysis bounded
 * context's ExecuteAnalysisSaga against PostgreSQL. Replaces the previous
 * mock that fabricated cognitive elements and metrics.
 *
 * The ensemble currently runs on a deterministic heuristic stand-in for the
 * Python ML pipeline (see composition/cognitive-analysis.ts); the saga,
 * fusion, calibration and symbolic reasoning are the real domain logic.
 */

import { Router, type Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { AnalysisModule } from '../composition/cognitive-analysis';
import type { ApplicationError } from '../contexts/cognitive-analysis/application/ports';

function statusFor(error: ApplicationError): number {
  switch (error.kind) {
    case 'InputInvalid':
      return 400;
    case 'NotFound':
      return 404;
    case 'Conflict':
      return 409;
    case 'PreconditionFailed':
      return 422;
    case 'UpstreamUnavailable':
      return 503;
    default:
      return 400;
  }
}

export function createAnalysisRouter(module: AnalysisModule): Router {
  const router = Router();

  // Start (and run) an analysis for a conversation. The saga executes
  // synchronously and returns a terminal result.
  router.post(
    '/start',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) return res.status(401).json({ error: { kind: 'Unauthorised' } });
      const { conversationId, parameters } = req.body ?? {};
      if (typeof conversationId !== 'string' || conversationId.length === 0) {
        return res.status(400).json({ error: { kind: 'InputInvalid', field: 'conversationId', reason: 'required' } });
      }
      const result = await module.analyze({ tenantId, conversationId, parameters });
      if (!result.ok) return res.status(statusFor(result.error)).json({ error: result.error });
      res.status(201).json(result.value);
    }),
  );

  // Analysis status.
  router.get(
    '/:id/status',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) return res.status(401).json({ error: { kind: 'Unauthorised' } });
      const analysis = await module.getAnalysis(req.params.id, tenantId);
      if (!analysis) return res.status(404).json({ error: { kind: 'NotFound', resource: 'analysis' } });
      const s = analysis.snapshot();
      res.json({
        analysisId: s.id,
        status: s.status,
        degraded: s.degradedReasons.length > 0,
        stages: s.stages.map((st) => ({ name: st.name, status: st.status })),
      });
    }),
  );

  // Analysis result summary. The detected cognitive elements are published
  // as CognitiveElementDetected events to the Cognitive Graph context.
  router.get(
    '/:id/result',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) return res.status(401).json({ error: { kind: 'Unauthorised' } });
      const analysis = await module.getAnalysis(req.params.id, tenantId);
      if (!analysis) return res.status(404).json({ error: { kind: 'NotFound', resource: 'analysis' } });
      const s = analysis.snapshot();
      if (s.status !== 'COMPLETED') {
        return res.status(409).json({ error: { kind: 'Conflict', reason: `analysis is ${s.status}` } });
      }
      res.json({
        analysisId: s.id,
        conversationId: s.conversationId,
        bundleVersion: s.bundleVersion,
        status: s.status,
        elementCount: s.elementCount,
        degradedReasons: s.degradedReasons,
        completedAt: s.completedAt,
        stages: s.stages.map((st) => ({ name: st.name, status: st.status })),
      });
    }),
  );

  return router;
}

export default createAnalysisRouter;
