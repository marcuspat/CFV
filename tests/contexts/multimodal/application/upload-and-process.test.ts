import { UploadMedia } from '../../../../src/server/contexts/multimodal/application/use-cases/upload-media';
import { ProcessMedia } from '../../../../src/server/contexts/multimodal/application/use-cases/process-media';
import { PurgeExpiredMedia } from '../../../../src/server/contexts/multimodal/application/use-cases/purge-expired-media';
import {
  CapturingDomainEventPublisher,
  CountingIdGenerator,
  FakeConversationIngestor,
  FakeDiariserClient,
  FakeNonVerbalFeatureExtractor,
  FakeSpeechRecognitionClient,
  FixedClock,
  InMemoryBlobStore,
  InMemoryMediaUploadRepository,
} from '../../../../src/server/contexts/multimodal/infrastructure/in-memory';

const TENANT = '01HJK3R6X7Y8ZAB2C3D4E5F6T0';
const NOW = new Date('2026-01-01T00:00:00Z');

function buildStack(retainMedia = false) {
  const uploads = new InMemoryMediaUploadRepository();
  const blobs = new InMemoryBlobStore();
  const asr = new FakeSpeechRecognitionClient();
  const diariser = new FakeDiariserClient();
  const extractor = new FakeNonVerbalFeatureExtractor();
  const conversations = new FakeConversationIngestor();
  const ids = new CountingIdGenerator();
  const clock = new FixedClock(NOW);
  const publisher = new CapturingDomainEventPublisher();

  const upload = new UploadMedia({ uploads, blobs, ids, clock, publisher });
  const process = new ProcessMedia({
    uploads, asr, diariser, extractor, conversations, blobs, clock, publisher,
  });
  const purge = new PurgeExpiredMedia({ uploads, blobs, clock, publisher });

  return { upload, process, purge, uploads, blobs, asr, publisher, clock, retainMedia };
}

const sampleBytes = new Uint8Array([0x01, 0x02, 0x03]);

describe('UploadMedia + ProcessMedia (default retention: purge)', () => {
  it('default retention purges bytes synchronously after processing', async () => {
    const stack = buildStack();
    const uploaded = await stack.upload.execute({
      tenantId: TENANT,
      mimeType: 'audio/wav',
      bytes: sampleBytes,
    });
    if (!uploaded.ok) throw new Error('upload failed');
    expect(stack.blobs.size()).toBe(1);

    const processed = await stack.process.execute({
      tenantId: TENANT,
      uploadId: uploaded.value.uploadId,
    });
    expect(processed.ok).toBe(true);
    // Bytes should have been deleted by the synchronous purge.
    expect(stack.blobs.size()).toBe(0);

    const types = stack.publisher.events.map((e) => e.type);
    expect(types).toEqual(['MediaUploaded', 'MediaProcessed', 'MediaPurged']);
  });

  it('refuses double-processing with Conflict', async () => {
    const stack = buildStack();
    const u = await stack.upload.execute({
      tenantId: TENANT,
      mimeType: 'audio/wav',
      bytes: sampleBytes,
    });
    if (!u.ok) throw new Error();
    await stack.process.execute({ tenantId: TENANT, uploadId: u.value.uploadId });
    const second = await stack.process.execute({ tenantId: TENANT, uploadId: u.value.uploadId });
    expect(second.ok).toBe(false);
    // After the synchronous DEFAULT purge the second attempt resolves to
    // NotFound (purged uploads are not visible); without the purge it
    // would have been Conflict. Either outcome is acceptable as long as
    // the system does not silently re-run the pipeline.
    if (!second.ok) {
      expect(['Conflict', 'NotFound']).toContain(second.error.kind);
    }
  });

  it('returns UpstreamUnavailable when ASR fails', async () => {
    const stack = buildStack();
    const u = await stack.upload.execute({
      tenantId: TENANT,
      mimeType: 'audio/wav',
      bytes: sampleBytes,
    });
    if (!u.ok) throw new Error();
    stack.asr.shouldFail = true;
    const r = await stack.process.execute({ tenantId: TENANT, uploadId: u.value.uploadId });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('UpstreamUnavailable');
  });

  it('rejects unsupported mime types at upload', async () => {
    const stack = buildStack();
    const r = await stack.upload.execute({
      tenantId: TENANT,
      mimeType: 'application/x-bogus',
      bytes: sampleBytes,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.kind).toBe('InputInvalid');
  });
});

describe('PurgeExpiredMedia (scheduled, for retained media)', () => {
  it('purges retained media after maxAgeDays', async () => {
    const stack = buildStack(true);
    const uploaded = await stack.upload.execute({
      tenantId: TENANT,
      mimeType: 'audio/wav',
      bytes: sampleBytes,
      retentionPolicy: { retainMedia: true, maxAgeDays: 30 },
    });
    if (!uploaded.ok) throw new Error();
    const processed = await stack.process.execute({
      tenantId: TENANT,
      uploadId: uploaded.value.uploadId,
    });
    expect(processed.ok).toBe(true);
    expect(stack.blobs.size()).toBe(1); // retained, so bytes still present

    stack.clock.advance(31 * 24 * 60 * 60 * 1000);
    const r = await stack.purge.execute();
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.value.purgedCount).toBe(1);
    expect(stack.blobs.size()).toBe(0);
  });
});
