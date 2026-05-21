/**
 * PostgreSQL implementations of the Multimodal Ingestion repositories.
 *
 * All queries run on the ambient Unit-of-Work client (shared/db/pool.ts) so
 * they commit atomically with the transactional outbox. Optimistic
 * concurrency mirrors the in-memory adapter's contract: callers pass the
 * aggregate version *before* the mutation as `expectedVersion`.
 */

import { getQueryable } from '../../../shared/db/pool';
import { MediaUpload, type MediaStatus } from '../domain/media-upload';
import {
  ConversationId,
  DiarisationResult,
  MimeType,
  NonVerbalFeatureSet,
  RetentionPolicy,
  TenantId,
  Transcription,
  UploadId,
} from '../domain/value-objects';
import type { MediaUploadRepository } from '../application/ports';
import { AggregateVersionConflict } from './in-memory';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

// ---------------------------------------------------------------------------
// MediaUpload repository
// ---------------------------------------------------------------------------

const COLUMNS = `id, tenant_id, mime_type, byte_size, status, retain_media, max_age_days,
                 storage_key, conversation_id, transcription, diarisation, non_verbal,
                 created_at, processed_at, purged_at, version`;

export class PostgresMediaUploadRepository implements MediaUploadRepository {
  async findById(id: UploadId, tenantId: TenantId): Promise<MediaUpload | null> {
    const { rows } = await getQueryable().query(
      `SELECT ${COLUMNS} FROM media_uploads WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return rows[0] ? hydrate(rows[0]) : null;
  }

  async save(upload: MediaUpload, expectedVersion: number): Promise<void> {
    const s = upload.snapshot();
    const db = getQueryable();
    const transcription = s.transcription ? JSON.stringify({ words: s.transcription.words }) : null;
    const diarisation = s.diarisation ? JSON.stringify({ turns: s.diarisation.turns }) : null;
    const nonVerbal = s.nonVerbal
      ? JSON.stringify({
          silences: s.nonVerbal.silences,
          overlaps: s.nonVerbal.overlaps,
          emphasis: s.nonVerbal.emphasis,
        })
      : null;
    if (expectedVersion === 0) {
      try {
        await db.query(
          `INSERT INTO media_uploads (${COLUMNS})
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            s.id,
            s.tenantId,
            s.mimeType.value,
            s.byteSize,
            s.status,
            s.retentionPolicy.retainMedia,
            s.retentionPolicy.maxAgeDays,
            s.storageKey,
            s.conversationId,
            transcription,
            diarisation,
            nonVerbal,
            s.createdAt,
            s.processedAt,
            s.purgedAt,
            s.version,
          ],
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw new AggregateVersionConflict('MediaUpload', s.id);
        throw err;
      }
      return;
    }
    const { rowCount } = await db.query(
      `UPDATE media_uploads
          SET status = $2, conversation_id = $3, transcription = $4, diarisation = $5,
              non_verbal = $6, processed_at = $7, purged_at = $8, version = $9
        WHERE id = $1 AND version = $10`,
      [
        s.id,
        s.status,
        s.conversationId,
        transcription,
        diarisation,
        nonVerbal,
        s.processedAt,
        s.purgedAt,
        s.version,
        expectedVersion,
      ],
    );
    if (rowCount !== 1) throw new AggregateVersionConflict('MediaUpload', s.id);
  }

  async listExpired(now: Date): Promise<ReadonlyArray<MediaUpload>> {
    // Mirror the in-memory contract: only retained, PROCESSED media whose age
    // (in whole-day fractions) has reached the policy horizon is expired.
    const { rows } = await getQueryable().query(
      `SELECT ${COLUMNS} FROM media_uploads
        WHERE status = 'PROCESSED'
          AND retain_media = TRUE
          AND created_at <= $1::timestamptz - (max_age_days * INTERVAL '1 day')`,
      [now],
    );
    return rows.map(hydrate);
  }
}

function hydrate(row: Record<string, unknown>): MediaUpload {
  const transcription = row.transcription as { words: Transcription['words'] } | null;
  const diarisation = row.diarisation as { turns: DiarisationResult['turns'] } | null;
  const nonVerbal = row.non_verbal as {
    silences?: NonVerbalFeatureSet['silences'];
    overlaps?: NonVerbalFeatureSet['overlaps'];
    emphasis?: NonVerbalFeatureSet['emphasis'];
  } | null;
  return MediaUpload.rehydrate({
    id: UploadId.of(String(row.id)),
    tenantId: TenantId.of(String(row.tenant_id)),
    mimeType: MimeType.of(String(row.mime_type)),
    byteSize: Number(row.byte_size),
    status: String(row.status) as MediaStatus,
    retentionPolicy: RetentionPolicy.of({
      retainMedia: Boolean(row.retain_media),
      maxAgeDays: Number(row.max_age_days),
    }),
    storageKey: String(row.storage_key),
    conversationId: row.conversation_id ? ConversationId.of(String(row.conversation_id)) : null,
    transcription: transcription ? Transcription.of(transcription.words) : null,
    diarisation: diarisation ? DiarisationResult.of(diarisation.turns) : null,
    nonVerbal: nonVerbal ? NonVerbalFeatureSet.of(nonVerbal) : null,
    createdAt: row.created_at as Date,
    processedAt: (row.processed_at as Date | null) ?? null,
    purgedAt: (row.purged_at as Date | null) ?? null,
    version: Number(row.version),
  });
}
