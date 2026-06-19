/**
 * Conversation management routes — persisted via conversationRepository
 * (PostgreSQL when connected, in-memory fallback otherwise).
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { validateBody } from '../middleware/validate';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  ConversationMetadata,
  ProcessingStatus,
  CreateConversationResponse,
  GetConversationResponse,
  ListConversationsResponse,
} from '../../types';
import { logger } from '../utils/logger';
import * as conversationRepo from '../services/conversationRepository';

const router = Router();

// --- Validation schemas ---
const createConversationSchema = z.object({
  title: z.string().min(1, 'title is required').max(500, 'title is too long'),
  transcript: z
    .array(z.string().min(1, 'transcript entries must be non-empty strings'))
    .min(1, 'transcript must contain at least one entry'),
  metadata: z
    .object({
      domain: z.string().max(200).optional(),
      language: z.string().max(20).optional(),
      tags: z.array(z.string().max(50)).max(50).optional(),
    })
    .optional(),
});

// Create new conversation
router.post('/', validateBody(createConversationSchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { title, transcript, metadata } = req.body as {
    title: string;
    transcript: string[];
    metadata?: { domain?: string; language?: string; tags?: string[] };
  };

  const meta: ConversationMetadata = {
    duration: transcript.reduce((acc, entry) => acc + entry.split(' ').length * 0.5, 0),
    participantCount: 2,
    language: metadata?.language || 'en',
    domain: metadata?.domain,
    tags: metadata?.tags || [],
  };

  const conversation = await conversationRepo.createConversation({
    title,
    transcript,
    metadata: meta,
    userId: user.id,
  });

  logger.info('Conversation created', {
    conversationId: conversation.id,
    userId: user.id,
    title: conversation.title,
    transcriptLength: transcript.length,
  });

  const response: CreateConversationResponse = {
    conversationId: conversation.id,
    status: conversation.processingStatus,
    estimatedDuration: Math.round(transcript.length * 2),
  };

  res.status(201).json(response);
}));

// Get conversation by ID
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const conversation = await conversationRepo.findById(req.params.id, user.id);
  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  logger.info('Conversation retrieved', {
    conversationId: conversation.id,
    userId: user.id,
    status: conversation.processingStatus,
  });

  const response: GetConversationResponse = {
    conversation,
    status: conversation.processingStatus,
  };

  res.json(response);
}));

// List conversations with filtering and pagination
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const q = req.query as Record<string, string | undefined>;

  const pageNum = Math.max(1, parseInt(q.page ?? '1', 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(q.limit ?? '20', 10) || 20));

  const { items, total } = await conversationRepo.list(user.id, {
    status: q.status as ProcessingStatus | undefined,
    domain: q.domain,
    sortBy: q.sortBy,
    sortOrder: q.sortOrder === 'asc' ? 'asc' : 'desc',
    page: pageNum,
    limit: limitNum,
  });

  const totalPages = Math.max(1, Math.ceil(total / limitNum));

  const response: ListConversationsResponse = {
    conversations: items,
    total,
    page: pageNum,
    totalPages,
    hasNext: pageNum < totalPages,
    hasPrev: pageNum > 1,
  };

  logger.info('Conversations listed', { userId: user.id, page: pageNum, limit: limitNum, total });

  res.json(response);
}));

// Update conversation metadata
router.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const updates = (req.body ?? {}) as { title?: string; metadata?: Partial<ConversationMetadata> };

  const updated = await conversationRepo.update(req.params.id, user.id, {
    title: updates.title,
    metadata: updates.metadata,
  });
  if (!updated) {
    throw new NotFoundError('Conversation not found');
  }

  logger.info('Conversation updated', { conversationId: req.params.id, userId: user.id });
  res.json({ conversation: updated });
}));

// Delete conversation
router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const removed = await conversationRepo.remove(req.params.id, user.id);
  if (!removed) {
    throw new NotFoundError('Conversation not found');
  }

  logger.info('Conversation deleted', { conversationId: req.params.id, userId: user.id });
  res.status(204).send();
}));

// Add transcript entry to conversation
router.post('/:id/transcript', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { content, speaker } = (req.body ?? {}) as { content?: string; speaker?: string };

  if (!content || typeof content !== 'string') {
    throw new ValidationError('Content is required and must be a string');
  }

  const updated = await conversationRepo.addTranscriptEntry(req.params.id, user.id, content);
  if (!updated) {
    throw new NotFoundError('Conversation not found');
  }

  logger.info('Transcript entry added', {
    conversationId: req.params.id,
    userId: user.id,
    transcriptLength: updated.transcript.length,
  });

  res.status(201).json({
    sequenceNumber: updated.transcript.length - 1,
    content,
    speaker: speaker || 'Unknown',
    timestamp: new Date(),
  });
}));

export default router;
