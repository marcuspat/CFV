# Data Layer Architecture

## Overview

The Data Layer provides a multi-database architecture optimized for different data types and access patterns. This design combines PostgreSQL for relational metadata, Neo4j for graph-based cognitive relationships, and Redis for high-performance caching and real-time data synchronization.

## Architecture Components

### Database Architecture Overview
```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Application Layer                               │
├─────────────────────────────────────────────────────────────────────────┤
│  Connection Pooling  │ Transaction Management │ Data Access Layer       │
│  PgBouncer/Pool      │ Distributed Transactions │ ORM/Query Builders    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                        Data Orchestration Layer                         │
├─────────────────────────────────────────────────────────────────────────┤
│  Data Migration      │ Synchronization    │ Consistency Management     │
│  ETL Pipelines       │ Cross-DB Sync      │ Eventual Consistency      │
│  Version Control     │ Change Data Capture │ Conflict Resolution       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                    Storage Layer (Multi-Database)                      │
├─────────────────────────────────────────────────────────────────────────┤
│  PostgreSQL        │     Neo4j         │      Redis        │  S3 Storage  │
│  (Metadata)        │   (Graph DB)      │    (Cache)        │  (Models/ML) │
│  ACID Compliance   │ Graph Traversal   │ In-Memory Store  │ Object Store │
│  Complex Queries   │ Relationship Maps │ Pub/Sub          │ Static Assets│
├─────────────────────────────────────────────────────────────────────────┤
│  Users, Sessions   │ Cognitive Elements│ Session Data     │ ML Models    │
│  Conversations     │ Knowledge Graphs  │ Rate Limiting     │ Training Data│
│  API Keys          │ Semantic Networks │ Real-time Updates│ Backups      │
│  Audit Logs        │ Temporal Reasoning│ Analytics Cache   │ Exports      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack
- **PostgreSQL**: v15+ with TimescaleDB for time-series data
- **Neo4j**: v5.x Enterprise with Graph Data Science library
- **Redis**: v7.x Cluster with RedisSearch and RedisTimeSeries
- **S3**: Compatible object storage with lifecycle policies
- **Connection Pooling**: PgBouncer for PostgreSQL, official drivers for others
- **ORM**: Prisma for PostgreSQL, Neo4j Driver, ioredis for Redis

## PostgreSQL Schema Design

### Core Tables Structure
```sql
-- =====================================================
-- PostgreSQL Schema for Application Metadata
-- =====================================================

-- Users and Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    role user_role DEFAULT 'user',
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    subscription_tier VARCHAR(50) DEFAULT 'free',
    metadata JSONB DEFAULT '{}'
);

CREATE TYPE user_role AS ENUM ('admin', 'user', 'analyst', 'researcher');
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Sessions and Authentication
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255) UNIQUE,
    device_info JSONB,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_sessions_expires_at ON user_sessions(expires_at);

-- API Keys for Service-to-Service Authentication
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(20) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]',
    rate_limit_per_hour INTEGER DEFAULT 1000,
    last_used TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}'
);

CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- Conversations and Content
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    language VARCHAR(10) DEFAULT 'en',
    status conversation_status DEFAULT 'active',
    visibility conversation_visibility DEFAULT 'private',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    archived_at TIMESTAMP WITH TIME ZONE,
    word_count INTEGER DEFAULT 0,
    participant_count INTEGER DEFAULT 1
);

CREATE TYPE conversation_status AS ENUM ('active', 'processing', 'completed', 'archived', 'deleted');
CREATE TYPE conversation_visibility AS ENUM ('private', 'shared', 'public');

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);
CREATE INDEX idx_conversations_language ON conversations(language);

-- Conversation Segments
CREATE TABLE conversation_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    segment_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    speaker VARCHAR(100),
    speaker_type speaker_type DEFAULT 'human',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    word_count INTEGER DEFAULT 0,
    sentiment_score DECIMAL(3,2),
    emotion_scores JSONB DEFAULT '{}',
    language_detected VARCHAR(10),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TYPE speaker_type AS ENUM ('human', 'ai', 'system');

CREATE INDEX idx_segments_conversation_id ON conversation_segments(conversation_id);
CREATE INDEX idx_segments_timestamp ON conversation_segments(timestamp);
CREATE INDEX idx_segments_speaker ON conversation_segments(speaker);
CREATE UNIQUE INDEX idx_segments_conversation_index ON conversation_segments(conversation_id, segment_index);

-- Cognitive Analysis Jobs
CREATE TABLE cognitive_analysis_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_type analysis_type NOT NULL,
    status job_status DEFAULT 'pending',
    config JSONB NOT NULL DEFAULT '{}',
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    current_stage VARCHAR(100),
    estimated_duration_seconds INTEGER,
    actual_duration_seconds INTEGER,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3
);

CREATE TYPE analysis_type AS ENUM ('factual', 'logical', 'creative', 'metacognitive', 'comprehensive');
CREATE TYPE job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled', 'retrying');

CREATE INDEX idx_analysis_jobs_conversation_id ON cognitive_analysis_jobs(conversation_id);
CREATE INDEX idx_analysis_jobs_status ON cognitive_analysis_jobs(status);
CREATE INDEX idx_analysis_jobs_created_at ON cognitive_analysis_jobs(created_at);

-- Cognitive Analysis Results
CREATE TABLE cognitive_analysis_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES cognitive_analysis_jobs(id) ON DELETE CASCADE,
    analysis_type analysis_type NOT NULL,
    dimension_score DECIMAL(5,4) NOT NULL,
    confidence_score DECIMAL(5,4) NOT NULL,
    results JSONB NOT NULL,
    metrics JSONB DEFAULT '{}',
    model_version VARCHAR(50),
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_analysis_results_job_id ON cognitive_analysis_results(job_id);
CREATE INDEX idx_analysis_results_type ON cognitive_analysis_results(analysis_type);
CREATE INDEX idx_analysis_results_confidence ON cognitive_analysis_results(confidence_score);

-- Knowledge Graph Entities
CREATE TABLE knowledge_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_text VARCHAR(500) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    canonical_form VARCHAR(500),
    description TEXT,
    confidence_score DECIMAL(5,4),
    source_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_entities_type ON knowledge_entities(entity_type);
CREATE INDEX idx_entities_text ON knowledge_entities(entity_text);
CREATE INDEX idx_entities_confidence ON knowledge_entities(confidence_score);

-- Usage Analytics and Metrics
CREATE TABLE usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
    endpoint VARCHAR(200) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER NOT NULL,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_endpoint ON usage_logs(endpoint);
CREATE INDEX idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX idx_usage_logs_response_time ON usage_logs(response_time);

-- TimescaleDB hypertable for time-series metrics
SELECT create_hypertable('usage_logs', 'created_at', chunk_time_interval => INTERVAL '1 day');
```

### Database Views and Materialized Views
```sql
-- =====================================================
-- Optimized Views for Common Queries
-- =====================================================

-- User Statistics View
CREATE VIEW user_statistics AS
SELECT
    u.id,
    u.email,
    u.full_name,
    u.created_at as user_created_at,
    COUNT(DISTINCT c.id) as total_conversations,
    COUNT(DISTINCT cs.id) as total_segments,
    SUM(cs.word_count) as total_words,
    COUNT(DISTINCT j.id) as total_analysis_jobs,
    AVG(j.progress) as avg_analysis_progress,
    MAX(c.updated_at) as last_activity
FROM users u
LEFT JOIN conversations c ON u.id = c.user_id
LEFT JOIN conversation_segments cs ON c.id = cs.conversation_id
LEFT JOIN cognitive_analysis_jobs j ON c.id = j.conversation_id
WHERE u.is_active = TRUE
GROUP BY u.id, u.email, u.full_name, u.created_at;

-- Conversation Summary View
CREATE VIEW conversation_summaries AS
SELECT
    c.id,
    c.title,
    c.user_id,
    c.created_at,
    c.updated_at,
    COUNT(cs.id) as segment_count,
    SUM(cs.word_count) as total_words,
    COUNT(DISTINCT cs.speaker) as speaker_count,
    AVG(cs.sentiment_score) as avg_sentiment,
    COUNT(DISTINCT j.id) as analysis_count,
    MAX(j.completed_at) as last_analysis_date,
    BOOL_OR(j.status = 'completed') as has_completed_analysis
FROM conversations c
LEFT JOIN conversation_segments cs ON c.id = cs.conversation_id
LEFT JOIN cognitive_analysis_jobs j ON c.id = j.conversation_id
WHERE c.status != 'deleted'
GROUP BY c.id, c.title, c.user_id, c.created_at, c.updated_at;

-- Analysis Performance Metrics View
CREATE VIEW analysis_performance_metrics AS
SELECT
    DATE_TRUNC('day', ar.created_at) as analysis_date,
    ar.analysis_type,
    COUNT(*) as total_analyses,
    AVG(ar.dimension_score) as avg_score,
    AVG(ar.confidence_score) as avg_confidence,
    AVG(ar.processing_time_ms) as avg_processing_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ar.processing_time_ms) as p95_processing_time,
    COUNT(DISTINCT j.conversation_id) as unique_conversations
FROM cognitive_analysis_results ar
JOIN cognitive_analysis_jobs j ON ar.job_id = j.id
WHERE j.status = 'completed'
GROUP BY DATE_TRUNC('day', ar.created_at), ar.analysis_type
ORDER BY analysis_date DESC;
```

## Neo4j Graph Schema Design

### Node Types and Properties
```cypher
// =====================================================
// Neo4j Graph Schema for Cognitive Relationships
// =====================================================

-- Constraint Definitions for Data Integrity
CREATE CONSTRAINT conversation_id_unique IF NOT EXISTS FOR (c:Conversation) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT segment_id_unique IF NOT EXISTS FOR (s:Segment) REQUIRE s.id IS UNIQUE;
CREATE CONSTRAINT cognitive_element_id_unique IF NOT EXISTS FOR (ce:CognitiveElement) REQUIRE ce.id IS UNIQUE;
CREATE CONSTRAINT entity_id_unique IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE;
CREATE CONSTRAINT concept_id_unique IF NOT EXISTS FOR (c:Concept) REQUIRE c.id IS UNIQUE;

-- Node Indexes for Performance
CREATE INDEX conversation_user_index IF NOT EXISTS FOR (c:Conversation) ON (c.user_id);
CREATE INDEX segment_conversation_index IF NOT EXISTS FOR (s:Segment) ON (s.conversation_id);
CREATE INDEX cognitive_element_type_index IF NOT EXISTS FOR (ce:CognitiveElement) ON (ce.dimension_type);
CREATE INDEX entity_type_index IF NOT EXISTS FOR (e:Entity) ON (e.entity_type);
CREATE INDEX concept_category_index IF NOT EXISTS FOR (c:Concept) ON (c.category);

-- Conversation Nodes
CREATE (c:Conversation {
    id: $conversation_id,
    user_id: $user_id,
    title: $title,
    language: $language,
    created_at: datetime($created_at),
    updated_at: datetime($updated_at),
    metadata: $metadata
});

-- Segment Nodes
CREATE (s:Segment {
    id: $segment_id,
    conversation_id: $conversation_id,
    content: $content,
    speaker: $speaker,
    speaker_type: $speaker_type,
    timestamp: datetime($timestamp),
    word_count: $word_count,
    sentiment_score: $sentiment_score,
    segment_index: $segment_index
});

-- Cognitive Element Nodes
CREATE (ce:CognitiveElement {
    id: $element_id,
    text: $text,
    dimension_type: $dimension_type,  // 'factual', 'logical', 'creative', 'metacognitive'
    confidence_score: $confidence_score,
    start_position: $start_position,
    end_position: $end_position,
    extraction_method: $extraction_method,
    created_at: datetime($created_at)
});

-- Entity Nodes
CREATE (e:Entity {
    id: $entity_id,
    text: $text,
    canonical_form: $canonical_form,
    entity_type: $entity_type,  // 'PERSON', 'ORG', 'GPE', 'EVENT', etc.
    confidence_score: $confidence_score,
    source_count: $source_count,
    properties: $properties,
    created_at: datetime($created_at)
});

-- Concept Nodes (Abstract Concepts)
CREATE (c:Concept {
    id: $concept_id,
    name: $name,
    category: $category,
    definition: $definition,
    abstraction_level: $abstraction_level,  // 0-10 scale
    domain: $domain,
    created_at: datetime($created_at)
});
```

### Relationship Types and Properties
```cypher
// =====================================================
-- Relationship Definitions
-- =====================================================

-- Conversation Structure Relationships
CREATE (c:Conversation)-[:HAS_SEGMENT {order: $segment_index}]->(s:Segment);
CREATE (s1:Segment)-[:PRECEDES {gap_duration: $gap_ms}]->(s2:Segment);

-- Cognitive Analysis Relationships
CREATE (s:Segment)-[:CONTAINS_ELEMENT {extraction_confidence: $confidence}]->(ce:CognitiveElement);
CREATE (ce:CognitiveElement)-[:BELONGS_TO_DIMENSION {score: $dimension_score}]->(cd:CognitiveDimension);
CREATE (ce1:CognitiveElement)-[:RELATED_TO {relationship_type: $type, strength: $strength, confidence: $confidence}]->(ce2:CognitiveElement);

-- Entity and Concept Relationships
CREATE (ce:CognitiveElement)-[:MENTIONS_ENTITY {confidence: $confidence, context: $context}]->(e:Entity);
CREATE (e:Entity)-[:INSTANCE_OF {confidence: $confidence}]->(c:Concept);
CREATE (c1:Concept)-[:RELATED_TO {relationship_type: $type, strength: $strength}]->(c2:Concept);

-- Knowledge Graph Relationships
CREATE (e1:Entity)-[:HAS_RELATIONSHIP {
    relation_type: $relation_type,
    confidence: $confidence,
    source: $source,
    temporal_validity: $temporal_range,
    context: $context
}]->(e2:Entity);

-- Temporal Relationships
CREATE (ce1:CognitiveElement)-[:TEMPORALLY_BEFORE {time_gap_ms: $gap}]->(ce2:CognitiveElement);
CREATE (ce1:CognitiveElement)-[:CAUSES {confidence: $confidence, mechanism: $mechanism}]->(ce2:CognitiveElement);

-- Logical Relationships
CREATE (premise:CognitiveElement)-[:SUPPORTS {strength: $strength, argument_type: $type}]->(conclusion:CognitiveElement);
CREATE (claim:CognitiveElement)-[:ATTACKS {strength: $strength, counterargument_type: $type}]->(target:CognitiveElement);
```

### Graph Algorithms and Queries
```cypher
// =====================================================
-- Advanced Graph Algorithms
-- =====================================================

-- Cognitive Path Analysis
MATCH path = (start:CognitiveElement)-[:RELATED_TO*1..5]->(end:CognitiveElement)
WHERE start.dimension_type = 'factual' AND end.dimension_type = 'logical'
WITH path, length(path) as path_length
ORDER BY path_length ASC
LIMIT 10
RETURN path, path_length,
       reduce(total = 0, rel IN relationships(path) | total + rel.strength) as total_strength;

-- Knowledge Graph Community Detection
CALL gds.louvain.stream({
    nodeProjection: ['Entity', 'Concept'],
    relationshipProjection: {
        HAS_RELATIONSHIP: {
            type: 'HAS_RELATIONSHIP',
            properties: 'strength'
        }
    }
})
YIELD nodeId, communityId
RETURN gds.util.asNode(nodeId).name as entity_name, communityId
ORDER BY communityId, entity_name;

-- Cognitive Centrality Analysis
CALL gds.betweenness.stream({
    nodeProjection: 'CognitiveElement',
    relationshipProjection: ['RELATED_TO', 'SUPPORTS', 'CAUSES']
})
YIELD nodeId, score
RETURN gds.util.asNode(nodeId).text as element_text, score
ORDER BY score DESC
LIMIT 20;

-- Temporal Evolution Analysis
MATCH (ce:CognitiveElement)
WHERE ce.timestamp >= datetime('2024-01-01') AND ce.timestamp <= datetime('2024-12-31')
WITH ce, date(ce.timestamp) as analysis_date
MATCH (ce)-[:BELONGS_TO_DIMENSION]->(cd:CognitiveDimension)
RETURN analysis_date, cd.name as dimension_name,
       avg(ce.confidence_score) as avg_confidence,
       count(*) as element_count
ORDER BY analysis_date, dimension_name;

-- Entity Co-occurrence Network
MATCH (e1:Entity)<-[:MENTIONS_ENTITY]-(s:Segment)-[:MENTIONS_ENTITY]->(e2:Entity)
WHERE id(e1) < id(e2)  // Avoid duplicate pairs
WITH e1, e2, count(s) as co_occurrence_count
WHERE co_occurrence_count > 2
RETURN e1.text as entity1, e2.text as entity2, co_occurrence_count
ORDER BY co_occurrence_count DESC
LIMIT 50;
```

## Redis Architecture

### Data Organization and Naming Conventions
```redis
// =====================================================
-- Redis Data Organization Strategy
-- =====================================================

-- Session Management
session:{session_id} -> {
    user_id: "uuid",
    device_info: {...},
    created_at: timestamp,
    last_accessed: timestamp,
    expires_at: timestamp
}
TTL: 7 days

-- User Session Index
user_sessions:{user_id} -> Set[session_id1, session_id2, ...]
TTL: 7 days

-- Real-time WebSocket Connections
ws_connections:{user_id} -> Set[socket_id1, socket_id2, ...]
TTL: 1 hour (with heartbeat extension)

-- Rate Limiting
rate_limit:{user_id}:{endpoint} -> {
    request_count: integer,
    window_start: timestamp,
    reset_time: timestamp
}
TTL: 1 hour

-- API Key Rate Limiting
api_rate_limit:{api_key}:{window} -> {
    count: integer,
    reset_time: timestamp
}
TTL: Varies by window (1 minute, 1 hour, 1 day)

-- Cognitive Analysis Cache
analysis_results:{conversation_hash}:{analysis_type} -> {
    results: {...},
    confidence_score: float,
    model_version: string,
    created_at: timestamp
}
TTL: 24 hours

-- Conversation Processing Queue
queue:conversation_processing -> List[conversation_id]
Priority: FIFO

-- ML Model Inference Cache
model_inference:{model_name}:{input_hash} -> {
    output: {...},
    confidence: float,
    processing_time_ms: integer,
    created_at: timestamp
}
TTL: 6 hours

-- Knowledge Graph Cache
kg:entity:{entity_canonical} -> {
    entity_data: {...},
    relationships: [...],
    last_updated: timestamp
}
TTL: 12 hours

kg:concept_hierarchy:{concept_id} -> List[parent_concept_id1, parent_concept_id2, ...]
TTL: 24 hours

-- Real-time Analytics
analytics:active_users -> Set[user_id1, user_id2, ...]
TTL: 5 minutes

analytics:processing_jobs -> Hash[job_id1: status1, job_id2: status2, ...]
TTL: 1 hour

-- Performance Metrics
metrics:api_performance:{endpoint}:{minute} -> {
    request_count: integer,
    avg_response_time: float,
    error_rate: float,
    p95_response_time: float
}
TTL: 24 hours

-- Temporary Data Processing
temp:segmentation:{conversation_id} -> {
    segments: [...],
    processing_stage: string,
    progress: float
}
TTL: 1 hour

temp:extraction:{job_id} -> {
    extracted_elements: [...],
    current_stage: string,
    errors: [...]
}
TTL: 30 minutes
```

### Redis Data Structures and Operations
```python
# =====================================================
-- Redis Operations and Data Structures
# =====================================================

import redis
import json
import pickle
from typing import Dict, List, Any, Optional
import hashlib

class RedisService:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.default_ttl = 3600  # 1 hour

    def cache_analysis_results(
        self,
        conversation_id: str,
        analysis_type: str,
        results: Dict[str, Any],
        ttl: int = 86400  # 24 hours
    ) -> None:
        """Cache cognitive analysis results"""

        # Create hash key for conversation
        conversation_hash = self._hash_conversation(conversation_id)
        cache_key = f"analysis_results:{conversation_hash}:{analysis_type}"

        cache_data = {
            "results": json.dumps(results),
            "confidence_score": str(results.get("overall_confidence", 0.0)),
            "model_version": results.get("model_version", "unknown"),
            "created_at": str(time.time())
        }

        # Set with TTL
        self.redis.hmset(cache_key, cache_data)
        self.redis.expire(cache_key, ttl)

    def get_cached_analysis(
        self,
        conversation_id: str,
        analysis_type: str
    ) -> Optional[Dict[str, Any]]:
        """Retrieve cached analysis results"""

        conversation_hash = self._hash_conversation(conversation_id)
        cache_key = f"analysis_results:{conversation_hash}:{analysis_type}"

        cached_data = self.redis.hgetall(cache_key)
        if not cached_data:
            return None

        try:
            results = json.loads(cached_data.get(b"results", b"{}").decode())
            results["cached"] = True
            results["cache_timestamp"] = float(cached_data.get(b"created_at", b"0").decode())
            return results
        except (json.JSONDecodeError, KeyError):
            return None

    def manage_rate_limit(
        self,
        identifier: str,
        endpoint: str,
        limit: int,
        window: int = 3600
    ) -> Dict[str, Any]:
        """Implement rate limiting with sliding window"""

        rate_limit_key = f"rate_limit:{identifier}:{endpoint}"
        current_time = int(time.time())
        window_start = current_time - window

        # Use Redis sorted set for sliding window
        pipe = self.redis.pipeline()

        # Remove expired entries
        pipe.zremrangebyscore(rate_limit_key, 0, window_start)

        # Count current requests
        pipe.zcard(rate_limit_key)

        # Add current request
        pipe.zadd(rate_limit_key, {str(current_time): current_time})

        # Set expiry
        pipe.expire(rate_limit_key, window)

        results = pipe.execute()
        current_requests = results[1]

        # Calculate remaining requests and reset time
        remaining = max(0, limit - current_requests - 1)
        reset_time = current_time + window

        return {
            "allowed": current_requests < limit,
            "remaining": remaining,
            "reset_time": reset_time,
            "current_requests": current_requests
        }

    def cache_model_inference(
        self,
        model_name: str,
        input_data: Any,
        output_data: Any,
        processing_time_ms: int,
        ttl: int = 21600  # 6 hours
    ) -> None:
        """Cache model inference results"""

        input_hash = self._hash_input(input_data)
        cache_key = f"model_inference:{model_name}:{input_hash}"

        cache_data = {
            "output": pickle.dumps(output_data),
            "processing_time_ms": processing_time_ms,
            "created_at": time.time()
        }

        self.redis.hmset(cache_key, cache_data)
        self.redis.expire(cache_key, ttl)

    def get_cached_inference(
        self,
        model_name: str,
        input_data: Any
    ) -> Optional[Dict[str, Any]]:
        """Retrieve cached model inference"""

        input_hash = self._hash_input(input_data)
        cache_key = f"model_inference:{model_name}:{input_hash}"

        cached_data = self.redis.hgetall(cache_key)
        if not cached_data:
            return None

        try:
            output = pickle.loads(cached_data.get(b"output"))
            return {
                "output": output,
                "processing_time_ms": int(cached_data.get(b"processing_time_ms", 0)),
                "cached": True
            }
        except (pickle.PickleError, KeyError):
            return None

    def manage_websocket_connections(
        self,
        user_id: str,
        socket_id: str,
        action: str = "add"
    ) -> None:
        """Manage WebSocket connections for real-time updates"""

        connection_key = f"ws_connections:{user_id}"

        if action == "add":
            self.redis.sadd(connection_key, socket_id)
            self.redis.expire(connection_key, 3600)  # 1 hour TTL
        elif action == "remove":
            self.redis.srem(connection_key, socket_id)

        # Return current connection count
        return self.redis.scard(connection_key)

    def update_real_time_metrics(
        self,
        metric_name: str,
        value: float,
        labels: Dict[str, str] = None
    ) -> None:
        """Update real-time performance metrics"""

        # Create label-based key
        label_str = ":".join(f"{k}={v}" for k, v in (labels or {}).items())
        minute_key = int(time.time() // 60)
        metrics_key = f"metrics:{metric_name}:{label_str}:{minute_key}"

        # Update metrics using Redis streams or sorted sets
        self.redis.lpush(metrics_key, str(value))
        self.redis.ltrim(metrics_key, 0, 999)  # Keep last 1000 values
        self.redis.expire(metrics_key, 86400)  # 24 hours TTL

    def _hash_conversation(self, conversation_id: str) -> str:
        """Create consistent hash for conversation"""
        return hashlib.md5(conversation_id.encode()).hexdigest()[:16]

    def _hash_input(self, input_data: Any) -> str:
        """Create hash for input data"""
        serialized = json.dumps(input_data, sort_keys=True)
        return hashlib.sha256(serialized.encode()).hexdigest()[:16]
```

## Data Synchronization and Consistency

### Cross-Database Synchronization Strategy
```python
# =====================================================
-- Data Synchronization Service
# =====================================================

import asyncio
from typing import Dict, List, Optional
from dataclasses import dataclass
from enum import Enum

class SyncOperation(Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    UPSERT = "upsert"

@dataclass
class SyncEvent:
    operation: SyncOperation
    table: str
    record_id: str
    data: Dict[str, Any]
    timestamp: float
    source_db: str
    target_dbs: List[str]

class DataSynchronizationService:
    def __init__(self):
        self.postgres_client = PostgreSQLClient()
        self.neo4j_client = Neo4jClient()
        self.redis_client = RedisService()
        self.event_queue = asyncio.Queue()
        self.sync_rules = self._load_sync_rules()

    async def process_cognitive_analysis(
        self,
        analysis_job_id: str,
        analysis_results: Dict[str, Any]
    ) -> None:
        """Process and sync cognitive analysis results across databases"""

        # 1. Store results in PostgreSQL (primary storage)
        postgres_record = await self._store_analysis_postgres(
            analysis_job_id, analysis_results
        )

        # 2. Create graph elements in Neo4j
        graph_elements = await self._create_graph_elements(
            analysis_results, postgres_record['id']
        )

        # 3. Cache results in Redis
        await self._cache_analysis_results(
            postgres_record['conversation_id'],
            analysis_results
        )

        # 4. Create sync events for cross-database consistency
        sync_events = self._create_sync_events(
            postgres_record, graph_elements
        )

        # 5. Process sync events
        for event in sync_events:
            await self.event_queue.put(event)

    async def _store_analysis_postgres(
        self,
        job_id: str,
        results: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Store analysis results in PostgreSQL"""

        async with self.postgres_client.transaction():
            # Update job status
            await self.postgres_client.execute(
                "UPDATE cognitive_analysis_jobs SET status = 'completed', completed_at = NOW() WHERE id = %s",
                (job_id,)
            )

            # Insert analysis results
            analysis_record = await self.postgres_client.fetchrow(
                """
                INSERT INTO cognitive_analysis_results
                (job_id, analysis_type, dimension_score, confidence_score, results, metrics, model_version, processing_time_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    job_id,
                    results['analysis_type'],
                    results['dimension_score'],
                    results['confidence_score'],
                    json.dumps(results['results']),
                    json.dumps(results.get('metrics', {})),
                    results.get('model_version'),
                    results.get('processing_time_ms')
                )
            )

            return dict(analysis_record)

    async def _create_graph_elements(
        self,
        analysis_results: Dict[str, Any],
        analysis_record_id: str
    ) -> List[Dict[str, Any]]:
        """Create corresponding graph elements in Neo4j"""

        graph_elements = []

        async with self.neo4j_client.session() as session:
            # Create cognitive element nodes
            for element in analysis_results['results'].get('cognitive_elements', []):
                element_node = await session.run(
                    """
                    CREATE (ce:CognitiveElement {
                        id: randomUUID(),
                        text: $text,
                        dimension_type: $dimension_type,
                        confidence_score: $confidence_score,
                        start_position: $start_position,
                        end_position: $end_position,
                        analysis_record_id: $analysis_record_id,
                        created_at: datetime()
                    })
                    RETURN ce
                    """,
                    {
                        'text': element['text'],
                        'dimension_type': element['dimension_type'],
                        'confidence_score': element['confidence_score'],
                        'start_position': element.get('start_position'),
                        'end_position': element.get('end_position'),
                        'analysis_record_id': analysis_record_id
                    }
                )

                graph_elements.append(dict(element_node.single()))

            # Create relationships between elements
            for relationship in analysis_results['results'].get('relationships', []):
                await session.run(
                    """
                    MATCH (start:CognitiveElement {text: $start_text}),
                          (end:CognitiveElement {text: $end_text})
                    CREATE (start)-[r:RELATED_TO {
                        relationship_type: $relationship_type,
                        strength: $strength,
                        confidence: $confidence,
                        created_at: datetime()
                    }]->(end)
                    """,
                    {
                        'start_text': relationship['start_element'],
                        'end_text': relationship['end_element'],
                        'relationship_type': relationship['type'],
                        'strength': relationship.get('strength', 0.5),
                        'confidence': relationship.get('confidence', 0.5)
                    }
                )

        return graph_elements

    async def _cache_analysis_results(
        self,
        conversation_id: str,
        results: Dict[str, Any]
    ) -> None:
        """Cache analysis results in Redis"""

        # Cache with conversation hash
        await self.redis_client.cache_analysis_results(
            conversation_id=conversation_id,
            analysis_type=results['analysis_type'],
            results=results,
            ttl=86400  # 24 hours
        )

        # Update real-time metrics
        await self.redis_client.update_real_time_metrics(
            metric_name="analysis_completion_time",
            value=results.get('processing_time_ms', 0),
            labels={'analysis_type': results['analysis_type']}
        )

    def _create_sync_events(
        self,
        postgres_record: Dict[str, Any],
        graph_elements: List[Dict[str, Any]]
    ) -> List[SyncEvent]:
        """Create synchronization events for consistency"""

        events = []

        # Event for PostgreSQL to Neo4j sync
        events.append(SyncEvent(
            operation=SyncOperation.CREATE,
            table="cognitive_analysis_results",
            record_id=postgres_record['id'],
            data=postgres_record,
            timestamp=time.time(),
            source_db="postgresql",
            target_dbs=["neo4j", "redis"]
        ))

        # Events for graph elements
        for element in graph_elements:
            events.append(SyncEvent(
                operation=SyncOperation.CREATE,
                table="cognitive_elements",
                record_id=element['id'],
                data=element,
                timestamp=time.time(),
                source_db="neo4j",
                target_dbs=["redis"]
            ))

        return events

    async def sync_worker(self):
        """Background worker for processing sync events"""

        while True:
            try:
                # Get sync event from queue
                event = await self.event_queue.get()

                # Process sync based on target databases
                for target_db in event.target_dbs:
                    await self._apply_sync_event(event, target_db)

                # Mark event as processed
                self.event_queue.task_done()

            except Exception as e:
                logger.error(f"Error processing sync event: {e}")
                # Continue processing other events

    async def _apply_sync_event(self, event: SyncEvent, target_db: str):
        """Apply sync event to target database"""

        if target_db == "neo4j":
            await self._sync_to_neo4j(event)
        elif target_db == "redis":
            await self._sync_to_redis(event)
        elif target_db == "postgresql":
            await self._sync_to_postgres(event)
```

This Data Layer architecture provides a comprehensive, multi-database solution that optimizes for different data types and access patterns while maintaining consistency and high performance for the Cognitive Fabric Visualizer.