"""
FastAPI Endpoints for Cognitive Thread Prediction API

Provides RESTful API endpoints for cognitive thread analysis, prediction,
and visualization with real-time capabilities and performance monitoring.
"""

import asyncio
import time
import uuid
from typing import Dict, List, Optional, Any, Union
from datetime import datetime, timedelta
import json
import torch
import numpy as np
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query, Body, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from loguru import logger
import uvicorn

from ..ml.cognitive_dgnn_integration import (
    CognitiveDGNNIntegration,
    IntegrationConfig,
    create_integrated_cognitive_analyzer
)
from ..ml.thread_predictor import PredictionType
from ..ml.neo4j_persistence import CognitiveGraphPersistence, GraphPersistenceConfig


# Pydantic models for API requests/responses
class CognitiveAnalysisRequest(BaseModel):
    """Request model for cognitive analysis."""
    text: str = Field(..., description="Text to analyze for cognitive patterns")
    enable_prediction: bool = Field(True, description="Enable DGNN predictions")
    prediction_types: Optional[List[str]] = Field(
        ["evolution", "relationships", "anomalies"],
        description="Types of predictions to generate"
    )
    cache_results: bool = Field(True, description="Cache analysis results")


class CognitiveAnalysisResponse(BaseModel):
    """Response model for cognitive analysis."""
    analysis_id: str
    text_length: int
    processing_time: float
    decomposition_result: Dict[str, Any]
    predictions: Dict[str, Any]
    accuracy_metrics: Dict[str, float]
    performance_metrics: Dict[str, float]
    timestamp: datetime


class PredictionRequest(BaseModel):
    """Request model for specific predictions."""
    thread_ids: List[str] = Field(..., description="Thread IDs to predict for")
    prediction_type: str = Field(..., description="Type of prediction")
    horizon: int = Field(5, description="Prediction horizon")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Additional parameters")


class PredictionResponse(BaseModel):
    """Response model for predictions."""
    prediction_id: str
    prediction_type: str
    target_threads: List[str]
    horizon: int
    predictions: Dict[str, Any]
    confidence_scores: List[float]
    uncertainty_estimates: List[float]
    execution_time: float
    timestamp: datetime


class BatchAnalysisRequest(BaseModel):
    """Request model for batch cognitive analysis."""
    texts: List[str] = Field(..., description="Texts to analyze")
    enable_prediction: bool = Field(True, description="Enable DGNN predictions")
    max_concurrent: int = Field(3, description="Maximum concurrent analyses")


class BatchAnalysisResponse(BaseModel):
    """Response model for batch analysis."""
    batch_id: str
    total_texts: int
    successful_analyses: int
    processing_time: float
    results: List[CognitiveAnalysisResponse]
    timestamp: datetime


class PerformanceMetricsResponse(BaseModel):
    """Response model for performance metrics."""
    integration_metrics: Dict[str, Any]
    evolution_engine_metrics: Dict[str, Any]
    predictor_metrics: Dict[str, Any]
    persistence_metrics: Dict[str, Any]
    target_validation: Dict[str, bool]
    timestamp: datetime


class HealthCheckResponse(BaseModel):
    """Response model for health check."""
    status: str
    components: Dict[str, bool]
    uptime: float
    version: str
    timestamp: datetime


# Global application state
class ApplicationState:
    """Manages global application state."""

    def __init__(self):
        self.integration: Optional[CognitiveDGNNIntegration] = None
        self.persistence: Optional[CognitiveGraphPersistence] = None
        self.is_initialized = False
        self.start_time = time.time()
        self.analysis_cache: Dict[str, Dict[str, Any]] = {}
        self.active_tasks: Dict[str, asyncio.Task] = {}
        self.version = "1.0.0"


# Global state instance
app_state = ApplicationState()


# FastAPI application
app = FastAPI(
    title="Cognitive Thread Prediction API",
    description="Advanced cognitive analysis with DGNN predictions for thread evolution",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Dependency injection
async def get_integration() -> CognitiveDGNNIntegration:
    """Get the cognitive integration instance."""
    if not app_state.is_initialized or app_state.integration is None:
        raise HTTPException(
            status_code=503,
            detail="Cognitive integration not initialized"
        )
    return app_state.integration


async def get_persistence() -> CognitiveGraphPersistence:
    """Get the persistence instance."""
    if app_state.persistence is None:
        raise HTTPException(
            status_code=503,
            detail="Persistence layer not available"
        )
    return app_state.persistence


# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Initialize the application on startup."""
    logger.info("Starting Cognitive Thread Prediction API")

    try:
        # Initialize configuration
        integration_config = IntegrationConfig(
            enable_real_time_prediction=True,
            prediction_horizon=5,
            confidence_threshold=0.8,
            target_fps=240,
            accuracy_target=0.90
        )

        persistence_config = GraphPersistenceConfig(
            enable_schema_validation=True,
            batch_size=1000
        )

        # Create integration
        app_state.integration = await create_integrated_cognitive_analyzer(
            config=integration_config,
            neo4j_uri="bolt://localhost:7687",
            neo4j_user="neo4j",
            neo4j_password="password"
        )

        # Create persistence
        from ..ml.neo4j_persistence import CognitiveGraphPersistence
        app_state.persistence = CognitiveGraphPersistence(persistence_config)
        await app_state.persistence.connect()

        app_state.is_initialized = True
        logger.info("Cognitive Thread Prediction API initialized successfully")

    except Exception as e:
        logger.error(f"Failed to initialize API: {e}")
        # Continue without some components for graceful degradation


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up on shutdown."""
    logger.info("Shutting down Cognitive Thread Prediction API")

    try:
        # Cancel active tasks
        for task_id, task in app_state.active_tasks.items():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Stop integration
        if app_state.integration:
            await app_state.integration.stop_services()

        # Disconnect persistence
        if app_state.persistence:
            await app_state.persistence.disconnect()

        logger.info("API shutdown completed")

    except Exception as e:
        logger.error(f"Error during shutdown: {e}")


# API endpoints
@app.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint."""
    return {
        "message": "Cognitive Thread Prediction API",
        "version": app_state.version,
        "status": "operational" if app_state.is_initialized else "initializing"
    }


@app.get("/health", response_model=HealthCheckResponse)
async def health_check():
    """Comprehensive health check endpoint."""
    uptime = time.time() - app_state.start_time

    components = {
        "integration": app_state.is_initialized and app_state.integration is not None,
        "persistence": app_state.persistence is not None and await _check_persistence_health(),
        "api": True
    }

    overall_status = "healthy" if all(components.values()) else "degraded"

    return HealthCheckResponse(
        status=overall_status,
        components=components,
        uptime=uptime,
        version=app_state.version,
        timestamp=datetime.now()
    )


async def _check_persistence_health() -> bool:
    """Check persistence layer health."""
    if app_state.persistence is None:
        return False

    try:
        health = await app_state.persistence.health_check()
        return all(health.values())
    except Exception:
        return False


@app.post("/analyze", response_model=CognitiveAnalysisResponse)
async def analyze_cognition(
    request: CognitiveAnalysisRequest,
    background_tasks: BackgroundTasks,
    integration: CognitiveDGNNIntegration = Depends(get_integration)
):
    """
    Perform comprehensive cognitive analysis with DGNN predictions.

    This endpoint analyzes text for cognitive patterns and generates predictions
    about thread evolution, relationships, and anomalies.
    """
    analysis_id = str(uuid.uuid4())
    start_time = time.time()

    logger.info(f"Starting cognitive analysis {analysis_id} for text of length {len(request.text)}")

    try:
        # Check cache first
        cache_key = f"analysis_{hash(request.text)}_{request.enable_prediction}_{hash(str(request.prediction_types))}"
        if request.cache_results and cache_key in app_state.analysis_cache:
            cached_result = app_state.analysis_cache[cache_key]
            logger.info(f"Returning cached analysis for {analysis_id}")
            return CognitiveAnalysisResponse(
                analysis_id=analysis_id,
                text_length=len(request.text),
                processing_time=cached_result["processing_time"],
                decomposition_result=cached_result["decomposition_result"],
                predictions=cached_result["predictions"],
                accuracy_metrics=cached_result["accuracy_metrics"],
                performance_metrics=cached_result["performance_metrics"],
                timestamp=datetime.now()
            )

        # Perform analysis
        result = await integration.analyze_cognition(
            text=request.text,
            enable_prediction=request.enable_prediction,
            prediction_types=request.prediction_types
        )

        # Prepare response data
        decomposition_data = {
            "num_primitives": len(result.decomposition_result.primitives) if result.decomposition_result.primitives else 0,
            "overall_confidence": result.decomposition_result.overall_confidence if result.decomposition_result else 0.0,
            "processing_time": result.decomposition_result.processing_time if result.decomposition_result else 0.0,
            "performance_metrics": result.decomposition_result.performance_metrics if result.decomposition_result else {}
        }

        predictions_data = {}
        for pred_type, pred_result in result.predictions.items():
            predictions_data[pred_type] = {
                "prediction_type": pred_result.prediction_type.value,
                "target_threads": pred_result.target_threads,
                "horizon": pred_result.horizon,
                "execution_time": pred_result.execution_time,
                "confidence_scores": pred_result.confidence_scores.cpu().numpy().tolist() if pred_result.confidence_scores.numel() > 0 else [],
                "uncertainty_estimates": pred_result.uncertainty_estimates.cpu().numpy().tolist() if pred_result.uncertainty_estimates.numel() > 0 else []
            }

        # Cache result if requested
        if request.cache_results:
            app_state.analysis_cache[cache_key] = {
                "processing_time": result.processing_time,
                "decomposition_result": decomposition_data,
                "predictions": predictions_data,
                "accuracy_metrics": result.accuracy_metrics,
                "performance_metrics": result.performance_metrics
            }

            # Clean old cache entries
            if len(app_state.analysis_cache) > 1000:
                oldest_keys = list(app_state.analysis_cache.keys())[:-1000]
                for key in oldest_keys:
                    del app_state.analysis_cache[key]

        logger.info(f"Cognitive analysis {analysis_id} completed in {result.processing_time:.3f}s")

        return CognitiveAnalysisResponse(
            analysis_id=analysis_id,
            text_length=len(request.text),
            processing_time=result.processing_time,
            decomposition_result=decomposition_data,
            predictions=predictions_data,
            accuracy_metrics=result.accuracy_metrics,
            performance_metrics=result.performance_metrics,
            timestamp=datetime.now()
        )

    except Exception as e:
        logger.error(f"Cognitive analysis {analysis_id} failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Cognitive analysis failed: {str(e)}"
        )


@app.post("/predict", response_model=PredictionResponse)
async def predict_threads(
    request: PredictionRequest,
    integration: CognitiveDGNNIntegration = Depends(get_integration)
):
    """
    Generate predictions for specific cognitive threads.

    This endpoint provides focused prediction capabilities for existing
    cognitive threads, including evolution, relationships, and anomaly detection.
    """
    prediction_id = str(uuid.uuid4())
    start_time = time.time()

    logger.info(f"Starting prediction {prediction_id} for {len(request.thread_ids)} threads")

    try:
        # Validate prediction type
        valid_types = ["evolution", "relationships", "anomalies"]
        if request.prediction_type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid prediction type. Must be one of: {valid_types}"
            )

        # Get thread predictor
        if not integration.thread_predictor:
            raise HTTPException(
                status_code=503,
                detail="Thread predictor not available"
            )

        predictor = integration.thread_predictor

        # Generate prediction based on type
        if request.prediction_type == "evolution":
            result = await predictor.predict_thread_evolution(
                thread_ids=request.thread_ids,
                horizon=request.horizon,
                cache_key=f"evolution_{hash(str(request.thread_ids))}_{request.horizon}"
            )
        elif request.prediction_type == "relationships":
            result = await predictor.predict_relationship_formation(
                thread_ids=request.thread_ids,
                horizon=request.horizon,
                threshold=request.parameters.get("threshold", 0.5)
            )
        elif request.prediction_type == "anomalies":
            result = await predictor.detect_anomalies(
                thread_ids=request.thread_ids,
                anomaly_threshold=request.parameters.get("anomaly_threshold", 2.0)
            )

        # Prepare response
        predictions_data = {
            "query_id": result.query_id,
            "prediction_type": result.prediction_type.value,
            "predictions": result.predictions,
            "metadata": result.metadata
        }

        confidence_scores = result.confidence_scores.cpu().numpy().tolist() if result.confidence_scores.numel() > 0 else []
        uncertainty_estimates = result.uncertainty_estimates.cpu().numpy().tolist() if result.uncertainty_estimates.numel() > 0 else []

        logger.info(f"Prediction {prediction_id} completed in {result.execution_time:.3f}s")

        return PredictionResponse(
            prediction_id=prediction_id,
            prediction_type=request.prediction_type,
            target_threads=request.thread_ids,
            horizon=request.horizon,
            predictions=predictions_data,
            confidence_scores=confidence_scores,
            uncertainty_estimates=uncertainty_estimates,
            execution_time=result.execution_time,
            timestamp=datetime.now()
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Prediction {prediction_id} failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(e)}"
        )


@app.post("/batch-analyze", response_model=BatchAnalysisResponse)
async def batch_analyze_cognition(
    request: BatchAnalysisRequest,
    integration: CognitiveDGNNIntegration = Depends(get_integration)
):
    """
    Perform batch cognitive analysis on multiple texts.

    This endpoint processes multiple texts concurrently, providing
    efficient batch processing for large-scale analysis.
    """
    batch_id = str(uuid.uuid4())
    start_time = time.time()

    logger.info(f"Starting batch analysis {batch_id} for {len(request.texts)} texts")

    try:
        # Validate input
        if len(request.texts) == 0:
            raise HTTPException(
                status_code=400,
                detail="No texts provided for analysis"
            )

        if len(request.texts) > 100:
            raise HTTPException(
                status_code=400,
                detail="Too many texts provided. Maximum 100 per batch."
            )

        # Perform batch analysis
        results = await integration.analyze_batch(
            texts=request.texts,
            enable_prediction=request.enable_prediction
        )

        # Convert to response format
        analysis_responses = []
        successful_count = 0

        for i, result in enumerate(results):
            if result.accuracy_metrics.get("error", False):
                # Create error response
                error_response = CognitiveAnalysisResponse(
                    analysis_id=f"{batch_id}_{i}",
                    text_length=len(request.texts[i]),
                    processing_time=0.0,
                    decomposition_result={"error": True},
                    predictions={"error": True},
                    accuracy_metrics={"error": True},
                    performance_metrics={"error": True},
                    timestamp=datetime.now()
                )
                analysis_responses.append(error_response)
            else:
                # Create successful response
                decomposition_data = {
                    "num_primitives": len(result.decomposition_result.primitives) if result.decomposition_result.primitives else 0,
                    "overall_confidence": result.decomposition_result.overall_confidence if result.decomposition_result else 0.0,
                    "processing_time": result.decomposition_result.processing_time if result.decomposition_result else 0.0
                }

                predictions_data = {}
                for pred_type, pred_result in result.predictions.items():
                    predictions_data[pred_type] = {
                        "prediction_type": pred_result.prediction_type.value,
                        "target_threads": pred_result.target_threads,
                        "horizon": pred_result.horizon,
                        "execution_time": pred_result.execution_time,
                        "confidence_scores": pred_result.confidence_scores.cpu().numpy().tolist() if pred_result.confidence_scores.numel() > 0 else []
                    }

                response = CognitiveAnalysisResponse(
                    analysis_id=f"{batch_id}_{i}",
                    text_length=len(request.texts[i]),
                    processing_time=result.processing_time,
                    decomposition_result=decomposition_data,
                    predictions=predictions_data,
                    accuracy_metrics=result.accuracy_metrics,
                    performance_metrics=result.performance_metrics,
                    timestamp=datetime.now()
                )
                analysis_responses.append(response)
                successful_count += 1

        processing_time = time.time() - start_time

        logger.info(f"Batch analysis {batch_id} completed in {processing_time:.3f}s, {successful_count}/{len(request.texts)} successful")

        return BatchAnalysisResponse(
            batch_id=batch_id,
            total_texts=len(request.texts),
            successful_analyses=successful_count,
            processing_time=processing_time,
            results=analysis_responses,
            timestamp=datetime.now()
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch analysis {batch_id} failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Batch analysis failed: {str(e)}"
        )


@app.get("/metrics", response_model=PerformanceMetricsResponse)
async def get_performance_metrics(
    integration: CognitiveDGNNIntegration = Depends(get_integration),
    persistence: CognitiveGraphPersistence = Depends(get_persistence)
):
    """
    Get comprehensive performance metrics from all components.

    This endpoint provides detailed performance metrics for monitoring
    and optimization of the cognitive analysis system.
    """
    try:
        # Get metrics from all components
        integration_summary = integration.get_integration_summary()

        evolution_metrics = {}
        if integration.evolution_engine:
            evolution_metrics = integration.evolution_engine.get_evolution_metrics().__dict__

        predictor_metrics = {}
        if integration.thread_predictor:
            predictor_metrics = integration.thread_predictor.get_performance_metrics()

        persistence_metrics = {}
        if persistence:
            persistence_metrics = persistence.get_persistence_metrics()

        # Validate targets
        target_validation = integration.validate_integration_targets()

        return PerformanceMetricsResponse(
            integration_metrics=integration_summary,
            evolution_engine_metrics=evolution_metrics,
            predictor_metrics=predictor_metrics,
            persistence_metrics=persistence_metrics,
            target_validation=target_validation,
            timestamp=datetime.now()
        )

    except Exception as e:
        logger.error(f"Failed to get performance metrics: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve metrics: {str(e)}"
        )


@app.get("/threads")
async def get_cognitive_threads(
    limit: int = Query(50, description="Maximum number of threads to return"),
    cognitive_dimension: Optional[str] = Query(None, description="Filter by cognitive dimension"),
    min_confidence: float = Query(0.0, description="Minimum confidence threshold"),
    time_range_hours: int = Query(24, description="Time range in hours"),
    persistence: CognitiveGraphPersistence = Depends(get_persistence)
):
    """
    Retrieve cognitive threads with optional filtering.

    This endpoint provides access to stored cognitive threads
    with various filtering options for exploration and analysis.
    """
    try:
        # Calculate time range
        end_time = time.time()
        start_time = end_time - (time_range_hours * 3600)

        # Retrieve threads
        threads = await persistence.retrieve_cognitive_threads(
            limit=limit,
            cognitive_dimension=cognitive_dimension,
            time_range=(start_time, end_time),
            min_confidence=min_confidence
        )

        return {
            "threads": threads,
            "count": len(threads),
            "filters": {
                "limit": limit,
                "cognitive_dimension": cognitive_dimension,
                "min_confidence": min_confidence,
                "time_range_hours": time_range_hours
            },
            "timestamp": datetime.now()
        }

    except Exception as e:
        logger.error(f"Failed to retrieve threads: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve threads: {str(e)}"
        )


@app.get("/threads/{thread_id}/relationships")
async def get_thread_relationships(
    thread_id: str,
    max_depth: int = Query(2, description="Maximum relationship depth"),
    persistence: CognitiveGraphPersistence = Depends(get_persistence)
):
    """
    Retrieve relationships for a specific cognitive thread.

    This endpoint provides the network of relationships
    connected to a specific cognitive thread.
    """
    try:
        relationships = await persistence.retrieve_thread_relationships(
            thread_id=thread_id,
            max_depth=max_depth
        )

        return {
            "thread_id": thread_id,
            "relationships": relationships,
            "count": len(relationships),
            "max_depth": max_depth,
            "timestamp": datetime.now()
        }

    except Exception as e:
        logger.error(f"Failed to retrieve relationships for thread {thread_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve relationships: {str(e)}"
        )


@app.get("/evolutions")
async def get_thread_evolutions(
    thread_id: Optional[str] = Query(None, description="Filter by thread ID"),
    limit: int = Query(10, description="Maximum number of evolutions to return"),
    persistence: CognitiveGraphPersistence = Depends(get_persistence)
):
    """
    Retrieve thread evolution data.

    This endpoint provides access to stored thread evolution
    predictions and analysis results.
    """
    try:
        evolutions = await persistence.retrieve_thread_evolution(
            evolution_id=None,
            thread_id=thread_id,
            limit=limit
        )

        return {
            "evolutions": evolutions,
            "count": len(evolutions),
            "filters": {
                "thread_id": thread_id,
                "limit": limit
            },
            "timestamp": datetime.now()
        }

    except Exception as e:
        logger.error(f"Failed to retrieve evolutions: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve evolutions: {str(e)}"
        )


@app.get("/statistics")
async def get_database_statistics(
    persistence: CognitiveGraphPersistence = Depends(get_persistence)
):
    """
    Get comprehensive database statistics.

    This endpoint provides statistical information about
    the stored cognitive data for monitoring and analysis.
    """
    try:
        stats = await persistence.get_database_statistics()

        return {
            "statistics": stats,
            "timestamp": datetime.now()
        }

    except Exception as e:
        logger.error(f"Failed to get database statistics: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve statistics: {str(e)}"
        )


@app.delete("/cache")
async def clear_cache():
    """Clear the analysis cache."""
    try:
        cache_size = len(app_state.analysis_cache)
        app_state.analysis_cache.clear()

        return {
            "message": "Cache cleared successfully",
            "cleared_entries": cache_size,
            "timestamp": datetime.now()
        }

    except Exception as e:
        logger.error(f"Failed to clear cache: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear cache: {str(e)}"
        )


# Background task management
@app.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    """Cancel a background task."""
    if task_id in app_state.active_tasks:
        task = app_state.active_tasks[task_id]
        task.cancel()
        del app_state.active_tasks[task_id]

        return {
            "message": f"Task {task_id} cancelled successfully",
            "timestamp": datetime.now()
        }
    else:
        raise HTTPException(
            status_code=404,
            detail=f"Task {task_id} not found"
        )


# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.status_code,
                "message": exc.detail,
                "timestamp": datetime.now()
            }
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle general exceptions."""
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": 500,
                "message": "Internal server error",
                "timestamp": datetime.now()
            }
        }
    )


# Main function for running the server
def run_server(
    host: str = "0.0.0.0",
    port: int = 8000,
    debug: bool = False,
    log_level: str = "info"
):
    """Run the FastAPI server."""
    logger.info(f"Starting Cognitive Thread Prediction API server on {host}:{port}")

    uvicorn.run(
        "src.api.prediction_api:app",
        host=host,
        port=port,
        reload=debug,
        log_level=log_level
    )


if __name__ == "__main__":
    run_server(debug=True)