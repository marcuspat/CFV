# 10. Repositories

A **repository** is the gateway between the domain layer and a system of
record. It exposes a collection-like interface for one **aggregate** and
hides every persistence detail (ORM, SQL, Cypher, Redis commands). The
domain talks to repositories *only* via their port interfaces; the
implementations live in `infrastructure/`
([ADR-0016](../adr/0016-hexagonal-architecture-for-bounded-contexts.md)).

## Repository Rules

1. **One repository per aggregate root.** Repositories do not span
   aggregates. Cross-aggregate queries are *read models* served by a
   query service, not by a repository.
2. **Aggregate-typed inputs and outputs.** Methods take and return
   aggregate roots and value objects, never DTOs or persistence rows.
3. **Optimistic locking.** Every save call passes the expected version;
   on mismatch, raise `AggregateVersionConflict`. Application services
   choose to retry or surface the error.
4. **Tenant scoping.** Every repository method accepts (or implicitly
   resolves from context) a `tenantId`. A query that returns rows for
   another tenant is a bug; a positive test enforces this
   ([ADR-0021](../adr/0021-data-privacy-and-gdpr-posture.md)).
5. **No business logic.** A repository persists; it does not validate or
   transform business rules. If a transformation is required, it lives
   in a domain service or on the aggregate.
6. **Composable transactions.** Repositories accept an ambient
   transaction handle (PostgreSQL session, Neo4j tx) so that an
   application service can group multiple repository calls inside one
   unit of work.

## Repository Catalogue

For each aggregate, we list the port methods (TypeScript signature
sketch). Implementations vary by engine (PostgreSQL via `pg`, Neo4j via
`neo4j-driver`, Redis via `redis`).

### Identity & Access

```ts
interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(tenantId: TenantId, email: Email): Promise<User | null>;
  save(user: User, expectedVersion: number): Promise<void>;
  delete(id: UserId): Promise<void>;     // GDPR cascade upstream
}

interface TenantRepository {
  findById(id: TenantId): Promise<Tenant | null>;
  save(tenant: Tenant, expectedVersion: number): Promise<void>;
}

interface RefreshTokenRepository {
  findActive(tokenId: TokenId): Promise<RefreshToken | null>;
  rotate(prev: RefreshToken, next: RefreshToken): Promise<void>; // atomic
  revoke(tokenId: TokenId): Promise<void>;
}

interface AuditEntryRepository {
  append(entry: AuditEntry): Promise<void>;
  // Append-only; no update / delete API
}
```

### Conversation Ingestion

```ts
interface ConversationRepository {
  findById(id: ConversationId, tenantId: TenantId): Promise<Conversation | null>;
  listForUser(userId: UserId, page: PageRequest): Promise<Page<Conversation>>;
  save(conversation: Conversation, expectedVersion: number): Promise<void>;
  softDelete(id: ConversationId, reason: string): Promise<void>;
}

interface AnalysisSessionRepository {
  findById(id: SessionId, tenantId: TenantId): Promise<AnalysisSession | null>;
  save(session: AnalysisSession, expectedVersion: number): Promise<void>;
}
```

### Multimodal Ingestion

```ts
interface MediaUploadRepository {
  findById(id: UploadId, tenantId: TenantId): Promise<MediaUpload | null>;
  save(upload: MediaUpload, expectedVersion: number): Promise<void>;
  purge(id: UploadId): Promise<void>;     // deletes object-storage bytes
}
```

### Cognitive Analysis

```ts
interface AnalysisRepository {
  findById(id: AnalysisId, tenantId: TenantId): Promise<Analysis | null>;
  findByKey(
    conversationId: ConversationId,
    bundleVersion: BundleVersion,
    parameterHash: string,
  ): Promise<Analysis | null>;            // for idempotency
  save(analysis: Analysis, expectedVersion: number): Promise<void>;
  listForConversation(
    conversationId: ConversationId,
    page: PageRequest,
  ): Promise<Page<Analysis>>;
}
```

### Cognitive Graph

```ts
interface CognitiveGraphRepository {
  load(conversationId: ConversationId): Promise<CognitiveGraph>;
  applyMutations(
    graph: CognitiveGraph,
    mutations: GraphMutation[],
    expectedVersion: number,
  ): Promise<CognitiveGraph>;             // returns new state with new version
}

interface ThreadRepository {
  listByConversation(conversationId: ConversationId): Promise<Thread[]>;
  save(thread: Thread, expectedVersion: number): Promise<void>;
}

interface PredictedEdgeRepository {
  proposeMany(predicted: PredictedEdge[]): Promise<void>;
  realise(predictedEdgeId: string, becameEdgeId: string): Promise<void>;
}
```

The cognitive-graph repository spans Neo4j (graph data) and a small
PostgreSQL table for the aggregate metadata and version. The
implementation coordinates both within a single application-service
unit-of-work; see [§11](11-application-services.md).

### Visualization

```ts
interface VisualizationSnapshotRepository {
  findById(id: SnapshotId, tenantId: TenantId): Promise<VisualizationSnapshot | null>;
  save(snapshot: VisualizationSnapshot): Promise<void>;
  // Snapshots are immutable; no update API
}
```

### Insights & Reporting

```ts
interface ReportRepository {
  findById(id: ReportId, tenantId: TenantId): Promise<Report | null>;
  save(report: Report): Promise<void>;
}

interface InsightRepository {
  findById(id: InsightId, tenantId: TenantId): Promise<Insight | null>;
  listForConversation(conversationId: ConversationId): Promise<Insight[]>;
  save(insight: Insight): Promise<void>;
}
```

### Model Management

```ts
interface AnalysisBundleRepository {
  findActive(): Promise<AnalysisBundle>;
  findByVersion(version: BundleVersion): Promise<AnalysisBundle | null>;
  save(bundle: AnalysisBundle, expectedVersion: number): Promise<void>;
}

interface ShadowDeploymentRepository {
  findByBundle(version: BundleVersion): Promise<ShadowDeployment | null>;
  save(deployment: ShadowDeployment, expectedVersion: number): Promise<void>;
}
```

### Feedback & Learning

```ts
interface FeedbackEntryRepository {
  findById(id: FeedbackId, tenantId: TenantId): Promise<FeedbackEntry | null>;
  save(entry: FeedbackEntry): Promise<void>;
  listForAnalysis(analysisId: AnalysisId): Promise<FeedbackEntry[]>;
}

interface EvalSetRepository {
  findVersion(version: number): Promise<EvalSetEntry[]>;
  promote(entries: EvalSetEntry[]): Promise<number>; // returns new version
}
```

### Notifications & Webhooks

```ts
interface WebhookSubscriptionRepository {
  findById(id: SubscriptionId, tenantId: TenantId): Promise<WebhookSubscription | null>;
  listByEventType(eventType: string, tenantId: TenantId): Promise<WebhookSubscription[]>;
  save(sub: WebhookSubscription, expectedVersion: number): Promise<void>;
}

interface DeliveryAttemptRepository {
  appendAttempt(attempt: DeliveryAttempt): Promise<void>;
  listAttempts(subscriptionId: SubscriptionId, eventId: string): Promise<DeliveryAttempt[]>;
}
```

## Read Models and Query Services

Aggregate repositories are for write paths and aggregate-by-id reads.
Anything that crosses aggregate boundaries — list views, dashboards,
search — is a **read model** served by a dedicated query service:

- `ConversationListQueryService` — paginated lists with computed analysis
  status.
- `AnalysisDashboardQueryService` — denormalised view for the analyst
  dashboard.
- `GraphSummaryQueryService` — counts, dominant dimensions, thread stats.
- `InsightFeedQueryService` — recent insights across a tenant.

Read models read from PostgreSQL (and from Neo4j where appropriate) using
projections kept in sync via domain events (CQRS-lite — see
[§13](13-tactical-patterns.md)).

## Implementation Notes

- **PostgreSQL.** Use parameterised queries; the ORM choice is left to
  implementation but mappers stay confined to `infrastructure/`. Aggregate
  state is stored as a row plus child rows; the repository is responsible
  for loading the aggregate atomically.
- **Neo4j.** Use parameterised Cypher. The graph repository owns the
  Cypher; domain code never sees Cypher strings.
- **Redis.** Used as cache or denylist by repository or
  application-service code. Treated as a non-authoritative store; a cache
  miss must be safe.
- **Object storage.** Treated as an external integration accessed via an
  adapter, not a repository (objects are not aggregates).

## Testing

- Each repository has an integration test against an ephemeral database
  ([ADR-0018](../adr/0018-test-strategy-pyramid-and-chaos.md)).
- A tenant-isolation test exists per repository.
- Domain and application layers use **in-memory fakes** of the repository
  ports; the fakes implement the same contract.
