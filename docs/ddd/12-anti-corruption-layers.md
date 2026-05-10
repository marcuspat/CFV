# 12. Anti-Corruption Layers

An **Anti-Corruption Layer (ACL)** is a translation boundary that prevents
the model of an upstream system from leaking into ours. ACLs are the
single most important mechanism for keeping the domain stable while the
ecosystem around it churns. CFV's reliance on external providers (LLMs,
ASR, dialogue toolkits) and on the polyglot internal contract makes ACLs
non-negotiable
([ADR-0017](../adr/0017-anti-corruption-layer-for-llm-providers.md)).

## ACL Catalogue

Each ACL is defined by:

- A **port** — an interface in `application/ports/` named for the
  domain capability.
- One or more **adapters** — implementations in `infrastructure/`.
- A **canonical type** — the value object the rest of the domain
  consumes.
- A **failure mapping** — provider errors translated to a small set of
  domain-defined errors.

### LLM Providers (Ensemble Members)

- **Port:** `LanguageModelClient`
  ```ts
  interface LanguageModelClient {
    invoke(request: ModelInvocation): Promise<ModelResponse>;
    readonly memberId: MemberId;
    readonly version: MemberVersion;
  }
  ```
- **Adapters:** `OpenAiLlmClient`, `AnthropicLlmClient`, …
- **Canonical types:** `ModelInvocation`, `ModelResponse`,
  `ModelInvocationError`.
- **Failure mapping:** provider rate-limit → `UpstreamRateLimited`;
  5xx → `UpstreamUnavailable`; malformed JSON → `UpstreamMalformedResponse`.
- **ADR:** ADR-0008, ADR-0017.

### ASR / Speech-to-Text

- **Port:** `SpeechRecognitionClient`
  ```ts
  interface SpeechRecognitionClient {
    transcribe(input: AudioInput): Promise<Transcription>;
  }
  ```
- **Canonical type:** `Transcription` with word-level timestamps.
- **ADR:** ADR-0015.

### Diarisation

- **Port:** `DiariserClient` returning `DiarisationResult` (speaker turns
  with start/end and a synthetic speaker label).
- **ADR:** ADR-0015.

### Non-Verbal Feature Extraction

- **Port:** `NonVerbalFeatureExtractor` returning `NonVerbalFeatureSet`.
- **ADR:** ADR-0015.

### Dialogue Segmentation (Rasa)

- **Port:** `DialogueSegmenter`
  ```ts
  interface DialogueSegmenter {
    segment(conversation: Conversation): Promise<SegmentBoundary[]>;
  }
  ```
- **Adapters:** `RasaDialogueSegmenter` (primary),
  `HeuristicDialogueSegmenter` (fallback). The fallback is engaged
  automatically on `UpstreamUnavailable` and tags its output with
  `source: "FALLBACK"`.
- **ADR:** ADR-0014.

### Multimodal Provider (where used)

- **Port:** `MultimodalProcessor` if a single end-to-end provider is
  used; otherwise the multimodal pipeline composes the ASR / diarisation
  / non-verbal ports above.

### TS ↔ Python Sidecar Contract

- **Port:** `MlGateway` — the TypeScript port through which the
  application monolith calls into the Python ML sidecar.
  ```ts
  interface MlGateway {
    requestAnalysis(req: AnalysisRequest): Promise<void>;
    requestSnapshot(req: SnapshotRequest): Promise<void>;
  }
  ```
- **Wire format:** versioned canonical schema (Protobuf or JSON Schema —
  decided in implementation phase). Generated TypeScript and Python
  types share the same canonical schema; neither side hand-writes the
  wire types.
- **ADR:** ADR-0017, ADR-0025.

### Object Storage

- **Port:** `BlobStore`
  ```ts
  interface BlobStore {
    put(key: string, bytes: Uint8Array, meta: ObjectMeta): Promise<Url>;
    get(key: string): Promise<Uint8Array>;
    delete(key: string): Promise<void>;
  }
  ```
- **Adapters:** `S3BlobStore`, `LocalFsBlobStore` (development).
- **Canonical type:** `Url` value object with signed-URL TTL semantics.

### Email / Notification Channels (future)

- **Port:** `EmailChannel`, `WebhookHttpClient` for the Notifications &
  Webhooks context.
- The webhook adapter does HMAC signing and exponential-backoff retries.

### Observability Backend

- **Port:** `Telemetry`
  ```ts
  interface Telemetry {
    span(name: string, fn: () => Promise<T>): Promise<T>;
    recordMetric(name: string, value: number, tags: Record<string,string>): void;
    log(level: Level, event: string, fields: Record<string,unknown>): void;
  }
  ```
- **Adapters:** OpenTelemetry-backed implementations.
- **ADR:** ADR-0019.

## Translation Patterns

ACLs use one of three translation patterns; the catalogue above tags each
ACL with the dominant pattern.

1. **Direct mapping.** One field per provider field; minor renames only.
   Used when the provider's model is close enough to our canonical type.
2. **Reduction.** Provider returns more than we need; we extract a
   minimal canonical projection and discard the rest. Used for LLM
   responses (we keep dimension assignments, evidence spans, and
   self-reported confidence; we discard provider metadata that is not
   useful downstream).
3. **Composition.** Multiple provider calls compose into one canonical
   value. Used for multimodal preprocessing (ASR + diarisation + non-
   verbal extraction → one `NonVerbalFeatureSet` and one
   `Conversation`).

## Failure Translation

External failure modes are mapped onto a small canonical set so the
domain reasons about them uniformly:

| Provider symptom                  | Canonical error           |
|-----------------------------------|---------------------------|
| Network timeout / connection refused | `UpstreamUnavailable`  |
| HTTP 429                          | `UpstreamRateLimited`     |
| HTTP 4xx (other than 429)         | `UpstreamRequestRejected` |
| HTTP 5xx                          | `UpstreamUnavailable`     |
| Schema-mismatch in body           | `UpstreamMalformedResponse` |
| Auth/credentials error            | `UpstreamCredentialsInvalid` |
| Cost / quota exhausted            | `UpstreamQuotaExhausted`  |

The application service decides what to do with each:

- `UpstreamRateLimited` → exponential backoff, then `Degraded`
  completion if budget exhausted.
- `UpstreamUnavailable` → fall back where available (ADR-0014); else
  fail the stage and emit `AnalysisFailed`.
- `UpstreamMalformedResponse` → log + circuit-break the offending
  member; do not retry.

## Versioning

External contracts are versioned in the adapter; canonical types in the
domain are versioned via the standard ADR / SemVer process
([ADR-0025](../adr/0025-versioning-and-release-strategy.md)). When a
provider releases a breaking change, the adapter absorbs it; the canonical
type does not move unless the change introduces a *domain* concept that
deserves to be modelled.

## Testing

- Each adapter has **recorded contract tests** using fixtures captured
  from the real provider (sanitised). Recordings are versioned in the
  repository.
- A **chaos test** disables each adapter in turn and asserts the domain
  degrades correctly (ADR-0018).
- A **lint rule** prevents `domain/` and `application/` from importing
  provider SDKs.
