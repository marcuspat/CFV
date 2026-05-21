/**
 * Integration tests for the Multimodal Ingestion PostgreSQL adapter +
 * transactional outbox. Exercises real SQL against a live database.
 *
 * Gated behind RUN_DB_TESTS=1 so the default unit run (and CI without a
 * database) skips it. Run with:
 *   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://postgres@localhost:5433/cfv_test \
 *     npx jest tests/contexts/multimodal/infrastructure
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import {
  closePool,
  configurePool,
  withTransaction,
} from '../../../../src/server/contexts/../shared/db/pool';
import { PostgresMediaUploadRepository } from '../../../../src/server/contexts/multimodal/infrastructure/postgres';
import { AggregateVersionConflict } from '../../../../src/server/contexts/multimodal/infrastructure/in-memory';
import {
  PostgresOutboxReader,
  PostgresOutboxStore,
} from '../../../../src/server/shared/outbox/postgres';
import { wrapEvent, type EnvelopeContext } from '../../../../src/server/shared/outbox/envelope';
import { MediaUpload } from '../../../../src/server/contexts/multimodal/domain/media-upload';
import {
  ConversationId,
  DiarisationResult,
  MimeType,
  NonVerbalFeatureSet,
  RetentionPolicy,
  SpeakerId,
  TenantId,
  Transcription,
  UploadId,
} from '../../../../src/server/contexts/multimodal/domain/value-objects';

const RUN = process.env.RUN_DB_TESTS === '1';
const DSN = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/cfv_test';

const TENANT = TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T0');
let counter = 0;
function newUlid(): string {
  counter += 1;
  const stem = counter.toString(32).toUpperCase().replace(/I|L|O|U/g, '0');
  return stem.padStart(26, '0');
}

function envCtx(): EnvelopeContext {
  return {
    tenantId: TENANT,
    actor: { type: 'SYSTEM', id: 'test' },
    correlationId: newUlid(),
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    newEventId: () => newUlid(),
  };
}

function makeUpload(args?: { retainMedia?: boolean; maxAgeDays?: number; now?: Date }): MediaUpload {
  return MediaUpload.upload({
    id: UploadId.of(newUlid()),
    tenantId: TENANT,
    mimeType: MimeType.of('audio/wav'),
    byteSize: 1024,
    retentionPolicy: RetentionPolicy.of({
      retainMedia: args?.retainMedia ?? false,
      maxAgeDays: args?.maxAgeDays ?? 0,
    }),
    storageKey: `tenant/${TENANT}/obj-${counter}`,
    now: args?.now ?? new Date('2026-01-01T00:00:00Z'),
  });
}

function markProcessed(upload: MediaUpload, now: Date): void {
  upload.markProcessed({
    conversationId: ConversationId.of(newUlid()),
    transcription: Transcription.of([{ word: 'hi', startMs: 0, endMs: 100, confidence: 0.9 }]),
    diarisation: DiarisationResult.of([
      { speakerId: SpeakerId.of(newUlid()), startMs: 0, endMs: 100, text: 'hi' },
    ]),
    nonVerbal: NonVerbalFeatureSet.of({ silences: [{ startMs: 100, endMs: 200 }] }),
    durationMs: 100,
    now,
  });
}

(RUN ? describe : describe.skip)('Multimodal PostgreSQL adapter (integration)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DSN });
    configurePool(pool);
    const ddl = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
    await pool.query(ddl('src/server/shared/outbox/ddl/0001_domain_event_outbox.sql'));
    await pool.query(ddl('src/server/contexts/multimodal/infrastructure/ddl/0001_multimodal.sql'));
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE media_uploads, domain_event_outbox');
  });

  afterAll(async () => {
    await closePool();
  });

  it('persists an upload and its outbox events atomically in one transaction', async () => {
    const uploads = new PostgresMediaUploadRepository();
    const outbox = new PostgresOutboxStore();
    const reader = new PostgresOutboxReader();
    const upload = makeUpload();
    const events = upload.pullEvents();

    await withTransaction(async () => {
      await uploads.save(upload, 0);
      await outbox.append(events.map((e) => wrapEvent<unknown>(e, envCtx())));
    });

    const loaded = await uploads.findById(upload.id, TENANT);
    expect(loaded?.id).toBe(upload.id);
    expect(loaded?.status).toBe('UPLOADED');
    expect(loaded?.mimeType.value).toBe('audio/wav');

    const unpublished = await reader.readUnpublished(10);
    expect(unpublished).toHaveLength(1);
    expect(unpublished[0].eventType).toBe('MediaUploaded');
  });

  it('rolls back the upload write when the transaction throws', async () => {
    const uploads = new PostgresMediaUploadRepository();
    const upload = makeUpload();
    await expect(
      withTransaction(async () => {
        await uploads.save(upload, 0);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await uploads.findById(upload.id, TENANT)).toBeNull();
  });

  it('is tenant-isolated on findById', async () => {
    const uploads = new PostgresMediaUploadRepository();
    const upload = makeUpload();
    await withTransaction(() => uploads.save(upload, 0));
    const other = await uploads.findById(upload.id, TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T1'));
    expect(other).toBeNull();
  });

  it('enforces optimistic concurrency on insert', async () => {
    const uploads = new PostgresMediaUploadRepository();
    const upload = makeUpload();
    await withTransaction(() => uploads.save(upload, 0));
    await expect(withTransaction(() => uploads.save(upload, 0))).rejects.toBeInstanceOf(
      AggregateVersionConflict,
    );
  });

  it('enforces optimistic concurrency on update', async () => {
    const uploads = new PostgresMediaUploadRepository();
    const upload = makeUpload();
    await withTransaction(() => uploads.save(upload, 0));
    markProcessed(upload, new Date('2026-01-02T00:00:00Z'));
    // Stale expectedVersion (0 instead of 1) must conflict.
    await expect(withTransaction(() => uploads.save(upload, 0))).rejects.toBeInstanceOf(
      AggregateVersionConflict,
    );
  });

  it('round-trips a PROCESSED upload with nested value objects', async () => {
    const uploads = new PostgresMediaUploadRepository();
    const upload = makeUpload({ retainMedia: true, maxAgeDays: 30 });
    await withTransaction(() => uploads.save(upload, 0));
    markProcessed(upload, new Date('2026-01-02T00:00:00Z'));
    await withTransaction(() => uploads.save(upload, 1));

    const loaded = await uploads.findById(upload.id, TENANT);
    expect(loaded?.status).toBe('PROCESSED');
    const snap = loaded!.snapshot();
    expect(snap.transcription?.text()).toBe('hi');
    expect(snap.diarisation?.turns).toHaveLength(1);
    expect(snap.nonVerbal?.silences).toHaveLength(1);
    expect(snap.conversationId).toBe(upload.conversationId);
  });

  it('lists expired retained media past the retention horizon', async () => {
    const uploads = new PostgresMediaUploadRepository();
    // Retained, aged beyond horizon -> expired.
    const aged = makeUpload({ retainMedia: true, maxAgeDays: 30, now: new Date('2026-01-01T00:00:00Z') });
    await withTransaction(() => uploads.save(aged, 0));
    markProcessed(aged, new Date('2026-01-01T01:00:00Z'));
    await withTransaction(() => uploads.save(aged, 1));

    // Retained but still fresh -> not expired.
    const fresh = makeUpload({ retainMedia: true, maxAgeDays: 30, now: new Date('2026-03-01T00:00:00Z') });
    await withTransaction(() => uploads.save(fresh, 0));
    markProcessed(fresh, new Date('2026-03-01T01:00:00Z'));
    await withTransaction(() => uploads.save(fresh, 1));

    const expired = await uploads.listExpired(new Date('2026-03-15T00:00:00Z'));
    const ids = expired.map((u) => u.id);
    expect(ids).toContain(aged.id);
    expect(ids).not.toContain(fresh.id);
  });
});
