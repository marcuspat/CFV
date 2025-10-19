"""
FastAPI Service for Cognitive Fabric Visualizer ML Engine

Provides real-time cognitive decomposition API with <5 second latency target.
"""

import asyncio
import time
import traceback
from typing import Dict, List, Optional, Any
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import redis
import json
from loguru import logger

# Import ML components
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ml.cognitive_decomposer import CognitiveDecomposer, CognitiveDecompositionResult
from ml.confidence_scorer import ConfidenceScorer, CognitiveExplanation

# Configuration
API_TITLE = "Cognitive Fabric Visualizer API"
API_DESCRIPTION = "Real-time cognitive decomposition and analysis API"
API_VERSION = "1.0.0"

# Performance Targets
MAX_PROCESSING_TIME = 5.0  # seconds
CACHE_TTL = 3600  # 1 hour


# Pydantic Models
class CognitiveAnalysisRequest(BaseModel):
    """Request model for cognitive analysis."""
    text: str = Field(..., min_length=10, max_length=10000, description="Text to analyze")
    use_ensemble: bool = Field(True, description="Use ensemble LLM coordination")
    use_specialized_analyzers: bool = Field(True, description="Use specialized cognitive analyzers")
    user_id: Optional[str] = Field(None, description="User identifier for personalization")
    session_id: Optional[str] = Field(None, description="Session identifier for context")


class CognitiveAnalysisResponse(BaseModel):
    """Response model for cognitive analysis."""
    success: bool
    processing_time: float
    overall_confidence: float
    primitive_count: int
    factual_claims_count: int
    logical_arguments_count: int
    creative_elements_count: int
    metacognitive_elements_count: int
    analysis_result: Optional[Dict[str, Any]] = None
    explanation: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None


class HealthCheckResponse(BaseModel):
    """Response model for health check."""
    status: str
    version: str
    uptime: float
    components: Dict[str, bool]
    performance_metrics: Dict[str, float]


class PerformanceMetricsResponse(BaseModel):
    """Response model for performance metrics."""
    total_requests: int
    successful_requests: int
    average_processing_time: float
    cache_hit_rate: float
    error_rate: float
    uptime: float


# Global variables
cognitive_decomposer: Optional[CognitiveDecomposer] = None
confidence_scorer: Optional[ConfidenceScorer] = None
redis_client: Optional[redis.Redis] = None
app_state: Dict[str, Any] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management."""
    # Startup
    logger.info("Starting Cognitive Fabric Visualizer API")

    try:
        # Initialize components
        global cognitive_decomposer, confidence_scorer, redis_client

        # Get configuration from environment
        openai_api_key = os.getenv("OPENAI_API_KEY")
        anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
        neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        neo4j_user = os.getenv("NEO4J_USER", "neo4j")
        neo4j_password = os.getenv("NEO4J_PASSWORD", "password")
        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))

        # Initialize cognitive decomposer
        cognitive_decomposer = CognitiveDecomposer(
            openai_api_key=openai_api_key,
            anthropic_api_key=anthropic_api_key,
            neo4j_uri=neo4j_uri,
            neo4j_user=neo4j_user,
            neo4j_password=neo4j_password
        )

        # Initialize confidence scorer
        confidence_scorer = ConfidenceScorer()

        # Initialize Redis client
        try:
            redis_client = redis.Redis(
                host=redis_host,
                port=redis_port,
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=5
            )
            # Test connection
            redis_client.ping()
            logger.info("Connected to Redis")
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}. Running without cache.")
            redis_client = None

        # Initialize app state
        app_state.update({
            "start_time": time.time(),
            "total_requests": 0,
            "successful_requests": 0,
            "cache_hits": 0,
            "errors": 0
        })

        logger.info("API initialization completed successfully")

        yield

    except Exception as e:
        logger.error(f"API initialization failed: {e}")
        raise

    finally:
        # Shutdown
        logger.info("Shutting down Cognitive Fabric Visualizer API")
        if cognitive_decomposer:
            cognitive_decomposer.close()


# Initialize FastAPI app
app = FastAPI(
    title=API_TITLE,
    description=API_DESCRIPTION,
    version=API_VERSION,
    lifespan=lifespan
)

# Add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)


# Dependencies
def get_cognitive_decomposer() -> CognitiveDecomposer:
    """Get cognitive decomposer instance."""
    if cognitive_decomposer is None:
        raise HTTPException(status_code=503, detail="Cognitive decomposer not initialized")
    return cognitive_decomposer


def get_confidence_scorer() -> ConfidenceScorer:
    """Get confidence scorer instance."""
    if confidence_scorer is None:
        raise HTTPException(status_code=503, detail="Confidence scorer not initialized")
    return confidence_scorer


def update_metrics(success: bool, cache_hit: bool = False):
    """Update application metrics."""
    app_state["total_requests"] += 1
    if success:
        app_state["successful_requests"] += 1
    if cache_hit:
        app_state["cache_hits"] += 1
    if not success:
        app_state["errors"] += 1


def get_cache_key(text: str, options: Dict[str, Any]) -> str:
    """Generate cache key for analysis request."""
    import hashlib
    content = f"{text}:{json.dumps(options, sort_keys=True)}"
    return hashlib.md5(content.encode()).hexdigest()


# Cache functions
async def get_cached_analysis(cache_key: str) -> Optional[Dict[str, Any]]:
    """Get cached analysis result."""
    if redis_client is None:
        return None

    try:
        cached_data = redis_client.get(f"analysis:{cache_key}")
        if cached_data:
            logger.debug(f"Cache hit for key: {cache_key}")
            update_metrics(success=True, cache_hit=True)
            return json.loads(cached_data)
    except Exception as e:
        logger.warning(f"Cache retrieval failed: {e}")

    return None


async def cache_analysis(cache_key: str, result: Dict[str, Any]):
    """Cache analysis result."""
    if redis_client is None:
        return

    try:
        redis_client.setex(
            f"analysis:{cache_key}",
            CACHE_TTL,
            json.dumps(result, default=str)
        )
        logger.debug(f"Cached result for key: {cache_key}")
    except Exception as e:
        logger.warning(f"Cache storage failed: {e}")


# API Endpoints
@app.post("/analyze", response_model=CognitiveAnalysisResponse)
async def analyze_cognition(
    request: CognitiveAnalysisRequest,
    background_tasks: BackgroundTasks,
    decomposer: CognitiveDecomposer = Depends(get_cognitive_decomposer),
    scorer: ConfidenceScorer = Depends(get_confidence_scorer)
):
    """
    Perform cognitive decomposition analysis.

    Args:
        request: Analysis request parameters
        background_tasks: FastAPI background tasks
        decomposer: Cognitive decomposer instance
        scorer: Confidence scorer instance

    Returns:
        Analysis results with confidence scoring
    """
    start_time = time.time()

    # Check cache first
    cache_key = get_cache_key(request.text, {
        "use_ensemble": request.use_ensemble,
        "use_specialized_analyzers": request.use_specialized_analyzers
    })

    cached_result = await get_cached_analysis(cache_key)
    if cached_result:
        return CognitiveAnalysisResponse(**cached_result)

    try:
        # Perform cognitive decomposition
        logger.info(f"Starting cognitive analysis for {len(request.text)} characters")

        result = await decomposer.decompose_cognition(
            text=request.text,
            use_ensemble=request.use_ensemble,
            use_specialized_analyzers=request.use_specialized_analyzers
        )

        processing_time = time.time() - start_time

        # Check performance target
        if processing_time > MAX_PROCESSING_TIME:
            logger.warning(f"Processing time {processing_time:.2f}s exceeded target {MAX_PROCESSING_TIME}s")

        # Calculate confidence scores
        primitive_confidence = [p.confidence for p in result.primitives]
        ensemble_consensus = {
            dim: res.consensus_score for dim, res in result.ensemble_results.items()
        }
        evidence_strength = {
            "factual_retrieval": result.factual_analysis.get("overall_metrics", {}).get("average_confidence", 0.5),
            "logical_inference": result.logical_analysis.get("overall_metrics", {}).get("argument_strength", 0.5),
            "creative_synthesis": result.creative_analysis.get("overall_metrics", {}).get("creativity_score", 0.5),
            "meta_cognition": result.metacognitive_analysis.get("overall_metrics", {}).get("confidence_score", 0.5)
        }

        confidence_breakdown = scorer.calculate_overall_confidence(
            primitive_confidence=primitive_confidence,
            ensemble_consensus=ensemble_consensus,
            evidence_strength=evidence_strength,
            coherence_score=0.8  # Could be calculated more precisely
        )

        # Generate explanation
        analysis_dict = {
            "primitives": [
                {
                    "text": p.text,
                    "cognitive_dimension": p.cognitive_dimension,
                    "sub_type": p.sub_type,
                    "confidence": p.confidence,
                    "source_span": p.source_span,
                    "relationships": p.relationships
                }
                for p in result.primitives
            ],
            "factual_analysis": result.factual_analysis,
            "logical_analysis": result.logical_analysis,
            "creative_analysis": result.creative_analysis,
            "metacognitive_analysis": result.metacognitive_analysis,
            "ensemble_results": {
                dim: {
                    "final_response": res.final_response,
                    "consensus_score": res.consensus_score,
                    "confidence_distribution": res.confidence_distribution
                }
                for dim, res in result.ensemble_results.items()
            },
            "processing_time": result.processing_time,
            "overall_confidence": result.overall_confidence,
            "performance_metrics": result.performance_metrics
        }

        explanation = scorer.generate_explanation(analysis_dict, confidence_breakdown)

        # Prepare response
        response = CognitiveAnalysisResponse(
            success=True,
            processing_time=processing_time,
            overall_confidence=confidence_breakdown.overall_confidence,
            primitive_count=len(result.primitives),
            factual_claims_count=len(result.factual_analysis.get("factual_claims", [])),
            logical_arguments_count=len(result.logical_analysis.get("arguments", [])),
            creative_elements_count=len(result.creative_analysis.get("creative_elements", [])),
            metacognitive_elements_count=len(result.metacognitive_analysis.get("metacognitive_elements", [])),
            analysis_result=analysis_dict,
            explanation={
                "summary": explanation.summary,
                "confidence_level": explanation.confidence_breakdown.confidence_level.value,
                "dimension_confidence": explanation.confidence_breakdown.dimension_confidence,
                "actionable_insights": explanation.actionable_insights,
                "limitations": explanation.limitations,
                "verification_suggestions": explanation.verification_suggestions
            }
        )

        # Cache result in background
        background_tasks.add_task(
            cache_analysis,
            cache_key,
            response.dict()
        )

        # Update metrics
        update_metrics(success=True)

        logger.info(f"Cognitive analysis completed in {processing_time:.2f}s with confidence {confidence_breakdown.overall_confidence:.2f}")

        return response

    except Exception as e:
        processing_time = time.time() - start_time
        error_msg = f"Analysis failed: {str(e)}"
        logger.error(f"{error_msg}\n{traceback.format_exc()}")

        # Update metrics
        update_metrics(success=False)

        return CognitiveAnalysisResponse(
            success=False,
            processing_time=processing_time,
            overall_confidence=0.0,
            primitive_count=0,
            factual_claims_count=0,
            logical_arguments_count=0,
            creative_elements_count=0,
            metacognitive_elements_count=0,
            error_message=error_msg
        )


@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """Health check endpoint."""
    uptime = time.time() - app_state.get("start_time", time.time())

    # Check component health
    components = {
        "cognitive_decomposer": cognitive_decomposer is not None,
        "confidence_scorer": confidence_scorer is not None,
        "redis": redis_client is not None
    }

    # Check external service health if available
    if cognitive_decomposer:
        try:
            health_status = await cognitive_decomposer.ensemble_coordinator.health_check()
            components.update(health_status)
        except Exception as e:
            logger.warning(f"Health check for external services failed: {e}")
            components["external_services"] = False

    all_healthy = all(components.values())
    status = "healthy" if all_healthy else "degraded"

    # Get performance metrics
    performance_metrics = {}
    if cognitive_decomposer:
        performance_metrics = cognitive_decomposer.get_performance_metrics()

    return HealthCheckResponse(
        status=status,
        version=API_VERSION,
        uptime=uptime,
        components=components,
        performance_metrics=performance_metrics
    )


@app.get("/metrics", response_model=PerformanceMetricsResponse)
async def get_metrics():
    """Get application performance metrics."""
    uptime = time.time() - app_state.get("start_time", time.time())
    total_requests = app_state.get("total_requests", 0)
    successful_requests = app_state.get("successful_requests", 0)
    cache_hits = app_state.get("cache_hits", 0)
    errors = app_state.get("errors", 0)

    # Calculate derived metrics
    average_processing_time = 0.0
    error_rate = errors / max(1, total_requests)
    cache_hit_rate = cache_hits / max(1, total_requests)

    # Get ML component metrics
    if cognitive_decomposer:
        ml_metrics = cognitive_decomposer.get_performance_metrics()
        average_processing_time = ml_metrics.get("average_processing_time", 0.0)

    return PerformanceMetricsResponse(
        total_requests=total_requests,
        successful_requests=successful_requests,
        average_processing_time=average_processing_time,
        cache_hit_rate=cache_hit_rate,
        error_rate=error_rate,
        uptime=uptime
    )


@app.get("/models/performance")
async def get_model_performance(
    decomposer: CognitiveDecomposer = Depends(get_cognitive_decomposer)
):
    """Get detailed performance metrics for ML models."""
    if decomposer is None:
        raise HTTPException(status_code=503, detail="Cognitive decomposer not available")

    return {
        "cognitive_decomposer": decomposer.get_performance_metrics(),
        "factual_detector": decomposer.factual_detector.get_performance_metrics(),
        "logical_mapper": decomposer.logical_mapper.get_performance_metrics(),
        "creative_identifier": decomposer.creative_identifier.get_performance_metrics(),
        "metacognition_analyzer": decomposer.metacognition_analyzer.get_performance_metrics(),
        "ensemble_coordinator": decomposer.ensemble_coordinator.get_performance_metrics(),
        "confidence_scorer": confidence_scorer.get_performance_metrics() if confidence_scorer else {}
    }


@app.get("/validation/targets")
async def get_validation_targets(
    decomposer: CognitiveDecomposer = Depends(get_cognitive_decomposer)
):
    """Get performance target validation status."""
    if decomposer is None:
        raise HTTPException(status_code=503, detail="Cognitive decomposer not available")

    validation_status = decomposer.validate_performance_targets()

    # Add individual component targets
    factual_metrics = decomposer.factual_detector.get_performance_metrics()
    logical_metrics = decomposer.logical_mapper.get_performance_metrics()
    creative_metrics = decomposer.creative_identifier.get_performance_metrics()
    metacog_metrics = decomposer.metacognition_analyzer.get_performance_metrics()

    component_targets = {
        "factual_retrieval": {
            "target": 0.92,
            "current": factual_metrics.get("accuracy_score", 0.0),
            "met": factual_metrics.get("accuracy_score", 0.0) >= 0.92
        },
        "logical_inference": {
            "target": 0.85,
            "current": logical_metrics.get("precision_score", 0.0),
            "met": logical_metrics.get("precision_score", 0.0) >= 0.85
        },
        "creative_synthesis": {
            "target": 0.60,
            "current": creative_metrics.get("average_rouge_l", 0.0),
            "met": creative_metrics.get("average_rouge_l", 0.0) >= 0.60
        },
        "meta_cognition": {
            "target": 0.96,
            "current": metacog_metrics.get("f1_score", 0.0),
            "met": metacog_metrics.get("f1_score", 0.0) >= 0.96
        }
    }

    return {
        "overall_targets": validation_status,
        "component_targets": component_targets,
        "system_health": all(validation_status.values()) and all(target["met"] for target in component_targets.values())
    }


@app.delete("/cache")
async def clear_cache():
    """Clear analysis cache."""
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Cache not available")

    try:
        # Delete all analysis keys
        keys = redis_client.keys("analysis:*")
        if keys:
            redis_client.delete(*keys)
            logger.info(f"Cleared {len(keys)} cached analyses")

        return {"status": "success", "cleared_keys": len(keys)}

    except Exception as e:
        logger.error(f"Cache clearing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Cache clearing failed: {str(e)}")


# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "path": str(request.url)
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle general exceptions."""
    logger.error(f"Unhandled exception: {exc}\n{traceback.format_exc()}")

    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "status_code": 500,
            "path": str(request.url)
        }
    )


# Main entry point
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )