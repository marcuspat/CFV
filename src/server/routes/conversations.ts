/**
 * Conversation management routes
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  Conversation,
  ProcessingStatus,
  CreateConversationRequest,
  CreateConversationResponse,
  GetConversationResponse,
  ListConversationsQuery,
  ListConversationsResponse,
  ConversationMetadata
} from '../../types';
import { logger } from '../utils/logger';
import database from '../config/database';

const router = Router();

// Mock conversation storage (in production, use database)
const conversations: Conversation[] = [];

// Create new conversation
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { title, transcript, metadata }: CreateConversationRequest = req.body;

  // Validate input
  if (!title || !transcript || !Array.isArray(transcript) || transcript.length === 0) {
    throw new ValidationError('Title and non-empty transcript array are required');
  }

  if (transcript.some((entry: any) => typeof entry !== 'string')) {
    throw new ValidationError('All transcript entries must be strings');
  }

  // Create conversation
  const conversation: Conversation = {
    id: uuidv4(),
    title,
    transcript,
    metadata: {
      duration: transcript.reduce((acc, entry) => acc + (entry.split(' ').length * 0.5), 0), // Rough estimate
      participantCount: 2, // Default assumption
      language: metadata?.language || 'en',
      domain: metadata?.domain,
      tags: metadata?.tags || [],
    },
    processingStatus: ProcessingStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Save to database (mock for now)
  conversations.push(conversation);

  logger.info('Conversation created', {
    conversationId: conversation.id,
    userId: user.id,
    title: conversation.title,
    transcriptLength: transcript.length,
  });

  const response: CreateConversationResponse = {
    conversationId: conversation.id,
    status: conversation.processingStatus,
    estimatedDuration: Math.round(transcript.length * 2), // 2 seconds per transcript entry
  };

  res.status(201).json(response);
}));

// Get conversation by ID
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  const conversation = conversations.find(c => c.id === id);
  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  // In production, verify user has access to this conversation
  // For now, allow all authenticated users

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
  const {
    page = 1,
    limit = 20,
    status,
    domain,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  }: ListConversationsQuery = req.query as any;

  // Parse pagination parameters
  const pageNum = Math.max(1, parseInt(String(page)));
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit))));
  const offset = (pageNum - 1) * limitNum;

  // Filter conversations
  let filteredConversations = conversations.filter(c => {
    if (status && c.processingStatus !== status) return false;
    if (domain && c.metadata.domain !== domain) return false;
    return true;
  });

  // Sort conversations
  filteredConversations.sort((a, b) => {
    let aValue: any = a[sortBy as keyof Conversation] || a.metadata[sortBy as keyof ConversationMetadata];
    let bValue: any = b[sortBy as keyof Conversation] || b.metadata[sortBy as keyof ConversationMetadata];

    if (aValue instanceof Date) aValue = aValue.getTime();
    if (bValue instanceof Date) bValue = bValue.getTime();

    if (sortOrder === 'asc') {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
    }
  });

  // Paginate
  const paginatedConversations = filteredConversations.slice(offset, offset + limitNum);
  const total = filteredConversations.length;
  const totalPages = Math.ceil(total / limitNum);

  const response: ListConversationsResponse = {
    conversations: paginatedConversations,
    total,
    page: pageNum,
    totalPages,
    hasNext: pageNum < totalPages,
    hasPrev: pageNum > 1,
  };

  logger.info('Conversations listed', {
    userId: user.id,
    page: pageNum,
    limit: limitNum,
    total,
    filters: { status, domain },
  });

  res.json(response);
}));

// Update conversation metadata
router.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const updates = req.body;

  const conversationIndex = conversations.findIndex(c => c.id === id);
  if (conversationIndex === -1) {
    throw new NotFoundError('Conversation not found');
  }

  // Update allowed fields
  const allowedFields = ['title', 'metadata'] as const;
  const filteredUpdates: Partial<Conversation> = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      (filteredUpdates as Record<string, unknown>)[field] = updates[field];
    }
  }

  if (filteredUpdates.metadata) {
    filteredUpdates.metadata = {
      ...conversations[conversationIndex].metadata,
      ...filteredUpdates.metadata,
    };
  }

  // Update conversation
  conversations[conversationIndex] = {
    ...conversations[conversationIndex],
    ...filteredUpdates,
    updatedAt: new Date(),
  };

  logger.info('Conversation updated', {
    conversationId: id,
    userId: user.id,
    updatedFields: Object.keys(filteredUpdates),
  });

  res.json({
    conversation: conversations[conversationIndex],
  });
}));

// Delete conversation
router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  const conversationIndex = conversations.findIndex(c => c.id === id);
  if (conversationIndex === -1) {
    throw new NotFoundError('Conversation not found');
  }

  // Delete conversation (in production, also delete related analyses, visualizations, etc.)
  conversations.splice(conversationIndex, 1);

  logger.info('Conversation deleted', {
    conversationId: id,
    userId: user.id,
  });

  res.status(204).send();
}));

// Add transcript entry to conversation
router.post('/:id/transcript', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const { content, speaker }: { content: string; speaker?: string } = req.body;

  if (!content || typeof content !== 'string') {
    throw new ValidationError('Content is required and must be a string');
  }

  const conversationIndex = conversations.findIndex(c => c.id === id);
  if (conversationIndex === -1) {
    throw new NotFoundError('Conversation not found');
  }

  // Add transcript entry
  conversations[conversationIndex].transcript.push(content);
  conversations[conversationIndex].updatedAt = new Date();

  logger.info('Transcript entry added', {
    conversationId: id,
    userId: user.id,
    transcriptLength: conversations[conversationIndex].transcript.length,
  });

  res.status(201).json({
    sequenceNumber: conversations[conversationIndex].transcript.length - 1,
    content,
    speaker: speaker || 'Unknown',
    timestamp: new Date(),
  });
}));

export default router;