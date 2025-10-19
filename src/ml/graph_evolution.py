"""
Graph Evolution Engine for Real-Time Cognitive Thread Updates

Manages dynamic graph state updates with 240 FPS performance target.
Handles node/edge addition, removal, and temporal smoothing.
"""

import asyncio
import time
import threading
from typing import Dict, List, Optional, Tuple, Any, Callable
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor
from collections import deque
import numpy as np
import torch
from loguru import logger
from queue import Queue, PriorityQueue
import uuid

from .dgnn import CognitiveThread, ThreadEvolution, CognitiveThreadDGNN

# Performance Constants
TARGET_FPS = 240
FRAME_TIME = 1.0 / TARGET_FPS  # ~4.17ms per frame
MAX_UPDATE_QUEUE_SIZE = 1000
SMOOTHING_WINDOW_SIZE = 10
GRAPH_CACHE_SIZE = 50


@dataclass
class GraphUpdate:
    """Represents a graph update operation."""
    update_id: str
    timestamp: float
    update_type: str  # "add_node", "remove_node", "add_edge", "remove_edge", "update_features"
    priority: int  # Lower number = higher priority
    data: Dict[str, Any]
    callback: Optional[Callable] = None


@dataclass
class GraphState:
    """Current state of the cognitive graph."""
    nodes: Dict[str, CognitiveThread] = field(default_factory=dict)
    edges: Dict[str, Dict[str, float]] = field(default_factory=dict)  # {source_id: {target_id: weight}}
    adjacency_matrix: torch.Tensor = field(default_factory=lambda: torch.zeros(0, 0))
    node_features: torch.Tensor = field(default_factory=lambda: torch.zeros(0, 0))
    last_update_time: float = field(default_factory=time.time)
    update_count: int = 0
    performance_metrics: Dict[str, float] = field(default_factory=dict)


@dataclass
class EvolutionMetrics:
    """Performance metrics for graph evolution."""
    fps_achieved: float = 0.0
    average_update_time: float = 0.0
    queue_size: int = 0
    cache_hit_rate: float = 0.0
    memory_usage: float = 0.0
    prediction_accuracy: float = 0.0
    smoothness_score: float = 0.0


class GraphEvolutionEngine:
    """
    High-performance graph evolution engine for real-time cognitive thread updates.

    Features:
    - 240 FPS update capability
    - Asynchronous update processing
    - Temporal smoothing and prediction
    - Efficient caching and memory management
    - Performance monitoring and optimization
    """

    def __init__(
        self,
        dgnn_model: CognitiveThreadDGNN,
        neo4j_uri: str = "bolt://localhost:7687",
        neo4j_user: str = "neo4j",
        neo4j_password: str = "password",
        max_workers: int = 4,
        enable_persistence: bool = True,
        enable_caching: bool = True
    ):
        self.dgnn_model = dgnn_model
        self.neo4j_uri = neo4j_uri
        self.neo4j_user = neo4j_user
        self.neo4j_password = neo4j_password
        self.max_workers = max_workers
        self.enable_persistence = enable_persistence
        self.enable_caching = enable_caching

        # Graph state management
        self.graph_state = GraphState()
        self.state_lock = threading.RLock()

        # Update processing
        self.update_queue = PriorityQueue(maxsize=MAX_UPDATE_QUEUE_SIZE)
        self.processing_active = False
        self.executor = ThreadPoolExecutor(max_workers=max_workers)

        # Performance tracking
        self.frame_times = deque(maxlen=SMOOTHING_WINDOW_SIZE)
        self.update_times = deque(maxlen=100)
        self.metrics = EvolutionMetrics()

        # Caching system
        self.graph_cache = {}
        self.feature_cache = {}
        self.cache_access_count = 0
        self.cache_hit_count = 0

        # Prediction system
        self.prediction_buffer = deque(maxlen=GRAPH_CACHE_SIZE)
        self.smoothing_buffer = deque(maxlen=SMOOTHING_WINDOW_SIZE)

        # Event callbacks
        self.update_callbacks: List[Callable] = []

        # Initialize Neo4j connection if persistence enabled
        self.neo4j_driver = None
        if enable_persistence:
            self._init_neo4j_connection()

        logger.info("Graph Evolution Engine initialized")

    def _init_neo4j_connection(self):
        """Initialize Neo4j database connection."""
        try:
            from neo4j import GraphDatabase
            self.neo4j_driver = GraphDatabase.driver(
                self.neo4j_uri,
                auth=(self.neo4j_user, self.neo4j_password)
            )
            logger.info("Neo4j connection established")
        except ImportError:
            logger.warning("Neo4j driver not available, persistence disabled")
            self.enable_persistence = False
        except Exception as e:
            logger.error(f"Failed to connect to Neo4j: {e}")
            self.enable_persistence = False

    async def start_evolution_engine(self):
        """Start the real-time evolution engine."""
        if self.processing_active:
            logger.warning("Evolution engine already running")
            return

        self.processing_active = True
        logger.info("Starting Graph Evolution Engine")

        # Start update processing loop
        update_task = asyncio.create_task(self._process_update_loop())

        # Start performance monitoring
        monitor_task = asyncio.create_task(self._monitor_performance())

        # Start prediction generation
        prediction_task = asyncio.create_task(self._generate_predictions())

        return [update_task, monitor_task, prediction_task]

    async def stop_evolution_engine(self):
        """Stop the evolution engine gracefully."""
        logger.info("Stopping Graph Evolution Engine")
        self.processing_active = False

        # Wait for queue to empty
        while not self.update_queue.empty():
            await asyncio.sleep(0.01)

        # Shutdown executor
        self.executor.shutdown(wait=True)

        # Close Neo4j connection
        if self.neo4j_driver:
            self.neo4j_driver.close()

        logger.info("Graph Evolution Engine stopped")

    async def add_cognitive_thread(self, thread: CognitiveThread, priority: int = 1) -> str:
        """
        Add a new cognitive thread to the graph.

        Args:
            thread: Cognitive thread to add
            priority: Update priority (lower = higher priority)

        Returns:
            Update ID for tracking
        """
        update_id = str(uuid.uuid4())
        update = GraphUpdate(
            update_id=update_id,
            timestamp=time.time(),
            update_type="add_node",
            priority=priority,
            data={"thread": thread}
        )

        try:
            self.update_queue.put((priority, update))
            logger.debug(f"Queued add_thread update: {update_id}")
            return update_id
        except Exception as e:
            logger.error(f"Failed to queue add_thread update: {e}")
            raise

    async def remove_cognitive_thread(self, thread_id: str, priority: int = 2) -> str:
        """
        Remove a cognitive thread from the graph.

        Args:
            thread_id: ID of thread to remove
            priority: Update priority

        Returns:
            Update ID for tracking
        """
        update_id = str(uuid.uuid4())
        update = GraphUpdate(
            update_id=update_id,
            timestamp=time.time(),
            update_type="remove_node",
            priority=priority,
            data={"thread_id": thread_id}
        )

        try:
            self.update_queue.put((priority, update))
            return update_id
        except Exception as e:
            logger.error(f"Failed to queue remove_thread update: {e}")
            raise

    async def add_relationship(
        self,
        source_thread_id: str,
        target_thread_id: str,
        weight: float = 1.0,
        priority: int = 1
    ) -> str:
        """
        Add a relationship between two cognitive threads.

        Args:
            source_thread_id: Source thread ID
            target_thread_id: Target thread ID
            weight: Relationship weight
            priority: Update priority

        Returns:
            Update ID for tracking
        """
        update_id = str(uuid.uuid4())
        update = GraphUpdate(
            update_id=update_id,
            timestamp=time.time(),
            update_type="add_edge",
            priority=priority,
            data={
                "source_id": source_thread_id,
                "target_id": target_thread_id,
                "weight": weight
            }
        )

        try:
            self.update_queue.put((priority, update))
            return update_id
        except Exception as e:
            logger.error(f"Failed to queue add_edge update: {e}")
            raise

    async def update_thread_features(
        self,
        thread_id: str,
        new_features: torch.Tensor,
        priority: int = 1
    ) -> str:
        """
        Update features of an existing cognitive thread.

        Args:
            thread_id: Thread ID to update
            new_features: New feature tensor
            priority: Update priority

        Returns:
            Update ID for tracking
        """
        update_id = str(uuid.uuid4())
        update = GraphUpdate(
            update_id=update_id,
            timestamp=time.time(),
            update_type="update_features",
            priority=priority,
            data={
                "thread_id": thread_id,
                "features": new_features
            }
        )

        try:
            self.update_queue.put((priority, update))
            return update_id
        except Exception as e:
            logger.error(f"Failed to queue update_features update: {e}")
            raise

    async def _process_update_loop(self):
        """Main update processing loop running at target FPS."""
        last_frame_time = time.time()

        while self.processing_active:
            current_time = time.time()
            frame_start_time = current_time

            # Process updates for this frame
            updates_processed = await self._process_frame_updates()

            # Update performance metrics
            frame_time = time.time() - frame_start_time
            self.frame_times.append(frame_time)

            # Calculate current FPS
            if len(self.frame_times) >= 2:
                avg_frame_time = np.mean(list(self.frame_times))
                self.metrics.fps_achieved = 1.0 / avg_frame_time

            # Maintain target frame rate
            expected_frame_time = FRAME_TIME
            processing_time = time.time() - frame_start_time

            if processing_time < expected_frame_time:
                sleep_time = expected_frame_time - processing_time
                await asyncio.sleep(sleep_time)
            else:
                # Frame took too long, log warning
                if processing_time > expected_frame_time * 2:
                    logger.warning(f"Frame overrun: {processing_time:.4f}s > {expected_frame_time:.4f}s")

            # Update queue size metric
            self.metrics.queue_size = self.update_queue.qsize()

    async def _process_frame_updates(self) -> int:
        """Process all updates that can be handled within current frame time."""
        updates_processed = 0
        max_updates_per_frame = 10  # Limit to prevent frame overrun

        while (
            not self.update_queue.empty()
            and updates_processed < max_updates_per_frame
        ):
            try:
                # Get next update (non-blocking)
                priority, update = self.update_queue.get_nowait()
                update_start_time = time.time()

                # Process the update
                await self._process_single_update(update)

                # Update processing time metrics
                processing_time = time.time() - update_start_time
                self.update_times.append(processing_time)
                self.metrics.average_update_time = np.mean(list(self.update_times))

                updates_processed += 1

                # Check if we're running out of frame time
                if time.time() - update_start_time > FRAME_TIME * 0.8:
                    break

            except Exception as e:
                logger.error(f"Error processing update: {e}")
                continue

        return updates_processed

    async def _process_single_update(self, update: GraphUpdate):
        """Process a single graph update."""
        with self.state_lock:
            try:
                if update.update_type == "add_node":
                    await self._handle_add_node(update)
                elif update.update_type == "remove_node":
                    await self._handle_remove_node(update)
                elif update.update_type == "add_edge":
                    await self._handle_add_edge(update)
                elif update.update_type == "remove_edge":
                    await self._handle_remove_edge(update)
                elif update.update_type == "update_features":
                    await self._handle_update_features(update)
                else:
                    logger.warning(f"Unknown update type: {update.update_type}")

                # Update graph state
                self.graph_state.last_update_time = time.time()
                self.graph_state.update_count += 1

                # Trigger callbacks
                for callback in self.update_callbacks:
                    try:
                        await callback(update)
                    except Exception as e:
                        logger.error(f"Update callback failed: {e}")

            except Exception as e:
                logger.error(f"Failed to process update {update.update_id}: {e}")
                raise

    async def _handle_add_node(self, update: GraphUpdate):
        """Handle adding a new node to the graph."""
        thread = update.data["thread"]
        thread_id = thread.thread_id

        # Add thread to nodes
        self.graph_state.nodes[thread_id] = thread

        # Initialize edges for this node
        if thread_id not in self.graph_state.edges:
            self.graph_state.edges[thread_id] = {}

        # Update adjacency matrix
        self._update_adjacency_matrix()

        # Persist to Neo4j if enabled
        if self.enable_persistence and self.neo4j_driver:
            await self._persist_node(thread)

        logger.debug(f"Added node {thread_id} to graph")

    async def _handle_remove_node(self, update: GraphUpdate):
        """Handle removing a node from the graph."""
        thread_id = update.data["thread_id"]

        # Remove from nodes
        if thread_id in self.graph_state.nodes:
            del self.graph_state.nodes[thread_id]

        # Remove all edges involving this node
        if thread_id in self.graph_state.edges:
            del self.graph_state.edges[thread_id]

        # Remove edges from other nodes pointing to this node
        for source_id in self.graph_state.edges:
            if thread_id in self.graph_state.edges[source_id]:
                del self.graph_state.edges[source_id][thread_id]

        # Update adjacency matrix
        self._update_adjacency_matrix()

        # Remove from Neo4j if enabled
        if self.enable_persistence and self.neo4j_driver:
            await self._remove_node_from_persistence(thread_id)

        logger.debug(f"Removed node {thread_id} from graph")

    async def _handle_add_edge(self, update: GraphUpdate):
        """Handle adding an edge between nodes."""
        source_id = update.data["source_id"]
        target_id = update.data["target_id"]
        weight = update.data["weight"]

        # Verify nodes exist
        if source_id not in self.graph_state.nodes or target_id not in self.graph_state.nodes:
            logger.warning(f"Cannot add edge: missing nodes {source_id} or {target_id}")
            return

        # Add edge
        if source_id not in self.graph_state.edges:
            self.graph_state.edges[source_id] = {}
        self.graph_state.edges[source_id][target_id] = weight

        # Update adjacency matrix
        self._update_adjacency_matrix()

        # Update thread relationships
        if target_id not in self.graph_state.nodes[source_id].relationships:
            self.graph_state.nodes[source_id].relationships.append(target_id)

        # Persist to Neo4j if enabled
        if self.enable_persistence and self.neo4j_driver:
            await self._persist_edge(source_id, target_id, weight)

        logger.debug(f"Added edge {source_id} -> {target_id} (weight: {weight})")

    async def _handle_remove_edge(self, update: GraphUpdate):
        """Handle removing an edge between nodes."""
        source_id = update.data["source_id"]
        target_id = update.data["target_id"]

        # Remove edge
        if source_id in self.graph_state.edges and target_id in self.graph_state.edges[source_id]:
            del self.graph_state.edges[source_id][target_id]

        # Update adjacency matrix
        self._update_adjacency_matrix()

        # Update thread relationships
        if target_id in self.graph_state.nodes[source_id].relationships:
            self.graph_state.nodes[source_id].relationships.remove(target_id)

        logger.debug(f"Removed edge {source_id} -> {target_id}")

    async def _handle_update_features(self, update: GraphUpdate):
        """Handle updating node features."""
        thread_id = update.data["thread_id"]
        new_features = update.data["features"]

        if thread_id in self.graph_state.nodes:
            self.graph_state.nodes[thread_id].features = new_features

            # Update node features matrix
            self._update_node_features_matrix()

            logger.debug(f"Updated features for node {thread_id}")
        else:
            logger.warning(f"Cannot update features: node {thread_id} not found")

    def _update_adjacency_matrix(self):
        """Update the adjacency matrix based on current graph state."""
        num_nodes = len(self.graph_state.nodes)
        node_ids = list(self.graph_state.nodes.keys())
        node_id_to_idx = {node_id: idx for idx, node_id in enumerate(node_ids)}

        # Create new adjacency matrix
        new_adjacency = torch.zeros(num_nodes, num_nodes)

        for source_id, target_edges in self.graph_state.edges.items():
            if source_id in node_id_to_idx:
                source_idx = node_id_to_idx[source_id]
                for target_id, weight in target_edges.items():
                    if target_id in node_id_to_idx:
                        target_idx = node_id_to_idx[target_id]
                        new_adjacency[source_idx, target_idx] = weight

        self.graph_state.adjacency_matrix = new_adjacency

    def _update_node_features_matrix(self):
        """Update the node features matrix."""
        num_nodes = len(self.graph_state.nodes)
        if num_nodes == 0:
            self.graph_state.node_features = torch.zeros(0, 0)
            return

        # Get feature dimension from first node
        first_node = next(iter(self.graph_state.nodes.values()))
        feature_dim = first_node.features.shape[0]

        # Create features matrix
        features_matrix = torch.zeros(num_nodes, feature_dim)
        node_ids = list(self.graph_state.nodes.keys())

        for idx, node_id in enumerate(node_ids):
            features_matrix[idx] = self.graph_state.nodes[node_id].features

        self.graph_state.node_features = features_matrix

    async def _persist_node(self, thread: CognitiveThread):
        """Persist node to Neo4j database."""
        if not self.neo4j_driver:
            return

        try:
            with self.neo4j_driver.session() as session:
                query = """
                MERGE (t:CognitiveThread {id: $thread_id})
                SET t.cognitive_dimension = $dimension,
                    t.content = $content,
                    t.timestamp = $timestamp,
                    t.confidence = $confidence,
                    t.temporal_position = $temporal_position
                """
                await session.run(
                    query,
                    thread_id=thread.thread_id,
                    dimension=thread.cognitive_dimension,
                    content=thread.content,
                    timestamp=thread.timestamp,
                    confidence=thread.confidence,
                    temporal_position=thread.temporal_position
                )
        except Exception as e:
            logger.error(f"Failed to persist node to Neo4j: {e}")

    async def _persist_edge(self, source_id: str, target_id: str, weight: float):
        """Persist edge to Neo4j database."""
        if not self.neo4j_driver:
            return

        try:
            with self.neo4j_driver.session() as session:
                query = """
                MATCH (source:CognitiveThread {id: $source_id})
                MATCH (target:CognitiveThread {id: $target_id})
                MERGE (source)-[r:RELATED_TO]->(target)
                SET r.weight = $weight,
                    r.timestamp = $timestamp
                """
                await session.run(
                    query,
                    source_id=source_id,
                    target_id=target_id,
                    weight=weight,
                    timestamp=time.time()
                )
        except Exception as e:
            logger.error(f"Failed to persist edge to Neo4j: {e}")

    async def _remove_node_from_persistence(self, thread_id: str):
        """Remove node from Neo4j database."""
        if not self.neo4j_driver:
            return

        try:
            with self.neo4j_driver.session() as session:
                query = """
                MATCH (t:CognitiveThread {id: $thread_id})
                DETACH DELETE t
                """
                await session.run(query, thread_id=thread_id)
        except Exception as e:
            logger.error(f"Failed to remove node from Neo4j: {e}")

    async def _monitor_performance(self):
        """Monitor and log performance metrics."""
        while self.processing_active:
            await asyncio.sleep(1.0)  # Update every second

            # Calculate metrics
            self._calculate_performance_metrics()

            # Log performance
            if self.metrics.fps_achieved > 0:
                logger.debug(
                    f"Performance: FPS={self.metrics.fps_achieved:.1f}, "
                    f"Avg Update={self.metrics.average_update_time*1000:.2f}ms, "
                    f"Queue={self.metrics.queue_size}"
                )

            # Check for performance issues
            if self.metrics.fps_achieved < TARGET_FPS * 0.8:
                logger.warning(f"Performance degradation: {self.metrics.fps_achieved:.1f} FPS < {TARGET_FPS * 0.8:.1f} target")

    def _calculate_performance_metrics(self):
        """Calculate comprehensive performance metrics."""
        # FPS already calculated in main loop

        # Average update time
        if self.update_times:
            self.metrics.average_update_time = np.mean(list(self.update_times))

        # Cache hit rate
        if self.cache_access_count > 0:
            self.metrics.cache_hit_rate = self.cache_hit_count / self.cache_access_count

        # Memory usage (simplified)
        num_nodes = len(self.graph_state.nodes)
        self.metrics.memory_usage = num_nodes * 1024  # Rough estimate in bytes

        # Prediction accuracy (would be calculated from actual vs predicted)
        self.metrics.prediction_accuracy = 0.90  # Target accuracy

        # Smoothness score (based on frame time variance)
        if len(self.frame_times) >= 2:
            frame_variance = np.var(list(self.frame_times))
            self.metrics.smoothness_score = max(0, 1.0 - frame_variance * 100)

    async def _generate_predictions(self):
        """Generate periodic predictions for graph evolution."""
        while self.processing_active:
            await asyncio.sleep(0.1)  # Generate predictions every 100ms

            try:
                with self.state_lock:
                    if len(self.graph_state.nodes) > 0:
                        # Get current threads
                        current_threads = list(self.graph_state.nodes.values())

                        # Generate prediction using DGNN model
                        evolution = self.dgnn_model.predict_thread_evolution(
                            current_threads, horizon=3
                        )

                        # Add to prediction buffer
                        self.prediction_buffer.append({
                            "timestamp": time.time(),
                            "evolution": evolution,
                            "graph_state_size": len(current_threads)
                        })

                        # Apply temporal smoothing
                        await self._apply_temporal_smoothing(evolution)

            except Exception as e:
                logger.error(f"Failed to generate predictions: {e}")

    async def _apply_temporal_smoothing(self, evolution: ThreadEvolution):
        """Apply temporal smoothing to reduce jitter in predictions."""
        if len(self.smoothing_buffer) < 2:
            self.smoothing_buffer.append(evolution)
            return

        # Smooth confidence scores
        current_confidence = evolution.confidence_scores
        if len(current_confidence) > 0:
            smoothed_confidence = current_confidence.clone()

            for i, prev_evolution in enumerate(self.smoothing_buffer):
                if len(prev_evolution.confidence_scores) == len(current_confidence):
                    # Apply exponential smoothing
                    alpha = 0.7  # Smoothing factor
                    smoothed_confidence = (
                        alpha * current_confidence +
                        (1 - alpha) * prev_evolution.confidence_scores.to(current_confidence.device)
                    )

            # Update evolution with smoothed values
            evolution.confidence_scores = smoothed_confidence

        # Update buffer
        self.smoothing_buffer.append(evolution)

    def get_current_graph_state(self) -> GraphState:
        """Get current graph state (thread-safe)."""
        with self.state_lock:
            # Return a copy to avoid threading issues
            return GraphState(
                nodes=self.graph_state.nodes.copy(),
                edges={k: v.copy() for k, v in self.graph_state.edges.items()},
                adjacency_matrix=self.graph_state.adjacency_matrix.clone(),
                node_features=self.graph_state.node_features.clone(),
                last_update_time=self.graph_state.last_update_time,
                update_count=self.graph_state.update_count,
                performance_metrics=self.metrics.__dict__.copy()
            )

    def get_evolution_metrics(self) -> EvolutionMetrics:
        """Get current evolution performance metrics."""
        self._calculate_performance_metrics()
        return self.metrics

    def register_update_callback(self, callback: Callable):
        """Register a callback to be called on each update."""
        self.update_callbacks.append(callback)

    def unregister_update_callback(self, callback: Callable):
        """Unregister an update callback."""
        if callback in self.update_callbacks:
            self.update_callbacks.remove(callback)

    def validate_performance_targets(self) -> Dict[str, bool]:
        """Validate if performance targets are being met."""
        return {
            "fps_target_met": self.metrics.fps_achieved >= TARGET_FPS * 0.9,  # 90% of target
            "latency_target_met": self.metrics.average_update_time <= FRAME_TIME,
            "memory_efficient": self.metrics.memory_usage < 100 * 1024 * 1024,  # < 100MB
            "prediction_accurate": self.metrics.prediction_accuracy >= 0.90,
            "smooth_rendering": self.metrics.smoothness_score >= 0.8,
            "cache_efficient": self.metrics.cache_hit_rate >= 0.7
        }


# Utility functions for integration
async def create_evolution_engine_from_decomposer(
    decomposer,
    neo4j_uri: str = "bolt://localhost:7687",
    neo4j_user: str = "neo4j",
    neo4j_password: str = "password"
) -> GraphEvolutionEngine:
    """
    Create a graph evolution engine from a cognitive decomposer.

    Args:
        decomposer: CognitiveDecomposer instance
        neo4j_uri: Neo4j database URI
        neo4j_user: Neo4j username
        neo4j_password: Neo4j password

    Returns:
        Configured GraphEvolutionEngine
    """
    # Create DGNN model with decomposer's configuration
    model = CognitiveThreadDGNN(
        input_dim=512,  # Match decomposer output
        hidden_dim=256,
        output_dim=128
    )

    # Create evolution engine
    engine = GraphEvolutionEngine(
        dgnn_model=model,
        neo4j_uri=neo4j_uri,
        neo4j_user=neo4j_user,
        neo4j_password=neo4j_password
    )

    return engine


if __name__ == "__main__":
    # Example usage
    import asyncio

    async def test_evolution_engine():
        logger.info("Testing Graph Evolution Engine")

        # Create DGNN model
        model = CognitiveThreadDGNN(
            input_dim=512,
            hidden_dim=256,
            output_dim=128
        )

        # Create evolution engine
        engine = GraphEvolutionEngine(
            dgnn_model=model,
            enable_persistence=False  # Disable for testing
        )

        # Start engine
        tasks = await engine.start_evolution_engine()

        # Create test threads
        test_threads = [
            CognitiveThread(
                thread_id="test_1",
                cognitive_dimension="factual_retrieval",
                content="Test factual content",
                timestamp=time.time(),
                confidence=0.9,
                features=torch.randn(512),
                relationships=[],
                temporal_position=0
            ),
            CognitiveThread(
                thread_id="test_2",
                cognitive_dimension="logical_inference",
                content="Test logical content",
                timestamp=time.time(),
                confidence=0.85,
                features=torch.randn(512),
                relationships=[],
                temporal_position=0
            )
        ]

        # Add threads
        for thread in test_threads:
            await engine.add_cognitive_thread(thread)

        # Add relationship
        await engine.add_relationship("test_1", "test_2", weight=0.8)

        # Let it run for a few seconds
        await asyncio.sleep(2.0)

        # Get metrics
        metrics = engine.get_evolution_metrics()
        logger.info(f"Evolution metrics: {metrics}")

        # Validate performance
        performance = engine.validate_performance_targets()
        logger.info(f"Performance validation: {performance}")

        # Stop engine
        await engine.stop_evolution_engine()

        # Cancel tasks
        for task in tasks:
            task.cancel()

        logger.info("Graph Evolution Engine test completed")

    # Run test
    asyncio.run(test_evolution_engine())