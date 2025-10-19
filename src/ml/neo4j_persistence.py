"""
Neo4j Persistence Layer for Cognitive Graph Data

Provides robust graph persistence with schema management, query optimization,
and performance monitoring for cognitive thread evolution data.
"""

import asyncio
import time
from typing import Dict, List, Optional, Tuple, Any, Union
from dataclasses import dataclass, asdict
import json
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
import numpy as np
import torch
from loguru import logger

try:
    from neo4j import GraphDatabase, AsyncGraphDatabase
    from neo4j.exceptions import Neo4jError, ServiceUnavailable
    NEO4J_AVAILABLE = True
except ImportError:
    logger.warning("Neo4j driver not available")
    NEO4J_AVAILABLE = False

from .dgnn import CognitiveThread, ThreadEvolution


@dataclass
class GraphPersistenceConfig:
    """Configuration for Neo4j persistence layer."""
    uri: str = "bolt://localhost:7687"
    username: str = "neo4j"
    password: str = "password"
    database: str = "neo4j"
    max_connection_pool_size: int = 50
    connection_timeout: float = 30.0
    max_transaction_lifetime: float = 300.0
    enable_schema_validation: bool = True
    enable_query_logging: bool = False
    batch_size: int = 1000
    index_creation_timeout: float = 60.0


@dataclass
class PersistenceMetrics:
    """Metrics for persistence operations."""
    total_operations: int = 0
    successful_operations: int = 0
    failed_operations: int = 0
    average_query_time: float = 0.0
    connection_pool_stats: Dict[str, int] = None
    cache_hit_rate: float = 0.0
    storage_usage_mb: float = 0.0

    def __post_init__(self):
        if self.connection_pool_stats is None:
            self.connection_pool_stats = {}


class Neo4jSchemaManager:
    """Manages Neo4j schema for cognitive graph data."""

    def __init__(self, driver):
        self.driver = driver

    async def initialize_schema(self, database: str = "neo4j"):
        """Initialize database schema for cognitive graph data."""
        logger.info("Initializing Neo4j schema for cognitive graph data")

        constraints = [
            # Node uniqueness constraints
            "CREATE CONSTRAINT cognitive_thread_id_unique IF NOT EXISTS FOR (t:CognitiveThread) REQUIRE t.id IS UNIQUE",
            "CREATE CONSTRAINT evolution_id_unique IF NOT EXISTS FOR (e:ThreadEvolution) REQUIRE e.id IS UNIQUE",
            "CREATE CONSTRAINT prediction_id_unique IF NOT EXISTS FOR (p:Prediction) REQUIRE p.id IS UNIQUE",

            # Data integrity constraints
            "CREATE CONSTRAINT thread_timestamp_valid IF NOT EXISTS FOR (t:CognitiveThread) REQUIRE t.timestamp IS NOT NULL",
            "CREATE CONSTRAINT thread_dimension_valid IF NOT EXISTS FOR (t:CognitiveThread) REQUIRE t.cognitive_dimension IS NOT NULL"
        ]

        indexes = [
            # Performance indexes
            "CREATE INDEX thread_timestamp_index IF NOT EXISTS FOR (t:CognitiveThread) ON (t.timestamp)",
            "CREATE INDEX thread_dimension_index IF NOT EXISTS FOR (t:CognitiveThread) ON (t.cognitive_dimension)",
            "CREATE INDEX thread_confidence_index IF NOT EXISTS FOR (t:CognitiveThread) ON (t.confidence)",
            "CREATE INDEX evolution_timestamp_index IF NOT EXISTS FOR (e:ThreadEvolution) ON (e.created_at)",
            "CREATE INDEX prediction_confidence_index IF NOT EXISTS FOR (p:Prediction) ON (p.confidence_score)",

            # Relationship indexes
            "CREATE INDEX relationship_weight_index IF NOT EXISTS FOR ()-[r:RELATED_TO]->() ON (r.weight)",
            "CREATE INDEX relationship_timestamp_index IF NOT EXISTS FOR ()-[r:RELATED_TO]->() ON (r.timestamp)",

            # Composite indexes for common queries
            "CREATE INDEX thread_dimension_confidence_index IF NOT EXISTS FOR (t:CognitiveThread) ON (t.cognitive_dimension, t.confidence)",
            "CREATE INDEX thread_temporal_position_index IF NOT EXISTS FOR (t:CognitiveThread) ON (t.temporal_position)"
        ]

        try:
            async with self.driver.session(database=database) as session:
                # Create constraints
                for constraint in constraints:
                    try:
                        await session.run(constraint)
                        logger.debug(f"Created constraint: {constraint}")
                    except Exception as e:
                        if "already exists" not in str(e):
                            logger.warning(f"Failed to create constraint: {constraint}, Error: {e}")

                # Create indexes
                for index in indexes:
                    try:
                        await session.run(index)
                        logger.debug(f"Created index: {index}")
                    except Exception as e:
                        if "already exists" not in str(e):
                            logger.warning(f"Failed to create index: {index}, Error: {e}")

            logger.info("Neo4j schema initialization completed")

        except Exception as e:
            logger.error(f"Schema initialization failed: {e}")
            raise

    async def validate_schema(self, database: str = "neo4j") -> bool:
        """Validate that schema is properly set up."""
        try:
            async with self.driver.session(database=database) as session:
                # Check if key constraints exist
                result = await session.run("""
                    SHOW CONSTRAINTS YIELD name, type, labelsOrTypes, properties
                    WHERE type = 'UNIQUENESS' AND labelsOrTypes = ['CognitiveThread']
                    RETURN count(*) as constraint_count
                """)
                record = await result.single()
                thread_constraints = record["constraint_count"] if record else 0

                # Check if indexes exist
                result = await session.run("""
                    SHOW INDEXES YIELD name, type, labelsOrTypes, properties
                    WHERE type = 'RANGE' AND labelsOrTypes = ['CognitiveThread']
                    RETURN count(*) as index_count
                """)
                record = await result.single()
                thread_indexes = record["index_count"] if record else 0

                logger.info(f"Schema validation: {thread_constraints} constraints, {thread_indexes} indexes")

                return thread_constraints > 0 and thread_indexes > 0

        except Exception as e:
            logger.error(f"Schema validation failed: {e}")
            return False


class CognitiveGraphPersistence:
    """
    Neo4j persistence layer for cognitive graph data.

    Features:
    - Thread and evolution persistence
    - Relationship management
    - Query optimization
    - Batch operations
    - Performance monitoring
    - Schema management
    """

    def __init__(self, config: Optional[GraphPersistenceConfig] = None):
        if not NEO4J_AVAILABLE:
            raise ImportError("Neo4j driver not available. Install with: pip install neo4j")

        self.config = config or GraphPersistenceConfig()
        self.driver = None
        self.schema_manager = None
        self.is_connected = False

        # Performance metrics
        self.metrics = PersistenceMetrics()

        # Query cache
        self.query_cache: Dict[str, Tuple[Any, float]] = {}
        self.cache_ttl = 300  # 5 minutes

        logger.info("Neo4j Cognitive Graph Persistence initialized")

    async def connect(self):
        """Establish connection to Neo4j database."""
        if self.is_connected:
            return

        try:
            self.driver = AsyncGraphDatabase.driver(
                self.config.uri,
                auth=(self.config.username, self.config.password),
                max_connection_lifetime=self.config.max_transaction_lifetime,
                max_connection_pool_size=self.config.max_connection_pool_size,
                connection_timeout=self.config.connection_timeout
            )

            # Test connection
            async with self.driver.session(database=self.config.database) as session:
                await session.run("RETURN 1")

            # Initialize schema manager
            self.schema_manager = Neo4jSchemaManager(self.driver)
            await self.schema_manager.initialize_schema(self.config.database)

            # Validate schema
            if self.config.enable_schema_validation:
                schema_valid = await self.schema_manager.validate_schema(self.config.database)
                if not schema_valid:
                    logger.warning("Schema validation failed")

            self.is_connected = True
            logger.info("Connected to Neo4j database successfully")

        except Exception as e:
            logger.error(f"Failed to connect to Neo4j: {e}")
            self.is_connected = False
            raise

    async def disconnect(self):
        """Close Neo4j connection."""
        if self.driver:
            await self.driver.close()
            self.is_connected = False
            logger.info("Disconnected from Neo4j database")

    @asynccontextmanager
    async def session(self, database: Optional[str] = None):
        """Context manager for database sessions."""
        if not self.is_connected:
            raise RuntimeError("Not connected to Neo4j database")

        db = database or self.config.database
        async with self.driver.session(database=db) as session:
            yield session

    async def persist_cognitive_thread(self, thread: CognitiveThread) -> str:
        """
        Persist a single cognitive thread to Neo4j.

        Args:
            thread: Cognitive thread to persist

        Returns:
            Thread ID
        """
        start_time = time.time()

        try:
            async with self.session() as session:
                # Convert features to JSON-serializable format
                features_json = json.dumps(thread.features.cpu().numpy().tolist())

                query = """
                MERGE (t:CognitiveThread {id: $thread_id})
                SET t.cognitive_dimension = $dimension,
                    t.content = $content,
                    t.timestamp = $timestamp,
                    t.confidence = $confidence,
                    t.features = $features,
                    t.temporal_position = $temporal_position,
                    t.updated_at = datetime()
                RETURN t.id as thread_id
                """

                result = await session.run(
                    query,
                    thread_id=thread.thread_id,
                    dimension=thread.cognitive_dimension,
                    content=thread.content,
                    timestamp=thread.timestamp,
                    confidence=thread.confidence,
                    features=features_json,
                    temporal_position=thread.temporal_position
                )

                record = await result.single()
                thread_id = record["thread_id"] if record else thread.thread_id

                # Persist relationships
                if thread.relationships:
                    await self._persist_thread_relationships(session, thread)

                self.metrics.successful_operations += 1
                query_time = time.time() - start_time
                self._update_query_metrics(query_time)

                logger.debug(f"Persisted cognitive thread {thread_id} in {query_time:.3f}s")
                return thread_id

        except Exception as e:
            self.metrics.failed_operations += 1
            logger.error(f"Failed to persist cognitive thread {thread.thread_id}: {e}")
            raise

    async def persist_cognitive_threads_batch(self, threads: List[CognitiveThread]) -> List[str]:
        """
        Persist multiple cognitive threads in batch.

        Args:
            threads: List of cognitive threads to persist

        Returns:
            List of thread IDs
        """
        if not threads:
            return []

        start_time = time.time()
        thread_ids = []

        try:
            async with self.session() as session:
                # Process in batches to avoid memory issues
                batch_size = self.config.batch_size

                for i in range(0, len(threads), batch_size):
                    batch = threads[i:i + batch_size]

                    # Create threads
                    query = """
                    UNWIND $threads AS thread_data
                    MERGE (t:CognitiveThread {id: thread_data.id})
                    SET t.cognitive_dimension = thread_data.dimension,
                        t.content = thread_data.content,
                        t.timestamp = thread_data.timestamp,
                        t.confidence = thread_data.confidence,
                        t.features = thread_data.features,
                        t.temporal_position = thread_data.temporal_position,
                        t.updated_at = datetime()
                    RETURN t.id as thread_id
                    """

                    # Prepare batch data
                    batch_data = []
                    for thread in batch:
                        batch_data.append({
                            "id": thread.thread_id,
                            "dimension": thread.cognitive_dimension,
                            "content": thread.content,
                            "timestamp": thread.timestamp,
                            "confidence": thread.confidence,
                            "features": json.dumps(thread.features.cpu().numpy().tolist()),
                            "temporal_position": thread.temporal_position
                        })

                    result = await session.run(query, threads=batch_data)

                    # Collect thread IDs
                    async for record in result:
                        thread_ids.append(record["thread_id"])

                    # Create relationships for this batch
                    await self._persist_thread_relationships_batch(session, batch)

            self.metrics.successful_operations += 1
            query_time = time.time() - start_time
            self._update_query_metrics(query_time)

            logger.debug(f"Persisted {len(threads)} threads in {query_time:.3f}s")
            return thread_ids

        except Exception as e:
            self.metrics.failed_operations += 1
            logger.error(f"Failed to persist thread batch: {e}")
            raise

    async def persist_thread_evolution(self, evolution: ThreadEvolution) -> str:
        """
        Persist thread evolution data.

        Args:
            evolution: Thread evolution to persist

        Returns:
            Evolution ID
        """
        start_time = time.time()

        try:
            async with self.session() as session:
                evolution_id = f"evolution_{int(time.time() * 1000)}"

                # Convert tensors to JSON
                adjacency_json = json.dumps(evolution.adjacency_matrix.cpu().numpy().tolist())
                confidence_json = json.dumps(evolution.confidence_scores.cpu().numpy().tolist())

                query = """
                CREATE (e:ThreadEvolution {
                    id: $evolution_id,
                    created_at: datetime(),
                    num_threads: $num_threads,
                    prediction_confidence: $prediction_confidence,
                    adjacency_matrix: $adjacency_matrix,
                    confidence_scores: $confidence_scores,
                    metadata: $metadata
                })
                RETURN e.id as evolution_id
                """

                result = await session.run(
                    query,
                    evolution_id=evolution_id,
                    num_threads=len(evolution.threads),
                    prediction_confidence=evolution.prediction_confidence,
                    adjacency_matrix=adjacency_json,
                    confidence_scores=confidence_json,
                    metadata=json.dumps({})
                )

                record = await result.single()
                evolution_id = record["evolution_id"] if record else evolution_id

                # Link evolution to threads
                for thread in evolution.threads:
                    await session.run("""
                        MATCH (e:ThreadEvolution {id: $evolution_id})
                        MATCH (t:CognitiveThread {id: $thread_id})
                        MERGE (t)-[r:PART_OF_EVOLUTION]->(e)
                        SET r.timestamp = datetime()
                    """, evolution_id=evolution_id, thread_id=thread.thread_id)

                # Persist temporal edges
                if evolution.temporal_edges is not None:
                    await self._persist_temporal_edges(session, evolution_id, evolution.temporal_edges)

                self.metrics.successful_operations += 1
                query_time = time.time() - start_time
                self._update_query_metrics(query_time)

                logger.debug(f"Persisted thread evolution {evolution_id} in {query_time:.3f}s")
                return evolution_id

        except Exception as e:
            self.metrics.failed_operations += 1
            logger.error(f"Failed to persist thread evolution: {e}")
            raise

    async def _persist_thread_relationships(self, session, thread: CognitiveThread):
        """Persist relationships for a single thread."""
        for related_thread_id in thread.relationships:
            await session.run("""
                MATCH (t:CognitiveThread {id: $thread_id})
                MATCH (related:CognitiveThread {id: $related_id})
                MERGE (t)-[r:RELATED_TO]->(related)
                SET r.timestamp = datetime(),
                    r.relationship_type = 'cognitive_connection',
                    r.confidence = $confidence
            """, thread_id=thread.thread_id, related_id=related_thread_id, confidence=thread.confidence)

    async def _persist_thread_relationships_batch(self, session, threads: List[CognitiveThread]):
        """Persist relationships for a batch of threads."""
        relationships = []

        for thread in threads:
            for related_thread_id in thread.relationships:
                relationships.append({
                    "source_id": thread.thread_id,
                    "target_id": related_thread_id,
                    "confidence": thread.confidence
                })

        if relationships:
            query = """
            UNWIND $relationships AS rel_data
            MATCH (source:CognitiveThread {id: rel_data.source_id})
            MATCH (target:CognitiveThread {id: rel_data.target_id})
            MERGE (source)-[r:RELATED_TO]->(target)
            SET r.timestamp = datetime(),
                r.relationship_type = 'cognitive_connection',
                r.confidence = rel_data.confidence
            """

            await session.run(query, relationships=relationships)

    async def _persist_temporal_edges(self, session, evolution_id: str, temporal_edges: torch.Tensor):
        """Persist temporal edges for thread evolution."""
        # Convert tensor to list of edge data
        edges_list = []
        num_steps, num_nodes, _ = temporal_edges.shape

        for step in range(num_steps):
            for i in range(num_nodes):
                for j in range(num_nodes):
                    weight = temporal_edges[step, i, j].item()
                    if weight > 0.01:  # Only store significant edges
                        edges_list.append({
                            "evolution_id": evolution_id,
                            "time_step": step,
                            "source_idx": i,
                            "target_idx": j,
                            "weight": weight
                        })

        if edges_list:
            query = """
            UNWIND $edges AS edge_data
            MATCH (e:ThreadEvolution {id: edge_data.evolution_id})
            MERGE (e)-[r:TEMPORAL_EDGE {
                time_step: edge_data.time_step,
                source_idx: edge_data.source_idx,
                target_idx: edge_data.target_idx
            }]->()
            SET r.weight = edge_data.weight,
                r.timestamp = datetime()
            """

            await session.run(query, edges=edges_list)

    async def retrieve_cognitive_threads(
        self,
        limit: Optional[int] = None,
        cognitive_dimension: Optional[str] = None,
        time_range: Optional[Tuple[float, float]] = None,
        min_confidence: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieve cognitive threads with optional filtering.

        Args:
            limit: Maximum number of threads to return
            cognitive_dimension: Filter by cognitive dimension
            time_range: Filter by time range (start, end)
            min_confidence: Filter by minimum confidence

        Returns:
            List of thread data
        """
        cache_key = f"threads_{limit}_{cognitive_dimension}_{time_range}_{min_confidence}"
        cached_result = self._get_cached_result(cache_key)
        if cached_result:
            return cached_result

        start_time = time.time()

        try:
            async with self.session() as session:
                # Build query with optional filters
                query_parts = ["MATCH (t:CognitiveThread)"]
                where_clauses = []
                params = {}

                if cognitive_dimension:
                    where_clauses.append("t.cognitive_dimension = $dimension")
                    params["dimension"] = cognitive_dimension

                if time_range:
                    where_clauses.append("t.timestamp >= $start_time AND t.timestamp <= $end_time")
                    params["start_time"] = time_range[0]
                    params["end_time"] = time_range[1]

                if min_confidence:
                    where_clauses.append("t.confidence >= $min_confidence")
                    params["min_confidence"] = min_confidence

                if where_clauses:
                    query_parts.append("WHERE " + " AND ".join(where_clauses))

                query_parts.append("RETURN t")
                query_parts.append("ORDER BY t.timestamp DESC")

                if limit:
                    query_parts.append("LIMIT $limit")
                    params["limit"] = limit

                query = " ".join(query_parts)

                result = await session.run(query, **params)
                threads = []

                async for record in result:
                    thread_node = record["t"]
                    thread_data = {
                        "thread_id": thread_node["id"],
                        "cognitive_dimension": thread_node["cognitive_dimension"],
                        "content": thread_node["content"],
                        "timestamp": thread_node["timestamp"],
                        "confidence": thread_node["confidence"],
                        "features": json.loads(thread_node.get("features", "[]")),
                        "temporal_position": thread_node.get("temporal_position", 0),
                        "updated_at": thread_node.get("updated_at")
                    }
                    threads.append(thread_data)

                # Cache result
                self._cache_result(cache_key, threads)

                query_time = time.time() - start_time
                self._update_query_metrics(query_time)

                logger.debug(f"Retrieved {len(threads)} threads in {query_time:.3f}s")
                return threads

        except Exception as e:
            logger.error(f"Failed to retrieve cognitive threads: {e}")
            raise

    async def retrieve_thread_relationships(
        self,
        thread_id: str,
        max_depth: int = 2
    ) -> List[Dict[str, Any]]:
        """
        Retrieve relationships for a specific thread.

        Args:
            thread_id: Thread ID to retrieve relationships for
            max_depth: Maximum relationship depth

        Returns:
            List of relationship data
        """
        start_time = time.time()

        try:
            async with self.session() as session:
                query = f"""
                MATCH (t:CognitiveThread {{id: $thread_id}})
                CALL apoc.path.expandConfig(t, {{
                    relationshipFilter: "RELATED_TO",
                    minDepth: 1,
                    maxDepth: {max_depth},
                    bfs: true
                }})
                YIELD path
                UNWIND nodes(path) as node
                UNWIND relationships(path) as rel
                RETURN DISTINCT
                    node.id as node_id,
                    node.cognitive_dimension as node_dimension,
                    node.content as node_content,
                    node.confidence as node_confidence,
                    startNode(rel).id as source_id,
                    endNode(rel).id as target_id,
                    rel.relationship_type as relationship_type,
                    rel.confidence as relationship_confidence,
                    rel.timestamp as relationship_timestamp
                ORDER BY relationship_timestamp DESC
                """

                result = await session.run(query, thread_id=thread_id)
                relationships = []

                async for record in result:
                    rel_data = {
                        "node_id": record["node_id"],
                        "node_dimension": record["node_dimension"],
                        "node_content": record["node_content"],
                        "node_confidence": record["node_confidence"],
                        "source_id": record["source_id"],
                        "target_id": record["target_id"],
                        "relationship_type": record["relationship_type"],
                        "relationship_confidence": record["relationship_confidence"],
                        "relationship_timestamp": record["relationship_timestamp"]
                    }
                    relationships.append(rel_data)

                query_time = time.time() - start_time
                self._update_query_metrics(query_time)

                logger.debug(f"Retrieved {len(relationships)} relationships for thread {thread_id} in {query_time:.3f}s")
                return relationships

        except Exception as e:
            logger.error(f"Failed to retrieve thread relationships: {e}")
            raise

    async def retrieve_thread_evolution(
        self,
        evolution_id: Optional[str] = None,
        thread_id: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Retrieve thread evolution data.

        Args:
            evolution_id: Specific evolution ID to retrieve
            thread_id: Thread ID to get evolutions for
            limit: Maximum number of evolutions to return

        Returns:
            List of evolution data
        """
        start_time = time.time()

        try:
            async with self.session() as session:
                if evolution_id:
                    query = """
                    MATCH (e:ThreadEvolution {id: $evolution_id})
                    OPTIONAL MATCH (t:CognitiveThread)-[r:PART_OF_EVOLUTION]->(e)
                    RETURN e, collect(t.id) as thread_ids
                    """
                    result = await session.run(query, evolution_id=evolution_id)
                elif thread_id:
                    query = """
                    MATCH (t:CognitiveThread {id: $thread_id})-[r:PART_OF_EVOLUTION]->(e)
                    RETURN e, collect(t.id) as thread_ids
                    ORDER BY e.created_at DESC
                    LIMIT $limit
                    """
                    result = await session.run(query, thread_id=thread_id, limit=limit)
                else:
                    query = """
                    MATCH (e:ThreadEvolution)
                    OPTIONAL MATCH (t:CognitiveThread)-[r:PART_OF_EVOLUTION]->(e)
                    RETURN e, collect(t.id) as thread_ids
                    ORDER BY e.created_at DESC
                    LIMIT $limit
                    """
                    result = await session.run(query, limit=limit)

                evolutions = []

                async for record in result:
                    evolution_node = record["e"]
                    evolution_data = {
                        "evolution_id": evolution_node["id"],
                        "created_at": evolution_node["created_at"],
                        "num_threads": evolution_node["num_threads"],
                        "prediction_confidence": evolution_node["prediction_confidence"],
                        "adjacency_matrix": json.loads(evolution_node.get("adjacency_matrix", "[]")),
                        "confidence_scores": json.loads(evolution_node.get("confidence_scores", "[]")),
                        "thread_ids": record["thread_ids"],
                        "metadata": json.loads(evolution_node.get("metadata", "{}"))
                    }
                    evolutions.append(evolution_data)

                query_time = time.time() - start_time
                self._update_query_metrics(query_time)

                logger.debug(f"Retrieved {len(evolutions)} evolutions in {query_time:.3f}s")
                return evolutions

        except Exception as e:
            logger.error(f"Failed to retrieve thread evolutions: {e}")
            raise

    async def delete_cognitive_thread(self, thread_id: str) -> bool:
        """
        Delete a cognitive thread and its relationships.

        Args:
            thread_id: Thread ID to delete

        Returns:
            True if deleted successfully
        """
        try:
            async with self.session() as session:
                query = """
                MATCH (t:CognitiveThread {id: $thread_id})
                DETACH DELETE t
                RETURN count(t) as deleted_count
                """

                result = await session.run(query, thread_id=thread_id)
                record = await result.single()
                deleted_count = record["deleted_count"] if record else 0

                # Clear from cache
                cache_keys_to_remove = [key for key in self.query_cache.keys() if "threads_" in key]
                for key in cache_keys_to_remove:
                    del self.query_cache[key]

                logger.debug(f"Deleted cognitive thread {thread_id}")
                return deleted_count > 0

        except Exception as e:
            logger.error(f"Failed to delete cognitive thread {thread_id}: {e}")
            return False

    async def get_database_statistics(self) -> Dict[str, Any]:
        """Get comprehensive database statistics."""
        try:
            async with self.session() as session:
                stats = {}

                # Node counts
                for label in ["CognitiveThread", "ThreadEvolution", "Prediction"]:
                    result = await session.run(f"MATCH (n:{label}) RETURN count(n) as count")
                    record = await result.single()
                    stats[f"{label.lower()}_count"] = record["count"] if record else 0

                # Relationship counts
                result = await session.run("""
                MATCH ()-[r]->()
                RETURN type(r) as rel_type, count(r) as count
                """)
                rel_counts = {}
                async for record in result:
                    rel_counts[f"{record['rel_type'].lower()}_count"] = record["count"]
                stats.update(rel_counts)

                # Cognitive dimension distribution
                result = await session.run("""
                MATCH (t:CognitiveThread)
                RETURN t.cognitive_dimension as dimension, count(t) as count
                """)
                dimension_counts = {}
                async for record in result:
                    dimension_counts[record["dimension"]] = record["count"]
                stats["cognitive_dimension_distribution"] = dimension_counts

                # Time range
                result = await session.run("""
                MATCH (t:CognitiveThread)
                RETURN min(t.timestamp) as earliest, max(t.timestamp) as latest
                """)
                record = await result.single()
                if record:
                    stats["time_range"] = {
                        "earliest": record["earliest"],
                        "latest": record["latest"]
                    }

                # Database size (approximate)
                result = await session.run("CALL apoc.meta.stats() YIELD labels RETURN labels")
                record = await result.single()
                if record and record["labels"]:
                    stats["approx_size_nodes"] = sum(record["labels"].values())

                return stats

        except Exception as e:
            logger.error(f"Failed to get database statistics: {e}")
            return {}

    def _update_query_metrics(self, query_time: float):
        """Update query performance metrics."""
        self.metrics.total_operations += 1

        # Update average query time
        total = self.metrics.total_operations
        prev_avg = self.metrics.average_query_time
        self.metrics.average_query_time = (prev_avg * (total - 1) + query_time) / total

    def _cache_result(self, key: str, result: Any):
        """Cache a query result."""
        self.query_cache[key] = (result, time.time())

        # Remove old entries
        current_time = time.time()
        expired_keys = [
            key for key, (_, timestamp) in self.query_cache.items()
            if current_time - timestamp > self.cache_ttl
        ]
        for key in expired_keys:
            del self.query_cache[key]

    def _get_cached_result(self, key: str) -> Optional[Any]:
        """Get cached result if available and not expired."""
        if key in self.query_cache:
            result, timestamp = self.query_cache[key]
            if time.time() - timestamp < self.cache_ttl:
                return result
            else:
                del self.query_cache[key]
        return None

    def get_persistence_metrics(self) -> Dict[str, Any]:
        """Get comprehensive persistence metrics."""
        return {
            **asdict(self.metrics),
            "is_connected": self.is_connected,
            "cache_size": len(self.query_cache),
            "config": {
                "uri": self.config.uri,
                "database": self.config.database,
                "max_connection_pool_size": self.config.max_connection_pool_size,
                "batch_size": self.config.batch_size
            }
        }

    async def health_check(self) -> Dict[str, bool]:
        """Perform health check on persistence layer."""
        health_status = {}

        # Connection health
        try:
            async with self.session() as session:
                await session.run("RETURN 1")
            health_status["connection"] = True
        except Exception:
            health_status["connection"] = False

        # Schema health
        try:
            if self.schema_manager:
                health_status["schema"] = await self.schema_manager.validate_schema()
            else:
                health_status["schema"] = False
        except Exception:
            health_status["schema"] = False

        # Performance health
        health_status["performance"] = (
            self.metrics.average_query_time < 1.0 and
            self.metrics.failed_operations / max(1, self.metrics.total_operations) < 0.05
        )

        return health_status


# Global persistence instance
_persistence_instance: Optional[CognitiveGraphPersistence] = None


async def get_persistence_instance(config: Optional[GraphPersistenceConfig] = None) -> CognitiveGraphPersistence:
    """Get or create global persistence instance."""
    global _persistence_instance

    if _persistence_instance is None:
        _persistence_instance = CognitiveGraphPersistence(config)
        await _persistence_instance.connect()

    return _persistence_instance


async def close_persistence_instance():
    """Close global persistence instance."""
    global _persistence_instance

    if _persistence_instance:
        await _persistence_instance.disconnect()
        _persistence_instance = None


if __name__ == "__main__":
    # Example usage
    import asyncio

    async def test_persistence():
        logger.info("Testing Neo4j Cognitive Graph Persistence")

        # Create persistence instance
        config = GraphPersistenceConfig(
            enable_schema_validation=True,
            enable_query_logging=True
        )

        persistence = CognitiveGraphPersistence(config)

        try:
            # Connect to database
            await persistence.connect()

            # Create test thread
            test_thread = CognitiveThread(
                thread_id="test_thread_1",
                cognitive_dimension="factual_retrieval",
                content="This is a test cognitive thread for persistence testing.",
                timestamp=time.time(),
                confidence=0.9,
                features=torch.randn(512),
                relationships=["test_thread_2"],
                temporal_position=0
            )

            # Persist thread
            thread_id = await persistence.persist_cognitive_thread(test_thread)
            logger.info(f"Persisted thread: {thread_id}")

            # Retrieve threads
            retrieved_threads = await persistence.retrieve_cognitive_threads(limit=10)
            logger.info(f"Retrieved {len(retrieved_threads)} threads")

            # Get database statistics
            stats = await persistence.get_database_statistics()
            logger.info(f"Database statistics: {stats}")

            # Health check
            health = await persistence.health_check()
            logger.info(f"Health status: {health}")

            # Get metrics
            metrics = persistence.get_persistence_metrics()
            logger.info(f"Performance metrics: {metrics}")

        finally:
            await persistence.disconnect()

        logger.info("Neo4j persistence test completed")

    # Run test
    asyncio.run(test_persistence())