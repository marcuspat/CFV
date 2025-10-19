"""
Pytest configuration and fixtures for Cognitive Fabric Visualizer ML testing
"""

import os
import sys
import asyncio
import pytest
import json
import tempfile
from pathlib import Path
from typing import AsyncGenerator, Generator, Dict, Any
from unittest.mock import Mock, AsyncMock, MagicMock

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

# Test configuration
TEST_CONFIG = {
    "database": {
        "postgres": {
            "host": "localhost",
            "port": 5432,
            "database": "cfv_test",
            "user": "test_user",
            "password": "test_password"
        },
        "neo4j": {
            "uri": "bolt://localhost:7687",
            "database": "cfv_test",
            "user": "neo4j",
            "password": "test_password"
        },
        "redis": {
            "host": "localhost",
            "port": 6379,
            "db": 1
        }
    },
    "ml_models": {
        "openai_api_key": "test-openai-key",
        "claude_api_key": "test-claude-key",
        "model_cache_dir": "/tmp/cfv_test_models"
    },
    "performance": {
        "timeout_seconds": 30,
        "max_memory_mb": 1024
    }
}

@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
def test_config():
    """Provide test configuration to all tests."""
    return TEST_CONFIG

@pytest.fixture
def temp_dir():
    """Create a temporary directory for test files."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        yield Path(tmp_dir)

@pytest.fixture
def sample_conversation_data():
    """Sample conversation data for testing."""
    return {
        "id": "test-conv-001",
        "title": "Test Conversation About AI",
        "participants": ["User1", "User2"],
        "messages": [
            {
                "id": "msg-001",
                "speaker": "User1",
                "text": "What do you think about the future of AI?",
                "timestamp": "2024-01-01T10:00:00Z",
                "metadata": {"confidence": 0.95}
            },
            {
                "id": "msg-002",
                "speaker": "User2",
                "text": "I believe AI will transform many industries, but we need to consider the ethical implications carefully.",
                "timestamp": "2024-01-01T10:01:00Z",
                "metadata": {"confidence": 0.88}
            }
        ],
        "metadata": {
            "duration": 60,
            "language": "en",
            "topic": "artificial intelligence"
        }
    }

@pytest.fixture
def sample_cognitive_analysis():
    """Sample cognitive analysis results."""
    return {
        "conversation_id": "test-conv-001",
        "analysis_id": "analysis-001",
        "dimensions": {
            "factual_retrieval": {
                "score": 0.92,
                "confidence": 0.89,
                "elements": [
                    {
                        "type": "fact",
                        "text": "AI will transform many industries",
                        "confidence": 0.85,
                        "source": "User2"
                    }
                ]
            },
            "logical_inference": {
                "score": 0.85,
                "confidence": 0.81,
                "arguments": [
                    {
                        "type": "premise",
                        "text": "AI transformation potential",
                        "confidence": 0.78
                    }
                ]
            },
            "creative_synthesis": {
                "score": 0.60,
                "confidence": 0.55,
                "novelty_score": 0.65
            },
            "meta_cognition": {
                "score": 0.96,
                "confidence": 0.93,
                "strategies": ["ethical_reasoning", "future_planning"]
            }
        },
        "graph_data": {
            "nodes": [
                {"id": "n1", "type": "fact", "label": "AI transformation"},
                {"id": "n2", "type": "premise", "label": "Industry impact"}
            ],
            "edges": [
                {"source": "n1", "target": "n2", "type": "supports", "weight": 0.8}
            ]
        },
        "metadata": {
            "processing_time": 3.2,
            "model_version": "1.0.0",
            "analysis_timestamp": "2024-01-01T10:05:00Z"
        }
    }

@pytest.fixture
async def mock_database_connections():
    """Mock database connections for testing."""
    # Mock PostgreSQL
    mock_pg = AsyncMock()
    mock_pg.connect.return_value = mock_pg
    mock_pg.execute.return_value = []
    mock_pg.fetch.return_value = []
    mock_pg.fetchrow.return_value = None
    mock_pg.close.return_value = None

    # Mock Neo4j
    mock_neo4j = AsyncMock()
    mock_neo4j.run.return_value = []
    mock_neo4j.close.return_value = None

    # Mock Redis
    mock_redis = AsyncMock()
    mock_redis.get.return_value = None
    mock_redis.set.return_value = True
    mock_redis.delete.return_value = 1

    yield {
        "postgres": mock_pg,
        "neo4j": mock_neo4j,
        "redis": mock_redis
    }

@pytest.fixture
def mock_ml_models():
    """Mock ML model responses."""
    mock_openai = AsyncMock()
    mock_openai.chat.completions.create.return_value = {
        "choices": [{
            "message": {
                "content": json.dumps(sample_cognitive_analysis())
            }
        }]
    }

    mock_claude = AsyncMock()
    mock_claude.messages.create.return_value = {
        "content": [{
            "text": json.dumps(sample_cognitive_analysis())
        }]
    }

    return {
        "openai": mock_openai,
        "claude": mock_claude
    }

@pytest.fixture
def mock_websocket():
    """Mock WebSocket for testing."""
    mock_ws = AsyncMock()
    mock_ws.send.return_value = None
    mock_ws.receive.return_value = None
    mock_ws.close.return_value = None
    return mock_ws

@pytest.fixture
def performance_monitor():
    """Performance monitoring fixture."""
    import time
    import psutil

    class PerformanceMonitor:
        def __init__(self):
            self.start_time = None
            self.start_memory = None

        def start(self):
            self.start_time = time.time()
            self.start_memory = psutil.Process().memory_info().rss

        def stop(self):
            end_time = time.time()
            end_memory = psutil.Process().memory_info().rss

            return {
                "duration": end_time - self.start_time,
                "memory_used": end_memory - self.start_memory,
                "peak_memory": end_memory
            }

    return PerformanceMonitor()

@pytest.fixture(autouse=True)
async def cleanup_test_data():
    """Cleanup test data after each test."""
    yield
    # Add any cleanup logic here
    pass

# Custom pytest markers registration
def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )
    config.addinivalue_line(
        "markers", "ml: mark test as ML-related"
    )
    config.addinivalue_line(
        "markers", "accuracy: mark test as accuracy validation"
    )
    config.addinivalue_line(
        "markers", "performance: mark test as performance test"
    )

# Test collection hooks
def pytest_collection_modifyitems(config, items):
    """Modify test collection for custom behavior."""
    for item in items:
        # Add timeout markers for slow tests
        if "slow" in item.keywords:
            item.add_marker(pytest.mark.timeout(300))
        elif "performance" in item.keywords:
            item.add_marker(pytest.mark.timeout(600))

# Environment setup for tests
@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Setup test environment."""
    # Set environment variables
    os.environ["NODE_ENV"] = "test"
    os.environ["LOG_LEVEL"] = "DEBUG"

    # Create test directories
    test_dirs = [
        "/tmp/cfv_test_logs",
        "/tmp/cfv_test_models",
        "/tmp/cfv_test_cache"
    ]

    for dir_path in test_dirs:
        Path(dir_path).mkdir(parents=True, exist_ok=True)

    yield

    # Cleanup test directories
    for dir_path in test_dirs:
        import shutil
        shutil.rmtree(dir_path, ignore_errors=True)