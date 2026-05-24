# Cognitive Fabric Visualizer (CFV)

**Analyze conversations into their cognitive components and persist the results via a production-hardened DDD API.**

CFV is a TypeScript/Node.js backend system that ingests text conversations, segments them into turns, and classifies each segment across four cognitive dimensions: `FACTUAL_RETRIEVAL`, `LOGICAL_INFERENCE`, `CREATIVE_SYNTHESIS`, and `META_COGNITION`. The results are stored in PostgreSQL and exposed through a secured REST API with JWT authentication.

## What It Does Today

| Capability | Status |
|---|---|
| User registration and login (bcrypt + JWT + refresh tokens) | Working |
| Conversation ingestion (text transcript or structured turns) | Working |
| 7-stage cognitive analysis saga (heuristic classifier) | Working |
| Transactional outbox → Redis Streams event relay | Working |
| PostgreSQL persistence for all bounded contexts | Working |
| WebSocket server (real-time push) | Working |
| Cognitive-graph visualization (Neo4j) | Deferred — not wired |
| ML-backed classifier (OpenAI/Anthropic ensemble) | Placeholder — heuristic only |
| React 3D frontend | Separate package — independent dev server |

## Architecture

CFV follows Domain-Driven Design with hexagonal ports-and-adapters. Six bounded contexts live in `src/server/contexts/`:

```
identity              – users, tenants, refresh tokens
conversation-ingestion – conversations, turns, analysis sessions
multimodal            – media uploads and processing jobs
model-management      – analysis bundles, shadow deployments
cognitive-analysis    – analysis aggregate, 7-stage saga
cognitive-graph       – graph nodes and edges (Neo4j, deferred)
```

All contexts share:
- **`src/server/shared/db/pool.ts`** — PostgreSQL pool + `AsyncLocalStorage`-based Unit of Work (`withTransaction` / `getQueryable`)
- **`src/server/shared/outbox/`** — Transactional outbox pattern (ADR-0012): domain events written in the same transaction as aggregates, relayed to Redis Streams

Composition roots in `src/server/composition/` wire repositories, use cases, and infrastructure adapters and return typed module objects that the Express router layer consumes.

### Live HTTP Routes

```
GET  /health                      – liveness check (no auth)
GET  /                            – API manifest (no auth)

POST /api/auth/register           – create account
POST /api/auth/login              – obtain JWT + refresh token
POST /api/auth/refresh            – rotate refresh token
POST /api/auth/logout             – revoke refresh token
GET  /api/auth/me                 – current user (auth required)

POST /api/conversations           – ingest conversation transcript
GET  /api/conversations           – list conversations for tenant
GET  /api/conversations/:id       – fetch single conversation
DELETE /api/conversations/:id     – delete conversation

POST /api/analysis/start          – start analysis saga on a conversation
GET  /api/analysis/:id/status     – poll saga stage
GET  /api/analysis/:id/result     – fetch analysis summary
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (for auth, conversations, analysis)
- Redis 6+ (for event relay — optional, degrades gracefully)

### Environment Variables

```bash
# Required
JWT_SECRET=<at-least-32-character-random-string>

# PostgreSQL (defaults below work with a local PG on port 5432)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cognitive_fabric
DB_USER=postgres
DB_PASSWORD=password

# Optional — Redis for event relay
REDIS_URL=redis://localhost:6379

# Optional — ML pipeline (not yet integrated; system works without them)
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

### Development

```bash
# Install dependencies
npm install

# Type check
npx tsc --noEmit

# Run all unit tests (no DB required)
npx jest

# Start development server
npm run dev
```

### Running with a Database

```bash
# Apply DDL (run once per schema; paths relative to project root)
psql "$DATABASE_URL" -f src/server/contexts/identity/infrastructure/ddl/0001_identity.sql
psql "$DATABASE_URL" -f src/server/contexts/conversation-ingestion/infrastructure/ddl/0001_conversation_ingestion.sql
psql "$DATABASE_URL" -f src/server/contexts/multimodal/infrastructure/ddl/0001_multimodal.sql
psql "$DATABASE_URL" -f src/server/contexts/model-management/infrastructure/ddl/0001_model_management.sql
psql "$DATABASE_URL" -f src/server/contexts/cognitive-analysis/infrastructure/ddl/0001_cognitive_analysis.sql
psql "$DATABASE_URL" -f src/server/shared/outbox/ddl/0001_domain_event_outbox.sql

# Start server
npm run dev
```

### Production Build

```bash
npm run build          # emits CommonJS to dist/
node dist/server/index.js
```

### Integration Tests (requires live PG + Redis)

```bash
RUN_DB_TESTS=1 \
  TEST_DATABASE_URL=postgresql://postgres@localhost:5432/cfv_test \
  TEST_REDIS_URL=redis://localhost:6379 \
  npx jest --testPathPattern=integration --runInBand
```

## Test Status

```
Unit tests (no DB):   316 passing, 61 skipped (integration suites, gated)
Integration tests:     61 passing (10 suites, requires RUN_DB_TESTS=1)
Type check:            0 errors
Production build:      clean
```

## Documentation

| Document | Description |
|---|---|
| [docs/USE_CASE_GUIDE.md](docs/USE_CASE_GUIDE.md) | What CFV is for and how to get value from it |
| [docs/BUILD_VERIFICATION.md](docs/BUILD_VERIFICATION.md) | Recorded command inputs and outputs proving the system works |
| [docs/adr/](docs/adr/) | Architectural Decision Records (ADR-0001 through ADR-0016) |
| [docs/ddd/](docs/ddd/) | Domain model, bounded context maps, ubiquitous language |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | API endpoint reference |
| [docs/ARCHITECTURE_GUIDE.md](docs/ARCHITECTURE_GUIDE.md) | System architecture deep dive |

## Honest Capability Statement

The analysis engine currently uses a **heuristic ensemble** (`FakeLanguageModelClient`) that classifies cognitive dimensions from keyword and pattern matching. It is explicitly labelled a placeholder. The four dimension accuracy figures in earlier project documents (92%, 85%, 0.60 ROUGE-L, 0.96 F1) are **design targets**, not measured results.

Replacing the heuristic with a real ML model (OpenAI/Anthropic API calls or a local model) is the primary remaining work item. The infrastructure — ingestion pipeline, 7-stage saga, PostgreSQL persistence, Redis event relay — is production-hardened and ready to accept a real classifier.

## Technology Stack

- **Runtime**: Node.js 22, TypeScript 5
- **Web framework**: Express 4 with helmet, cors, compression, express-rate-limit
- **Persistence**: PostgreSQL 14+ (via `pg` pool), Redis 6+ (via `node-redis` v4)
- **Auth**: bcryptjs, jsonwebtoken (HS256), ULID-based IDs (Crockford base32)
- **Real-time**: WebSocket (`ws`)
- **Testing**: Jest + ts-jest, supertest
- **Build**: tsc → CommonJS dist

## License

ISC
