/**
 * PostgreSQL implementations of the Conversation Ingestion repositories.
 *
 * All queries run on the ambient Unit-of-Work client (shared/db/pool.ts) so
 * they commit atomically with the transactional outbox. Optimistic
 * concurrency mirrors the in-memory adapter's contract: callers pass the
 * aggregate version *before* the mutation as `expectedVersion`.
 */

import { getQueryable } from '../../../shared/db/pool';
import { AnalysisSession } from '../domain/analysis-session';
import { Conversation, type TurnSnapshot } from '../domain/conversation';
import {
  ConversationId,
  SessionId,
  SpeakerId,
  TurnId,
  TurnIndex,
  TenantId,
  UserId,
  type ConversationStatus,
  type SegmentationSource,
  type SegmentBoundary,
  type SourceModality,
} from '../domain/value-objects';
import type {
  AnalysisSessionRepository,
  ConversationRepository,
} from '../application/ports';
import { AggregateVersionConflict } from './in-memory';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

// ---------------------------------------------------------------------------
// Conversation repository
// ---------------------------------------------------------------------------

export class PostgresConversationRepository implements ConversationRepository {
  async findById(id: ConversationId, tenantId: TenantId): Promise<Conversation | null> {
    const { rows } = await getQueryable().query(
      `SELECT id, tenant_id, title, source_modality, status, created_at,
              derived_from_conversation_id, turns, segments, version
         FROM conversations WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return rows[0] ? hydrateConversation(rows[0]) : null;
  }

  async save(conversation: Conversation, expectedVersion: number): Promise<void> {
    const s = conversation.snapshot();
    const db = getQueryable();
    const turns = JSON.stringify(s.turns.map(serializeTurn));
    const segments = JSON.stringify(s.segments.map(serializeSegment));
    if (expectedVersion === 0) {
      try {
        await db.query(
          `INSERT INTO conversations
             (id, tenant_id, title, source_modality, status, created_at,
              derived_from_conversation_id, turns, segments, version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            s.id,
            s.tenantId,
            s.title,
            s.sourceModality,
            s.status,
            s.createdAt,
            s.derivedFromConversationId,
            turns,
            segments,
            s.version,
          ],
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw new AggregateVersionConflict('Conversation', s.id);
        throw err;
      }
      return;
    }
    const { rowCount } = await db.query(
      `UPDATE conversations
          SET title = $2, source_modality = $3, status = $4,
              derived_from_conversation_id = $5, turns = $6, segments = $7, version = $8
        WHERE id = $1 AND version = $9`,
      [
        s.id,
        s.title,
        s.sourceModality,
        s.status,
        s.derivedFromConversationId,
        turns,
        segments,
        s.version,
        expectedVersion,
      ],
    );
    if (rowCount !== 1) throw new AggregateVersionConflict('Conversation', s.id);
  }

  async listForTenant(
    tenantId: TenantId,
    page: { offset: number; limit: number },
  ): Promise<ReadonlyArray<Conversation>> {
    const { rows } = await getQueryable().query(
      `SELECT id, tenant_id, title, source_modality, status, created_at,
              derived_from_conversation_id, turns, segments, version
         FROM conversations
        WHERE tenant_id = $1
        ORDER BY created_at ASC
        OFFSET $2 LIMIT $3`,
      [tenantId, page.offset, page.limit],
    );
    return rows.map(hydrateConversation);
  }
}

interface TurnRow {
  id: string;
  speakerId: string;
  text: string;
  timestamp: string;
  turnIndex: number;
}

interface SegmentRow {
  fromTurnIndex: number;
  toTurnIndex: number;
  intent?: string;
  source: SegmentationSource;
}

function serializeTurn(t: TurnSnapshot): TurnRow {
  return {
    id: t.id,
    speakerId: t.speakerId,
    text: t.text,
    timestamp: t.timestamp.toISOString(),
    turnIndex: t.turnIndex.value,
  };
}

function serializeSegment(b: SegmentBoundary): SegmentRow {
  return {
    fromTurnIndex: b.fromTurnIndex.value,
    toTurnIndex: b.toTurnIndex.value,
    ...(b.intent !== undefined ? { intent: b.intent } : {}),
    source: b.source,
  };
}

function deserializeTurn(t: TurnRow): TurnSnapshot {
  return {
    id: TurnId.of(t.id),
    speakerId: SpeakerId.of(t.speakerId),
    text: t.text,
    timestamp: new Date(t.timestamp),
    turnIndex: TurnIndex.of(t.turnIndex),
  };
}

function deserializeSegment(b: SegmentRow): SegmentBoundary {
  return {
    fromTurnIndex: TurnIndex.of(b.fromTurnIndex),
    toTurnIndex: TurnIndex.of(b.toTurnIndex),
    ...(b.intent !== undefined ? { intent: b.intent } : {}),
    source: b.source,
  };
}

function hydrateConversation(row: Record<string, unknown>): Conversation {
  const turns = (row.turns as TurnRow[]).map(deserializeTurn);
  const segments = (row.segments as SegmentRow[]).map(deserializeSegment);
  return Conversation.rehydrate({
    id: ConversationId.of(String(row.id)),
    tenantId: TenantId.of(String(row.tenant_id)),
    title: String(row.title),
    sourceModality: row.source_modality as SourceModality,
    status: row.status as ConversationStatus,
    createdAt: row.created_at as Date,
    derivedFromConversationId: row.derived_from_conversation_id
      ? ConversationId.of(String(row.derived_from_conversation_id))
      : null,
    turns,
    segments,
    version: Number(row.version),
  });
}

// ---------------------------------------------------------------------------
// AnalysisSession repository
// ---------------------------------------------------------------------------

export class PostgresAnalysisSessionRepository implements AnalysisSessionRepository {
  async findById(id: SessionId, tenantId: TenantId): Promise<AnalysisSession | null> {
    const { rows } = await getQueryable().query(
      `SELECT id, tenant_id, conversation_id, user_id, parameters, status, created_at, version
         FROM analysis_sessions WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return rows[0] ? hydrateSession(rows[0]) : null;
  }

  async findIdempotent(
    tenantId: TenantId,
    conversationId: ConversationId,
    parameterHash: string,
  ): Promise<AnalysisSession | null> {
    const { rows } = await getQueryable().query(
      `SELECT id, tenant_id, conversation_id, user_id, parameters, status, created_at, version
         FROM analysis_sessions
        WHERE tenant_id = $1 AND conversation_id = $2 AND parameter_hash = $3`,
      [tenantId, conversationId, parameterHash],
    );
    return rows[0] ? hydrateSession(rows[0]) : null;
  }

  async save(
    session: AnalysisSession,
    expectedVersion: number,
    parameterHash: string,
  ): Promise<void> {
    const s = session.snapshot();
    const db = getQueryable();
    const parameters = JSON.stringify(s.parameters);
    if (expectedVersion === 0) {
      try {
        await db.query(
          `INSERT INTO analysis_sessions
             (id, tenant_id, conversation_id, user_id, parameters, parameter_hash, status, created_at, version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            s.id,
            s.tenantId,
            s.conversationId,
            s.userId,
            parameters,
            parameterHash,
            s.status,
            s.createdAt,
            s.version,
          ],
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw new AggregateVersionConflict('AnalysisSession', s.id);
        throw err;
      }
      return;
    }
    const { rowCount } = await db.query(
      `UPDATE analysis_sessions
          SET parameters = $2, parameter_hash = $3, status = $4, version = $5
        WHERE id = $1 AND version = $6`,
      [s.id, parameters, parameterHash, s.status, s.version, expectedVersion],
    );
    if (rowCount !== 1) throw new AggregateVersionConflict('AnalysisSession', s.id);
  }
}

function hydrateSession(row: Record<string, unknown>): AnalysisSession {
  return AnalysisSession.rehydrate({
    id: SessionId.of(String(row.id)),
    tenantId: TenantId.of(String(row.tenant_id)),
    conversationId: ConversationId.of(String(row.conversation_id)),
    userId: UserId.of(String(row.user_id)),
    parameters: row.parameters as Record<string, unknown>,
    status: row.status as AnalysisSession['status'],
    createdAt: row.created_at as Date,
    version: Number(row.version),
  });
}
