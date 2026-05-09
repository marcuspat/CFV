# 15. Multimodal Input Pipeline (Text, Audio, Video)

- **Status:** Accepted
- **Date:** 2024-05-27
- **Deciders:** Core maintainers, ML lead
- **Related:** ADR-0008, ADR-0009, ADR-0017

## Context

Conversations occur in multiple modalities: chat transcripts, meeting audio,
video calls. Restricting CFV to text-only inputs would exclude the largest
real-world use case (meeting analysis). However, video and audio cannot be
fed directly into the cognitive decomposer; they must be transcribed,
diarised (who spoke when), and aligned with non-verbal signals (silence,
overlap, prosodic emphasis) that materially affect cognitive analysis —
hesitation precedes meta-cognition; emphasis correlates with logical
inference.

## Decision

We add a **multimodal preprocessing stage** that normalises any supported
input into a canonical conversation transcript with optional non-verbal
features:

1. **Inputs.** Plain text (JSON, CSV, transcript), audio (WAV, MP3, FLAC),
   and video (MP4, MOV). Other formats are rejected at ingestion with a
   clear error.
2. **Pipeline** (`src/ml/multimodal_processor.py`,
   `src/ml/multimodal_cognitive_integration.py`):
   - **ASR.** Speech-to-text with word-level timestamps.
   - **Diarisation.** Speaker assignment per turn.
   - **Non-verbal features.** Silence durations, overlap detection,
     prosodic emphasis markers, optional facial-expression tags from video.
3. **Canonical output.** The pipeline emits the same `ConversationTurn`
   value object as text-only ingestion, plus an optional
   `nonVerbalFeatures` annotation. Downstream stages do not branch on
   modality.
4. **Privacy.** Audio and video are not retained by default beyond the
   processing window (ADR-0021). A retention flag must be explicitly set
   per organisation to keep media beyond processing.
5. **Cost / latency budget.** Multimodal preprocessing is bounded; large
   uploads are queued and progress-reported via WebSocket.

## Consequences

### Positive

- Same downstream pipeline serves all modalities.
- Non-verbal features improve symbolic-stage rules (ADR-0009).
- Privacy default is conservative.

### Negative

- ASR/diarisation has its own accuracy ceiling that limits cognitive
  accuracy on audio/video inputs.
- Storage and processing costs are higher for media inputs.

### Neutral

- ASR and diarisation are pluggable via the anti-corruption layer
  (ADR-0017); we may swap providers without changing downstream code.

## Alternatives Considered

### Text-only

Rejected: excludes the largest target use case.

### Multimodal LLM end-to-end

Considered for future evaluation; not yet at the price/latency point we
need at scale.

### Per-modality pipelines

Rejected: duplicates downstream code and creates two skews of accuracy
to maintain.

## Compliance and Verification

- ASR word-error-rate (WER) and diarisation error rate (DER) are reported
  in the daily eval suite.
- Privacy default is asserted by an integration test that uploads a
  sample audio file and verifies the file is purged after processing
  unless the retention flag is set.

## References

- `src/ml/multimodal_processor.py`
- `src/ml/multimodal_config.py`
- ADR-0021: Data privacy and GDPR posture
