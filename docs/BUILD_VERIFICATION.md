# CFV Validation Report

Generated: 2026-05-24  
Branch: `claude/create-adr-ddd-docs-0BY8F`  
Environment: Ubuntu 24.04 LTS, Node.js v22.22.2, npm 10.9.7

All commands were executed against the live codebase. Outputs are verbatim (trimmed where noted).

---

## 1. Environment

```
$ node --version
v22.22.2

$ npm --version
10.9.7
```

---

## 2. Type Check

```
$ npx tsc --noEmit
(no output)

Exit code: 0
Errors: 0
```

The type-check covers `src/server/**` and `src/types/**`. The legacy monitoring service (`src/server/services/monitoring/`) and client code (`src/client/`) are excluded via `tsconfig.json`; they have their own toolchains.

---

## 3. Unit Test Suite (no database required)

```
$ npx jest

Test Suites: 10 skipped, 28 passed, 28 of 38 total
Tests:       61 skipped, 316 passed, 377 total
Snapshots:   0 total
Time:        9.568 s
```

The 10 skipped suites are integration tests gated behind `RUN_DB_TESTS=1` (see section 6). The 61 skipped individual tests are inside those suites.

Passing suites include:

- `tests/contexts/identity/domain/` — user, value-objects, refresh-token, authorisation-policy
- `tests/contexts/identity/application/` — register-user, login-and-rotate
- `tests/contexts/identity/benchmarks/` — identity-domain.bench (867 k ops/sec register, 2.9 M ops/sec policy)
- `tests/contexts/conversation-ingestion/domain/` — conversation
- `tests/contexts/conversation-ingestion/application/` — ingest-and-segment, request-and-delete
- `tests/contexts/conversation-ingestion/infrastructure/` — heuristic-segmenter
- `tests/contexts/multimodal/domain/` — media-upload
- `tests/contexts/multimodal/application/` — upload-and-process
- `tests/contexts/model-management/domain/` — analysis-bundle, bundle-promotion-policy
- `tests/contexts/cognitive-analysis/domain/` — analysis, domain-services
- `tests/contexts/cognitive-analysis/application/` — execute-analysis-saga
- `tests/contexts/cognitive-graph/domain/` — cognitive-graph, domain-services
- `tests/contexts/cognitive-graph/application/` — use-cases
- `tests/contexts/cognitive-graph/benchmarks/` — cognitive-graph.bench
- `tests/shared/outbox/` — outbox

---

## 4. Production Build

```
$ npm run build

> cfv@1.0.0 build
> tsc -p tsconfig.build.json && node -e "require('fs').writeFileSync('dist/package.json','{\"type\":\"commonjs\"}')"

(no output — clean build)

$ ls dist/server/index.js
dist/server/index.js
```

Exit code: 0. The build emits CommonJS to `dist/` and writes `dist/package.json` with `{"type":"commonjs"}` to override the root `"type":"module"`.

---

## 5. Production Boot Smoke Test

The production build was started with PostgreSQL on port 5433 and Redis on port 6379. Neo4j was not running; the server degrades gracefully.

### Server startup log (trimmed)

```
$ NODE_ENV=test JWT_SECRET=<redacted> DB_HOST=127.0.0.1 DB_PORT=5433 \
    DB_NAME=cfv_test DB_USER=postgres REDIS_URL=redis://localhost:6379 \
    PORT=4099 node dist/server/index.js

INFO  Starting Cognitive Fabric Visualizer server | version=1.0.0 port=4099
INFO  Performance monitoring disabled for testing
      Initializing database connections...
      PostgreSQL connection established
WARN  Database connections failed, continuing without databases
      (Neo4j: connect ECONNREFUSED 127.0.0.1:7687)
INFO  Identity module initialized (PostgreSQL-backed auth)
INFO  Conversation + analysis modules initialized (PostgreSQL-backed)
INFO  Outbox relay started (Redis Streams)
INFO  WebSocket server initialized | maxConnections=100 heartbeat=30000
INFO  Server started successfully | port=4099 env=test pid=5894
```

PostgreSQL and Redis connected. Neo4j unavailable — server continued without graph features (graceful degradation).

### GET /

```
$ curl http://localhost:4099/
HTTP/1.1 200 OK

{
  "name": "Cognitive Fabric Visualizer API",
  "version": "1.0.0",
  "status": "running",
  "environment": "test",
  "timestamp": "2026-05-24T01:08:36.294Z",
  "endpoints": {
    "health": "/health",
    "auth": "/api/auth",
    "conversations": "/api/conversations",
    "analysis": "/api/analysis",
    "visualizations": "/api/visualizations",
    "exports": "/api/exports"
  }
}
```

### GET /health

```
$ curl http://localhost:4099/health
HTTP/1.1 200 OK

{
  "status": "healthy",
  "timestamp": "2026-05-24T01:08:36.306Z",
  "uptime": 4.022687138,
  "version": "1.0.0",
  "environment": "test",
  "responseTime": 0
}
```

### POST /api/auth/register

```
$ curl -s -X POST http://localhost:4099/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email":"valtest@example.com","password":"ValidPass123!","name":"Val Test"}'
HTTP/1.1 201 Created

{"userId":"01KSBRDQ5H4043KK92ZCB78XTG"}
```

### POST /api/auth/login

```
$ curl -s -X POST http://localhost:4099/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"valtest@example.com","password":"ValidPass123!"}'
HTTP/1.1 200 OK

{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "01KSBRDQGCGGQ4T6W9B380AVMQ",
  "accessTokenExpiresAt": "2026-05-24T01:23:37.001Z",
  "refreshTokenExpiresAt": "2026-06-23T01:08:37.001Z"
}
```

### GET /api/auth/me (authenticated)

```
$ curl -H "Authorization: Bearer <access_token>" http://localhost:4099/api/auth/me
HTTP/1.1 200 OK

{
  "userId": "01KSBRDQ5H4043KK92ZCB78XTG",
  "tenantId": "01J0000000000000000000000A",
  "roles": ["viewer"],
  "scopes": ["conversation:read","analysis:read","visualization:read"]
}
```

### POST /api/conversations

```
$ curl -s -X POST http://localhost:4099/api/conversations \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer <access_token>" \
    -d '{"title":"Test Conversation","transcript":["Hello world","How are you?"]}'
HTTP/1.1 201 Created

{"conversationId":"01KSBRDQHMHZKK148Y93FAHBA0","status":"INGESTED"}
```

### Graceful shutdown

```
INFO  Received SIGTERM, starting graceful shutdown...
INFO  HTTP server closed
INFO  WebSocket server closed
INFO  Outbox relay stopped, Redis closed
      Closing database connections...
      PostgreSQL connection closed
      Neo4j connection closed
INFO  Database connections closed
INFO  Graceful shutdown completed
```

---

## 6. Integration Tests (live PostgreSQL + Redis)

```
$ RUN_DB_TESTS=1 \
    TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/cfv_test \
    TEST_REDIS_URL=redis://localhost:6379 \
    JWT_SECRET=<redacted> NODE_ENV=test \
    DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=cfv_test DB_USER=postgres \
    npx jest --testPathPattern=integration --runInBand --forceExit

PASS tests/contexts/conversation-ingestion/infrastructure/postgres.integration.test.ts
PASS tests/contexts/identity/infrastructure/postgres.integration.test.ts
PASS tests/contexts/multimodal/infrastructure/postgres.integration.test.ts
PASS tests/contexts/cognitive-analysis/infrastructure/postgres.integration.test.ts
PASS tests/contexts/model-management/infrastructure/postgres.integration.test.ts
PASS tests/shared/outbox/relay.integration.test.ts
PASS tests/contexts/cognitive-graph/infrastructure/redis.integration.test.ts

Test Suites: 10 passed, 10 total
Tests:       61 passed, 61 total
Snapshots:   0 total
Time:        5.866 s
```

All 10 integration suites and 61 integration tests passed against live databases.

Integration suites cover:
- All five PostgreSQL repository adapters (identity, conversation-ingestion, multimodal, model-management, cognitive-analysis)
- Redis graph cache adapter
- Outbox relay (append events → drain to Redis Stream → mark published, idempotency)
- Three HTTP composition suites (auth flows, conversation CRUD, analysis saga) via supertest

---

## Summary

| Check | Result |
|---|---|
| TypeScript type check | 0 errors |
| Unit tests (28 suites) | 316 passed |
| Production build | Clean — `dist/server/index.js` emitted |
| Boot smoke test | Server starts; /health 200, /register 201, /login 200, /me 200, /conversations 201 |
| Integration tests (10 suites) | 61 passed |
