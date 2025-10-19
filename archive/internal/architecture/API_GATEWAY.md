# API Gateway Layer Architecture

## Overview

The API Gateway serves as the single entry point for all client requests, providing request routing, authentication, rate limiting, and protocol translation. This layer ensures consistent API behavior and enables centralized management of cross-cutting concerns.

## Architecture Components

### Core Services
```
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway                                │
├─────────────────────────────────────────────────────────────────┤
│  Express.js Server │ Apollo GraphQL │ Socket.io WebSocket      │
├─────────────────────────────────────────────────────────────────┤
│  Authentication    │ Rate Limiting  │ Request Validation        │
│  JWT Middleware    │ Redis Store    │ Input Sanitization       │
├─────────────────────────────────────────────────────────────────┤
│  Load Balancer     │ Circuit Breaker│ Request Tracing          │
│  Nginx/HAProxy    │ Hystrix        │ OpenTelemetry            │
├─────────────────────────────────────────────────────────────────┤
│  Monitoring        │ Logging        │ Metrics Collection       │
│  Prometheus        │ Winston        │ Grafana Dashboard        │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack
- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js 4.x with Helmet security
- **GraphQL**: Apollo Server 4.x with schema stitching
- **WebSocket**: Socket.io 4.x with Redis adapter
- **Authentication**: JWT with refresh tokens
- **Rate Limiting**: Redis-backed rate limiting
- **Load Balancing**: Nginx with health checks
- **Monitoring**: Prometheus + Grafana

## API Specifications

### RESTful API Design

#### Authentication Endpoints
```yaml
# OpenAPI 3.0 Specification
/auth:
  /login:
    post:
      summary: User authentication
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email: {type: string, format: email}
                password: {type: string, minLength: 8}
      responses:
        200:
          description: Authentication successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  accessToken: {type: string}
                  refreshToken: {type: string}
                  expiresIn: {type: number}

  /refresh:
    post:
      summary: Refresh access token
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                refreshToken: {type: string}
```

#### Conversation Management
```yaml
/conversations:
  get:
    summary: List user conversations
    parameters:
      - name: page
        in: query
        schema: {type: integer, default: 1}
      - name: limit
        in: query
        schema: {type: integer, default: 20, maximum: 100}
    responses:
      200:
        description: List of conversations
        content:
          application/json:
            schema:
              type: object
              properties:
                conversations:
                  type: array
                  items:
                    $ref: '#/components/schemas/Conversation'
                pagination:
                  $ref: '#/components/schemas/Pagination'

  post:
    summary: Create new conversation
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            properties:
              title: {type: string, minLength: 1, maxLength: 200}
              content: {type: string, minLength: 1}

/conversations/{id}:
  get:
    summary: Get conversation details
    parameters:
      - name: id
        in: path
        required: true
        schema: {type: string, format: uuid}
    responses:
      200:
        description: Conversation details
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ConversationDetail'
```

#### Cognitive Analysis
```yaml
/conversations/{id}/analyze:
  post:
    summary: Start cognitive analysis
    parameters:
      - name: id
        in: path
        required: true
        schema: {type: string, format: uuid}
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              analysisType:
                type: array
                items:
                  type: string
                  enum: [factual, logical, creative, metacognitive]
              options:
                type: object
                properties:
                  depth: {type: integer, minimum: 1, maximum: 5}
                  includeVisualization: {type: boolean}
    responses:
      202:
        description: Analysis started
        content:
          application/json:
            schema:
              type: object
              properties:
                analysisId: {type: string, format: uuid}
                estimatedDuration: {type: integer}
```

### GraphQL Schema

```graphql
type Query {
  # User operations
  me: User
  conversations(page: Int, limit: Int): ConversationConnection!
  conversation(id: ID!): Conversation

  # Cognitive analysis
  cognitiveAnalysis(id: ID!): CognitiveAnalysis
  cognitiveDimensions(conversationId: ID!): [CognitiveDimension!]!

  # Knowledge graph
  knowledgeGraph(conversationId: ID!): KnowledgeGraph!
  relatedEntities(entityId: ID!): [Entity!]!
}

type Mutation {
  # Authentication
  login(email: String!, password: String!): AuthPayload!
  refreshToken(refreshToken: String!): AuthPayload!
  logout: Boolean!

  # Conversation management
  createConversation(input: CreateConversationInput!): Conversation!
  updateConversation(id: ID!, input: UpdateConversationInput!): Conversation!
  deleteConversation(id: ID!): Boolean!

  # Cognitive analysis
  startAnalysis(conversationId: ID!, input: AnalysisInput!): AnalysisJob!
  cancelAnalysis(analysisId: ID!): Boolean!
}

type Subscription {
  # Real-time updates
  conversationUpdated(conversationId: ID!): Conversation!
  analysisProgress(analysisId: ID!): AnalysisProgress!
  cognitiveMapUpdated(conversationId: ID!): CognitiveMap!
}
```

### WebSocket Events

```typescript
// Client-to-Server Events
interface ClientToServerEvents {
  join_conversation: (conversationId: string) => void;
  leave_conversation: (conversationId: string) => void;
  start_analysis: (conversationId: string, options: AnalysisOptions) => void;
  typing_indicator: (conversationId: string, isTyping: boolean) => void;
}

// Server-to-Client Events
interface ServerToClientEvents {
  conversation_update: (conversation: Conversation) => void;
  analysis_progress: (progress: AnalysisProgress) => void;
  cognitive_map_update: (mapData: CognitiveMapData) => void;
  typing_indicator: (userId: string, isTyping: boolean) => void;
  error: (error: ApiError) => void;
}

// Data Types
interface AnalysisProgress {
  analysisId: string;
  conversationId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  currentStage: string;
  estimatedTimeRemaining: number;
  results?: CognitiveAnalysisResults;
}

interface CognitiveMapData {
  conversationId: string;
  nodes: CognitiveNode[];
  edges: CognitiveEdge[];
  layout: LayoutConfiguration;
  viewport: ViewportState;
}
```

## Authentication & Security

### JWT Implementation
```typescript
interface JWTPayload {
  sub: string; // User ID
  email: string;
  role: UserRole;
  permissions: Permission[];
  iat: number; // Issued at
  exp: number; // Expires at
  jti: string; // JWT ID for token revocation
}

interface RefreshTokenPayload {
  sub: string;
  tokenId: string;
  iat: number;
  exp: number;
}

class AuthService {
  async generateTokens(user: User): Promise<TokenPair> {
    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions
      },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { sub: user.id, tokenId: generateUUID() },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    await this.storeRefreshToken(user.id, refreshToken);

    return { accessToken, refreshToken };
  }

  async verifyAccessToken(token: string): Promise<JWTPayload> {
    try {
      return jwt.verify(token, process.env.JWT_ACCESS_SECRET) as JWTPayload;
    } catch (error) {
      throw new UnauthorizedError('Invalid access token');
    }
  }
}
```

### Rate Limiting Strategy
```typescript
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator: (req: Request) => string; // Rate limit key
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

const rateLimitConfigs: Record<string, RateLimitConfig> = {
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 login attempts per 15 minutes
    keyGenerator: (req) => `auth:${req.ip}`
  },
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000, // 1000 requests per minute
    keyGenerator: (req) => `api:${req.user?.id || req.ip}`
  },
  analysis: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 analysis requests per minute
    keyGenerator: (req) => `analysis:${req.user?.id}`
  }
};

class RateLimitService {
  private redis: Redis;

  async checkRateLimit(
    key: string,
    config: RateLimitConfig
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Remove expired entries
    await this.redis.zremrangebyscore(key, 0, windowStart);

    // Count current requests
    const currentRequests = await this.redis.zcard(key);

    if (currentRequests >= config.maxRequests) {
      const oldestRequest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
      const resetTime = parseInt(oldestRequest[0][1]) + config.windowMs;

      return {
        allowed: false,
        remaining: 0,
        resetTime
      };
    }

    // Add current request
    await this.redis.zadd(key, now, `${now}-${Math.random()}`);
    await this.redis.expire(key, Math.ceil(config.windowMs / 1000));

    return {
      allowed: true,
      remaining: config.maxRequests - currentRequests - 1,
      resetTime: now + config.windowMs
    };
  }
}
```

## Request Processing Pipeline

### Middleware Chain
```typescript
// Request processing pipeline
app.use(helmet()); // Security headers
app.use(compression()); // Response compression
app.use(cors({ origin: process.env.ALLOWED_ORIGINS }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request ID for tracing
app.use((req, res, next) => {
  req.requestId = generateUUID();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// Logging middleware
app.use(requestLogger);

// Rate limiting
app.use('/api/v1/auth', rateLimitMiddleware(rateLimitConfigs.auth));
app.use('/api/v1', rateLimitMiddleware(rateLimitConfigs.api));
app.use('/api/v1/analyze', rateLimitMiddleware(rateLimitConfigs.analysis));

// Authentication middleware
app.use('/api/v1', authenticateToken);

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/analysis', analysisRoutes);
app.use('/graphql', graphqlMiddleware);

// Error handling
app.use(errorHandler);
app.use(notFoundHandler);
```

### Request Validation
```typescript
import Joi from 'joi';

const schemas = {
  createConversation: Joi.object({
    title: Joi.string().min(1).max(200).required(),
    content: Joi.string().min(1).required(),
    metadata: Joi.object().optional()
  }),

  startAnalysis: Joi.object({
    analysisType: Joi.array().items(
      Joi.string().valid('factual', 'logical', 'creative', 'metacognitive')
    ).min(1).required(),
    options: Joi.object({
      depth: Joi.number().integer().min(1).max(5).default(3),
      includeVisualization: Joi.boolean().default(true),
      language: Joi.string().valid('en', 'es', 'fr', 'de').default('en')
    }).optional()
  })
};

function validateRequest(schemaName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const schema = schemas[schemaName];
    const { error, value } = schema.validate(req.body);

    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => ({
          field: d.path.join('.'),
          message: d.message
        }))
      });
    }

    req.validatedBody = value;
    next();
  };
}
```

## Load Balancing & High Availability

### Nginx Configuration
```nginx
upstream api_gateway {
    least_conn;
    server api-gateway-1:3000 max_fails=3 fail_timeout=30s;
    server api-gateway-2:3000 max_fails=3 fail_timeout=30s;
    server api-gateway-3:3000 max_fails=3 fail_timeout=30s;
}

upstream websocket_servers {
    ip_hash; # Sticky sessions for WebSocket
    server api-gateway-1:3000;
    server api-gateway-2:3000;
    server api-gateway-3:3000;
}

server {
    listen 80;
    listen 443 ssl http2;

    # SSL configuration
    ssl_certificate /etc/ssl/certs/api.crt;
    ssl_certificate_key /etc/ssl/private/api.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

    # HTTP/2 server push for static assets
    location /static/ {
        alias /var/www/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        gzip_static on;
    }

    # API routes
    location /api/ {
        proxy_pass http://api_gateway;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket routes
    location /socket.io/ {
        proxy_pass http://websocket_servers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # GraphQL endpoint
    location /graphql {
        proxy_pass http://api_gateway;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Circuit Breaker Pattern
```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000, // 1 minute
    private service: () => Promise<any>
  ) {}

  async execute(): Promise<any> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await this.service();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}

// Usage for upstream services
const conversationServiceBreaker = new CircuitBreaker(
  5, // 5 failures
  60000, // 1 minute timeout
  () => httpClient.get(`${CONVERSATION_SERVICE_URL}/conversations`)
);
```

## Monitoring & Observability

### Metrics Collection
```typescript
import { register, Counter, Histogram, Gauge } from 'prom-client';

// Metrics definitions
const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const activeConnections = new Gauge({
  name: 'websocket_active_connections',
  help: 'Number of active WebSocket connections'
});

const cognitiveAnalysisJobs = new Counter({
  name: 'cognitive_analysis_jobs_total',
  help: 'Total number of cognitive analysis jobs',
  labelNames: ['status', 'analysis_type']
});

// Middleware for metrics collection
function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;

    httpRequestsTotal
      .labels(req.method, route, res.statusCode.toString())
      .inc();

    httpRequestDuration
      .labels(req.method, route)
      .observe(duration);
  });

  next();
}
```

### Distributed Tracing
```typescript
import { trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';

const sdk = new NodeSDK({
  instrumentations: [
    new ExpressInstrumentation(),
    new RedisInstrumentation(),
    // Add other instrumentations as needed
  ],
});

sdk.start();

// Middleware for tracing
function tracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const tracer = trace.getTracer('api-gateway');
  const span = tracer.startSpan(`${req.method} ${req.path}`);

  span.setAttributes({
    'http.method': req.method,
    'http.url': req.url,
    'http.target': req.path,
    'user.id': req.user?.id,
    'request.id': req.requestId
  });

  req.span = span;

  res.on('finish', () => {
    span.setAttributes({
      'http.status_code': res.statusCode,
      'http.response_content_length': res.get('content-length')
    });

    if (res.statusCode >= 400) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }

    span.end();
  });

  next();
}
```

## Performance Optimization

### Caching Strategy
```typescript
interface CacheConfig {
  ttl: number; // Time to live in seconds
  key: string; // Cache key pattern
  tags?: string[]; // Cache tags for invalidation
}

const cacheConfigs: Record<string, CacheConfig> = {
  userProfile: { ttl: 300, key: 'user:profile:{userId}' },
  conversationList: { ttl: 60, key: 'conversations:list:{userId}:{page}' },
  cognitiveAnalysis: { ttl: 3600, key: 'analysis:{conversationHash}' },
  knowledgeGraph: { ttl: 1800, key: 'graph:{conversationId}' }
};

class CacheService {
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any, ttl: number): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async invalidate(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async invalidateTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      await this.invalidate(`tag:${tag}:*`);
    }
  }
}

// Middleware for response caching
function cacheMiddleware(config: CacheConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = config.key.replace(/{(\w+)}/g, (match, param) => {
      return req.params[param] || req.user?.[param] || match;
    });

    const cached = await cacheService.get(key);
    if (cached) {
      return res.json(cached);
    }

    // Override res.json to cache the response
    const originalJson = res.json;
    res.json = function(data: any) {
      cacheService.set(key, data, config.ttl);
      return originalJson.call(this, data);
    };

    next();
  };
}
```

This API Gateway architecture provides a robust, scalable, and secure foundation for the Cognitive Fabric Visualizer, supporting high-performance real-time cognitive analysis and visualization features.