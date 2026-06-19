/**
 * Conversation repository — PostgreSQL-backed with an in-memory fallback when
 * the database is unavailable (mirrors userRepository). Conversations are scoped
 * to the owning user. Transcript and metadata are stored as JSONB.
 */
import { v4 as uuidv4 } from 'uuid';
import database from '../config/database';
import { Conversation, ConversationMetadata, ProcessingStatus } from '../../types';

interface StoredConversation {
  conversation: Conversation;
  userId: string;
}

const memConversations = new Map<string, StoredConversation>();

function usingDb(): boolean {
  return database.isConnected;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    title: String(row.title),
    transcript: parseJson<string[]>(row.transcript, []),
    metadata: parseJson<ConversationMetadata>(row.metadata, {
      duration: 0,
      participantCount: 0,
      language: 'en',
      tags: [],
    }),
    processingStatus: row.processing_status as ProcessingStatus,
    createdAt: row.created_at ? new Date(row.created_at as string) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at as string) : new Date(),
  };
}

export interface NewConversation {
  title: string;
  transcript: string[];
  metadata: ConversationMetadata;
  userId: string;
}

export interface ListOptions {
  status?: ProcessingStatus;
  domain?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export async function createConversation(input: NewConversation): Promise<Conversation> {
  if (usingDb()) {
    const res = await database.query(
      `INSERT INTO conversations (title, user_id, transcript, metadata, processing_status)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
       RETURNING *`,
      [
        input.title,
        input.userId,
        JSON.stringify(input.transcript),
        JSON.stringify(input.metadata),
        ProcessingStatus.PENDING,
      ]
    );
    return rowToConversation(res.rows[0]);
  }
  const conversation: Conversation = {
    id: uuidv4(),
    title: input.title,
    transcript: input.transcript,
    metadata: input.metadata,
    processingStatus: ProcessingStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  memConversations.set(conversation.id, { conversation, userId: input.userId });
  return conversation;
}

export async function findById(id: string, userId: string): Promise<Conversation | null> {
  if (usingDb()) {
    const res = await database.query(
      'SELECT * FROM conversations WHERE id = $1 AND user_id = $2 LIMIT 1',
      [id, userId]
    );
    return res.rows[0] ? rowToConversation(res.rows[0]) : null;
  }
  const stored = memConversations.get(id);
  return stored && stored.userId === userId ? stored.conversation : null;
}

export async function list(
  userId: string,
  opts: ListOptions
): Promise<{ items: Conversation[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;
  const sortCol = opts.sortBy === 'updatedAt' ? 'updated_at' : 'created_at';
  const sortMemKey = opts.sortBy === 'updatedAt' ? 'updatedAt' : 'createdAt';

  if (usingDb()) {
    const where: string[] = ['user_id = $1'];
    const params: unknown[] = [userId];
    if (opts.status) {
      params.push(opts.status);
      where.push(`processing_status = $${params.length}`);
    }
    if (opts.domain) {
      params.push(opts.domain);
      where.push(`metadata->>'domain' = $${params.length}`);
    }
    const whereSql = where.join(' AND ');
    const order = opts.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countRes = await database.query(
      `SELECT COUNT(*)::int AS total FROM conversations WHERE ${whereSql}`,
      params
    );
    const total = Number(countRes.rows[0].total);

    const itemsRes = await database.query(
      `SELECT * FROM conversations WHERE ${whereSql} ORDER BY ${sortCol} ${order} LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    return { items: itemsRes.rows.map(rowToConversation), total };
  }

  let items = [...memConversations.values()]
    .filter((s) => s.userId === userId)
    .map((s) => s.conversation);
  if (opts.status) items = items.filter((c) => c.processingStatus === opts.status);
  if (opts.domain) items = items.filter((c) => c.metadata.domain === opts.domain);
  items.sort((a, b) => {
    const av = a[sortMemKey].getTime();
    const bv = b[sortMemKey].getTime();
    return opts.sortOrder === 'asc' ? av - bv : bv - av;
  });
  const total = items.length;
  return { items: items.slice(offset, offset + limit), total };
}

export async function update(
  id: string,
  userId: string,
  updates: { title?: string; metadata?: Partial<ConversationMetadata> }
): Promise<Conversation | null> {
  const existing = await findById(id, userId);
  if (!existing) return null;

  const merged: Conversation = {
    ...existing,
    title: updates.title ?? existing.title,
    metadata: updates.metadata
      ? { ...existing.metadata, ...updates.metadata }
      : existing.metadata,
    updatedAt: new Date(),
  };

  if (usingDb()) {
    await database.query(
      'UPDATE conversations SET title = $2, metadata = $3::jsonb, updated_at = NOW() WHERE id = $1 AND user_id = $4',
      [id, merged.title, JSON.stringify(merged.metadata), userId]
    );
    return merged;
  }
  const stored = memConversations.get(id);
  if (stored) stored.conversation = merged;
  return merged;
}

export async function remove(id: string, userId: string): Promise<boolean> {
  if (usingDb()) {
    const res = await database.query(
      'DELETE FROM conversations WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (res.rowCount ?? 0) > 0;
  }
  const stored = memConversations.get(id);
  if (stored && stored.userId === userId) {
    memConversations.delete(id);
    return true;
  }
  return false;
}

export async function addTranscriptEntry(
  id: string,
  userId: string,
  content: string
): Promise<Conversation | null> {
  const existing = await findById(id, userId);
  if (!existing) return null;

  const transcript = [...existing.transcript, content];
  const updated: Conversation = { ...existing, transcript, updatedAt: new Date() };

  if (usingDb()) {
    await database.query(
      'UPDATE conversations SET transcript = $2::jsonb, updated_at = NOW() WHERE id = $1 AND user_id = $3',
      [id, JSON.stringify(transcript), userId]
    );
    return updated;
  }
  const stored = memConversations.get(id);
  if (stored) stored.conversation = updated;
  return updated;
}
