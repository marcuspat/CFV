# CFV Use Case Guide

## What Is CFV?

The **Cognitive Fabric Visualizer** is a backend API that ingests conversational text and returns a structured analysis of the cognitive work happening inside the conversation.

It answers the question: *"What kinds of thinking are present in this conversation, and in what proportion?"*

The system maps conversation turns to four dimensions:

| Dimension | What it captures |
|---|---|
| `FACTUAL_RETRIEVAL` | Stating facts, recalling information, citing data |
| `LOGICAL_INFERENCE` | Reasoning, drawing conclusions, "therefore..." thinking |
| `CREATIVE_SYNTHESIS` | Novel ideas, analogies, combinations, "what if..." thinking |
| `META_COGNITION` | Reflecting on the conversation itself, strategy, self-awareness |

---

## Who Benefits From CFV?

### Researchers studying conversation and cognition

You have transcripts from interviews, focus groups, or research sessions. CFV lets you programmatically categorize cognitive load across a corpus of conversations without hand-coding every turn. The structured JSON output (per-segment dimension scores, confidence, stage metadata) integrates directly with data analysis pipelines.

### Engineering teams building conversation-aware products

CFV provides the backend plumbing: authenticated multi-tenant API, conversation storage, analysis saga, event relay. You can integrate it as the analysis layer in a product that records and annotates calls, meetings, or chat logs.

### Educators and learning platform builders

A tutoring or classroom platform can send student–tutor transcripts to CFV and receive back which turns were factual recall versus genuine reasoning or creative problem-solving. That signal can drive adaptive feedback or assessment scoring.

### Developers evaluating DDD + hexagonal architecture patterns

CFV is a complete working example of Domain-Driven Design with TypeScript: six bounded contexts, a transactional outbox, AsyncLocalStorage-based Unit of Work, optimistic concurrency, and Result<Ok,Err> application services. It is intended to be readable reference architecture as well as a running system.

---

## Core Scenarios

### Scenario 1: Analyze a meeting transcript

A product team records a design review meeting. They want to know whether the session was mostly information sharing or whether genuine reasoning and creative synthesis occurred.

**Step 1 — Authenticate**

```bash
curl -X POST https://your-cfv-host/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"analyst@company.com","password":"..."}'
```

Response includes `accessToken`.

**Step 2 — Ingest the transcript**

```bash
curl -X POST https://your-cfv-host/api/conversations \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Design Review 2026-05-24",
    "transcript": [
      "The current latency is 340ms under load.",
      "If we cache at the CDN layer we should drop that below 100ms.",
      "What if we pre-warm the cache based on predicted access patterns?",
      "That would require us to rethink the invalidation strategy."
    ]
  }'
```

Response: `{"conversationId":"01KSB...","status":"INGESTED"}`

**Step 3 — Start analysis**

```bash
curl -X POST https://your-cfv-host/api/analysis/start \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"01KSB..."}'
```

**Step 4 — Poll for results**

```bash
# Poll status
curl -H "Authorization: Bearer <access_token>" \
  https://your-cfv-host/api/analysis/<analysis_id>/status

# Fetch result when complete
curl -H "Authorization: Bearer <access_token>" \
  https://your-cfv-host/api/analysis/<analysis_id>/result
```

The result contains per-segment dimension assignments, stage metadata (SEGMENT → DECOMPOSE → FUSE → SYMBOLIC → GRAPH_UPDATE → THREAD_PREDICT → NOTIFY), and a summary object. For the example above, turns 1 and 2 would skew toward `FACTUAL_RETRIEVAL` and `LOGICAL_INFERENCE`; turns 3 and 4 toward `CREATIVE_SYNTHESIS` and `META_COGNITION`.

---

### Scenario 2: Compare cognitive profiles across multiple conversations

A learning platform runs CFV on 200 student-tutor sessions. For each conversation the platform calls `/api/analysis/start`, collects the result JSON, and aggregates the dimension scores. Sessions where `LOGICAL_INFERENCE` scores are low relative to `FACTUAL_RETRIEVAL` flag students who are recalling but not reasoning — a signal for the adaptive engine.

CFV's multi-tenant data model means each school district is a separate tenant; one CFV deployment serves all without data leakage between tenants.

---

### Scenario 3: Event-driven downstream processing

CFV publishes domain events to Redis Streams via the transactional outbox (ADR-0012). A downstream service (reporting, notification, visualization layer) subscribes to `cfv:events` and receives `GraphNodeAdded`, `AnalysisCompleted`, and other events in order.

```
Redis XREAD cfv:events
  → {"eventType":"ConversationIngested","conversationId":"01KSB...","tenantId":"..."}
  → {"eventType":"AnalysisCompleted","analysisId":"01KSC...","tenantId":"..."}
```

Because events are written atomically with aggregate saves (Unit of Work), consumers never see a `ConversationIngested` without the conversation actually existing in the database.

---

### Scenario 4: Exploring the architecture as a reference implementation

CFV demonstrates several patterns that are difficult to find as complete, running examples:

- **AsyncLocalStorage Unit of Work**: `withTransaction()` in `src/server/shared/db/pool.ts` creates an ambient transaction context. Repositories and the outbox store call `getQueryable()` and automatically participate in the transaction — no transaction handle threading required.

- **Transactional outbox**: `PostgresOutboxStore.append()` and `PostgresConversationRepository.save()` both call `getQueryable()`, so domain events land in the same PostgreSQL transaction as the aggregate. `OutboxRelay` then drains them to Redis Streams with at-least-once delivery.

- **Optimistic concurrency**: Repositories do `INSERT ... WHERE NOT EXISTS` on version=0, or `UPDATE ... WHERE id = $1 AND version = $expected` on subsequent saves. Row count = 0 raises `AggregateVersionConflict`.

- **Branded value objects**: All IDs are 26-character Crockford base32 ULIDs enforced by TypeScript branded types (`UserId`, `ConversationId`, `AnalysisId`, etc.) and validated at construction.

- **Result<Ok,Err> pattern**: Application services return `Result` rather than throwing for expected errors. Routes map `ApplicationError` subclasses to HTTP status codes (400 → validation, 401 → unauthenticated, 404 → not found, 409 → conflict).

The domain models are in `src/server/contexts/<context>/domain/`, application services in `.../application/`, and PostgreSQL adapters in `.../infrastructure/postgres.ts`.

---

## What Is Not Yet Available

| Feature | Status |
|---|---|
| Real ML classifier | Heuristic placeholder — keyword/pattern matching |
| Neo4j cognitive graph | Infrastructure code exists; not wired into live routes |
| React 3D frontend | Exists in `src/client/` as a separate package; needs its own dev server |
| Multimodal input (audio/video) | Domain model and upload pipeline exist; transcription not integrated |
| OpenAI/Anthropic API calls | Config env vars accepted but not called |

The primary remaining work is replacing `FakeLanguageModelClient` in `src/server/composition/cognitive-analysis.ts` with real API calls. Everything else — routing, persistence, auth, events — is production-hardened.

---

## Getting Started

See [README.md](../README.md) for environment setup, required env vars, DDL application, and how to run the test suite.

See [BUILD_VERIFICATION.md](BUILD_VERIFICATION.md) for recorded command inputs and outputs proving each layer works.
