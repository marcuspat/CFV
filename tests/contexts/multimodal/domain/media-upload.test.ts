import { MediaUpload } from '../../../../src/server/contexts/multimodal/domain/media-upload';
import {
  ConversationId,
  DiarisationResult,
  MimeType,
  NonVerbalFeatureSet,
  RetentionPolicy,
  TenantId,
  Transcription,
  UploadId,
} from '../../../../src/server/contexts/multimodal/domain/value-objects';
import {
  MediaAlreadyProcessed,
  MediaPurged as MediaPurgedErr,
} from '../../../../src/server/contexts/multimodal/domain/errors';

const TENANT = TenantId.of('01HJK3R6X7Y8ZAB2C3D4E5F6T0');
const UPLOAD = UploadId.of('01HJK3R6X7Y8ZAB2C3D4E5F6Y0');
const CONV = ConversationId.of('01HJK3R6X7Y8ZAB2C3D4E5F6C0');
const NOW = new Date('2026-01-01T00:00:00Z');

function makeUpload(retain = false) {
  return MediaUpload.upload({
    id: UPLOAD,
    tenantId: TENANT,
    mimeType: MimeType.of('audio/wav'),
    byteSize: 4096,
    retentionPolicy: retain
      ? RetentionPolicy.of({ retainMedia: true, maxAgeDays: 30 })
      : RetentionPolicy.default(),
    storageKey: 'tenant/x/upload-1',
    now: NOW,
  });
}

function transcript() {
  return Transcription.of([
    { word: 'hi', startMs: 0, endMs: 200, confidence: 0.99 },
  ]);
}

function diarisation() {
  return DiarisationResult.of([]);
}

describe('MediaUpload aggregate', () => {
  it('emits MediaUploaded on construction', () => {
    const u = makeUpload();
    const events = u.pullEvents();
    expect(events.map((e) => e.type)).toEqual(['MediaUploaded']);
  });

  it('rejects unsupported mime types via the value object', () => {
    expect(() => MimeType.of('application/x-bogus')).toThrow();
  });

  it('markProcessed transitions to PROCESSED and emits MediaProcessed', () => {
    const u = makeUpload();
    u.pullEvents();
    u.markProcessed({
      conversationId: CONV,
      transcription: transcript(),
      diarisation: diarisation(),
      nonVerbal: NonVerbalFeatureSet.empty(),
      durationMs: 123,
      now: NOW,
    });
    expect(u.status).toBe('PROCESSED');
    const events = u.pullEvents();
    expect(events.map((e) => e.type)).toEqual(['MediaProcessed']);
    expect(events[0].payload.durationMs).toBe(123);
  });

  it('refuses double-processing', () => {
    const u = makeUpload();
    u.markProcessed({
      conversationId: CONV,
      transcription: transcript(),
      diarisation: diarisation(),
      nonVerbal: NonVerbalFeatureSet.empty(),
      durationMs: 1,
      now: NOW,
    });
    expect(() =>
      u.markProcessed({
        conversationId: CONV,
        transcription: transcript(),
        diarisation: diarisation(),
        nonVerbal: NonVerbalFeatureSet.empty(),
        durationMs: 1,
        now: NOW,
      }),
    ).toThrow(MediaAlreadyProcessed);
  });

  it('purge is idempotent on second call', () => {
    const u = makeUpload();
    u.markProcessed({
      conversationId: CONV,
      transcription: transcript(),
      diarisation: diarisation(),
      nonVerbal: NonVerbalFeatureSet.empty(),
      durationMs: 1,
      now: NOW,
    });
    u.pullEvents();
    u.purge('DEFAULT', NOW);
    expect(u.status).toBe('PURGED');
    expect(u.pullEvents().map((e) => e.type)).toEqual(['MediaPurged']);
    u.purge('DEFAULT', NOW);
    expect(u.pullEvents()).toHaveLength(0); // idempotent
  });

  it('DEFAULT purge is the legitimate path for retained media past its horizon', () => {
    // Eligibility is decided in PurgeExpiredMedia (application layer);
    // the aggregate only enforces the state transition.
    const u = makeUpload(/* retain */ true);
    u.markProcessed({
      conversationId: CONV,
      transcription: transcript(),
      diarisation: diarisation(),
      nonVerbal: NonVerbalFeatureSet.empty(),
      durationMs: 1,
      now: NOW,
    });
    expect(() => u.purge('DEFAULT', NOW)).not.toThrow();
    expect(u.status).toBe('PURGED');
  });

  it('cannot mark a PURGED upload as processed', () => {
    const u = makeUpload();
    u.markProcessed({
      conversationId: CONV,
      transcription: transcript(),
      diarisation: diarisation(),
      nonVerbal: NonVerbalFeatureSet.empty(),
      durationMs: 1,
      now: NOW,
    });
    u.purge('DEFAULT', NOW);
    expect(() =>
      u.markProcessed({
        conversationId: CONV,
        transcription: transcript(),
        diarisation: diarisation(),
        nonVerbal: NonVerbalFeatureSet.empty(),
        durationMs: 1,
        now: NOW,
      }),
    ).toThrow(MediaPurgedErr);
  });
});
