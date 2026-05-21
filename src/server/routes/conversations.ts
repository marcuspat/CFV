/**
 * Conversation management routes — backed by the Conversation Ingestion
 * bounded context against PostgreSQL. Replaces the previous in-memory mock.
 *
 * The HTTP surface accepts either a structured `turns` array or a legacy
 * `transcript: string[]`; speaker labels are mapped to ULID SpeakerIds so
 * callers need not mint identifiers themselves.
 */

import { Router, type Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import type { AuthenticatedRequest } from '../middleware/auth';
import { UlidIdGenerator } from '../contexts/identity/infrastructure/production';
import { TenantId, ConversationId } from '../contexts/conversation-ingestion/domain/value-objects';
import type { Conversation } from '../contexts/conversation-ingestion/domain/conversation';
import type { ConversationModule } from '../composition/conversation-ingestion';
import type { ApplicationError } from '../contexts/conversation-ingestion/application/ports';

const ids = new UlidIdGenerator();

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
    default:
      return 400;
  }
}

function toDto(c: Conversation): Record<string, unknown> {
  const s = c.snapshot();
  return {
    id: s.id,
    title: s.title,
    sourceModality: s.sourceModality,
    status: s.status,
    createdAt: s.createdAt,
    turns: s.turns.map((t) => ({
      id: t.id,
      speakerId: t.speakerId,
      text: t.text,
      timestamp: t.timestamp,
      turnIndex: t.turnIndex,
    })),
    segments: s.segments,
    version: s.version,
  };
}

interface RawTurn {
  readonly speaker?: string;
  readonly speakerId?: string;
  readonly text: string;
  readonly timestamp?: string;
}

/** Build domain-shaped turns from either `turns` or legacy `transcript`. */
function buildTurns(body: { turns?: RawTurn[]; transcript?: string[] }): Array<{
  speakerId: string;
  text: string;
  timestamp: string;
}> | null {
  const speakerIds = new Map<string, string>();
  const speakerIdFor = (label: string): string => {
    let id = speakerIds.get(label);
    if (!id) {
      id = ids.newId();
      speakerIds.set(label, id);
    }
    return id;
  };
  const base = Date.now();

  if (Array.isArray(body.turns) && body.turns.length > 0) {
    return body.turns.map((t, i) => ({
      speakerId: t.speakerId && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(t.speakerId)
        ? t.speakerId
        : speakerIdFor(t.speaker ?? `speaker-${i % 2}`),
      text: t.text,
      timestamp: t.timestamp ?? new Date(base + i * 1000).toISOString(),
    }));
  }

  if (Array.isArray(body.transcript) && body.transcript.length > 0) {
    return body.transcript.map((text, i) => ({
      speakerId: speakerIdFor(`speaker-${i % 2}`),
      text,
      timestamp: new Date(base + i * 1000).toISOString(),
    }));
  }

  return null;
}

export function createConversationsRouter(module: ConversationModule): Router {
  const router = Router();

  // Create (ingest) a conversation.
  router.post(
    '/',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) return res.status(401).json({ error: { kind: 'Unauthorised' } });

      const turns = buildTurns(req.body ?? {});
      if (!turns) {
        return res.status(400).json({
          error: { kind: 'InputInvalid', field: 'turns', reason: 'turns or transcript required' },
        });
      }

      const result = await module.ingestText({
        tenantId,
        title: req.body?.title,
        turns,
      });
      if (!result.ok) return res.status(statusFor(result.error)).json({ error: result.error });
      res.status(201).json({ conversationId: result.value.conversationId, status: 'INGESTED' });
    }),
  );

  // List conversations for the tenant (offset/limit paging).
  router.get(
    '/',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantRaw = req.auth?.tenantId;
      if (!tenantRaw) return res.status(401).json({ error: { kind: 'Unauthorised' } });
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
      const rows = await module.conversations.listForTenant(TenantId.of(tenantRaw), {
        offset: (page - 1) * limit,
        limit,
      });
      res.json({ conversations: rows.map(toDto), page, limit });
    }),
  );

  // Fetch one conversation (tenant-isolated).
  router.get(
    '/:id',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantRaw = req.auth?.tenantId;
      if (!tenantRaw) return res.status(401).json({ error: { kind: 'Unauthorised' } });
      let id: ConversationId;
      try {
        id = ConversationId.of(req.params.id);
      } catch {
        return res.status(400).json({ error: { kind: 'InputInvalid', field: 'id', reason: 'invalid' } });
      }
      const conv = await module.conversations.findById(id, TenantId.of(tenantRaw));
      if (!conv) return res.status(404).json({ error: { kind: 'NotFound', resource: 'conversation' } });
      res.json({ conversation: toDto(conv) });
    }),
  );

  // Soft-delete a conversation.
  router.delete(
    '/:id',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) return res.status(401).json({ error: { kind: 'Unauthorised' } });
      const result = await module.deleteConversation({
        tenantId,
        conversationId: req.params.id,
        reason: typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason : 'user requested deletion',
      });
      if (!result.ok) return res.status(statusFor(result.error)).json({ error: result.error });
      res.status(204).send();
    }),
  );

  return router;
}

export default createConversationsRouter;
