"""
Cognitive Thread Predictor with Multi-Step Ahead Prediction

Advanced prediction system for cognitive thread evolution with uncertainty quantification,
interactive query interface, and export capabilities.
"""

import asyncio
import time
import json
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Dict, List, Optional, Tuple, Any, Union, Callable
from dataclasses import dataclass, asdict
from enum import Enum
import pickle
import csv
from datetime import datetime
from loguru import logger
import uuid
from pathlib import Path

from .dgnn import CognitiveThread, ThreadEvolution, CognitiveThreadDGNN
from .graph_evolution import GraphEvolutionEngine

# Prediction Configuration
DEFAULT_HORIZON = 5  # Default prediction horizon (steps)
MAX_HORIZON = 20  # Maximum prediction horizon
CONFIDENCE_THRESHOLD = 0.7
UNCERTAINTY_THRESHOLD = 0.3
PREDICTION_CACHE_SIZE = 100
MIN_SAMPLES_FOR_CALIBRATION = 50


class PredictionType(Enum):
    """Types of predictions supported by the system."""
    THREAD_EVOLUTION = "thread_evolution"
    RELATIONSHIP_FORMATION = "relationship_formation"
    CONFIDENCE_DECAY = "confidence_decay"
    EMERGENCE_PROBABILITY = "emergence_probability"
    ANOMALY_DETECTION = "anomaly_detection"


@dataclass
class PredictionQuery:
    """Represents a prediction query."""
    query_id: str
    query_type: PredictionType
    target_threads: List[str]  # Thread IDs to predict for
    horizon: int
    parameters: Dict[str, Any]
    timestamp: float
    callback: Optional[Callable] = None


@dataclass
class PredictionResult:
    """Represents a prediction result."""
    query_id: str
    prediction_type: PredictionType
    target_threads: List[str]
    horizon: int
    predictions: Dict[str, Any]
    confidence_scores: torch.Tensor
    uncertainty_estimates: torch.Tensor
    execution_time: float
    model_version: str
    metadata: Dict[str, Any]


@dataclass
class UncertaintyQuantification:
    """Uncertainty quantification for predictions."""
    epistemic_uncertainty: float  # Model uncertainty
    aleatoric_uncertainty: float  # Data uncertainty
    total_uncertainty: float
    confidence_intervals: Dict[str, Tuple[float, float]]
    calibration_score: float
    prediction_coverage: float


class MonteCarloDropout(nn.Module):
    """Monte Carlo dropout for uncertainty estimation."""

    def __init__(self, p: float = 0.1):
        super().__init__()
        self.p = p
        self.dropout = nn.Dropout(p)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.dropout(x)

    def enable_mc_dropout(self):
        """Enable Monte Carlo dropout during inference."""
        self.train()  # Keep dropout active during evaluation


class BayesianThreadPredictor(nn.Module):
    """
    Bayesian neural network for cognitive thread prediction with uncertainty quantification.

    Uses Monte Carlo dropout and ensemble methods for robust uncertainty estimation.
    """

    def __init__(
        self,
        input_dim: int = 128,
        hidden_dim: int = 256,
        output_dim: int = 128,
        num_layers: int = 3,
        dropout_rate: float = 0.1,
        num_mc_samples: int = 50,
        ensemble_size: int = 5
    ):
        super().__init__()

        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.output_dim = output_dim
        self.num_layers = num_layers
        self.dropout_rate = dropout_rate
        self.num_mc_samples = num_mc_samples
        self.ensemble_size = ensemble_size

        # Ensemble of networks
        self.ensemble = nn.ModuleList([
            self._create_network() for _ in range(ensemble_size)
        ])

        # Prediction heads for different types
        self.evolution_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, output_dim)
        )

        self.confidence_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid()
        )

        self.relationship_head = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
            nn.Sigmoid()
        )

        self.emergence_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid()
        )

    def _create_network(self) -> nn.Module:
        """Create a single network in the ensemble."""
        layers = []
        current_dim = self.input_dim

        for i in range(self.num_layers):
            layers.extend([
                nn.Linear(current_dim, self.hidden_dim),
                nn.ReLU(),
                MonteCarloDropout(self.dropout_rate)
            ])
            current_dim = self.hidden_dim

        return nn.Sequential(*layers)

    def forward(
        self,
        x: torch.Tensor,
        enable_uncertainty: bool = True,
        num_samples: Optional[int] = None
    ) -> Dict[str, torch.Tensor]:
        """
        Forward pass with optional uncertainty estimation.

        Args:
            x: Input features [batch_size, input_dim]
            enable_uncertainty: Whether to enable uncertainty estimation
            num_samples: Number of MC samples (uses default if None)

        Returns:
            Dictionary with predictions and uncertainty estimates
        """
        if num_samples is None:
            num_samples = self.num_mc_samples

        if enable_uncertainty and self.training:
            # Monte Carlo dropout sampling
            predictions = []
            confidence_predictions = []
            relationship_predictions = []
            emergence_predictions = []

            self.enable_mc_dropout()

            for _ in range(num_samples):
                ensemble_outputs = []
                ensemble_confidences = []
                ensemble_relationships = []
                ensemble_emergences = []

                for network in self.ensemble:
                    features = network(x)
                    evolution_pred = self.evolution_head(features)
                    confidence_pred = self.confidence_head(features)
                    emergence_pred = self.emergence_head(features)

                    ensemble_outputs.append(evolution_pred)
                    ensemble_confidences.append(confidence_pred)
                    ensemble_emergences.append(emergence_pred)

                # Average ensemble predictions for this sample
                avg_evolution = torch.stack(ensemble_outputs).mean(dim=0)
                avg_confidence = torch.stack(ensemble_confidences).mean(dim=0)
                avg_emergence = torch.stack(ensemble_emergences).mean(dim=0)

                predictions.append(avg_evolution)
                confidence_predictions.append(avg_confidence)
                emergence_predictions.append(avg_emergence)

            # Calculate statistics across MC samples
            predictions_tensor = torch.stack(predictions)
            confidence_tensor = torch.stack(confidence_predictions)
            emergence_tensor = torch.stack(emergence_predictions)

            # Mean predictions
            mean_evolution = predictions_tensor.mean(dim=0)
            mean_confidence = confidence_tensor.mean(dim=0)
            mean_emergence = emergence_tensor.mean(dim=0)

            # Uncertainty (variance) estimates
            evolution_uncertainty = predictions_tensor.var(dim=0)
            confidence_uncertainty = confidence_tensor.var(dim=0)
            emergence_uncertainty = emergence_tensor.var(dim=0)

            return {
                "evolution_prediction": mean_evolution,
                "confidence_prediction": mean_confidence,
                "emergence_prediction": mean_emergence,
                "evolution_uncertainty": evolution_uncertainty,
                "confidence_uncertainty": confidence_uncertainty,
                "emergence_uncertainty": emergence_uncertainty,
                "total_uncertainty": (evolution_uncertainty + confidence_uncertainty + emergence_uncertainty) / 3
            }
        else:
            # Standard deterministic prediction
            ensemble_outputs = []
            ensemble_confidences = []
            ensemble_relationships = []
            ensemble_emergences = []

            for network in self.ensemble:
                features = network(x)
                evolution_pred = self.evolution_head(features)
                confidence_pred = self.confidence_head(features)
                emergence_pred = self.emergence_head(features)

                ensemble_outputs.append(evolution_pred)
                ensemble_confidences.append(confidence_pred)
                ensemble_emergences.append(emergence_pred)

            # Average ensemble predictions
            mean_evolution = torch.stack(ensemble_outputs).mean(dim=0)
            mean_confidence = torch.stack(ensemble_confidences).mean(dim=0)
            mean_emergence = torch.stack(ensemble_emergences).mean(dim=0)

            return {
                "evolution_prediction": mean_evolution,
                "confidence_prediction": mean_confidence,
                "emergence_prediction": mean_emergence,
                "evolution_uncertainty": torch.zeros_like(mean_evolution),
                "confidence_uncertainty": torch.zeros_like(mean_confidence),
                "emergence_uncertainty": torch.zeros_like(mean_emergence),
                "total_uncertainty": torch.zeros_like(mean_evolution)
            }


class CognitiveThreadPredictor:
    """
    Advanced cognitive thread prediction system with uncertainty quantification.

    Features:
    - Multi-step ahead prediction (up to 20 steps)
    - Uncertainty quantification using Bayesian methods
    - Interactive query interface
    - Export capabilities (JSON, CSV, pickle)
    - Real-time prediction with caching
    - Calibration and validation metrics
    """

    def __init__(
        self,
        dgnn_model: CognitiveThreadDGNN,
        evolution_engine: GraphEvolutionEngine,
        device: Optional[str] = None,
        cache_size: int = PREDICTION_CACHE_SIZE,
        enable_calibration: bool = True
    ):
        self.dgnn_model = dgnn_model
        self.evolution_engine = evolution_engine
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.cache_size = cache_size
        self.enable_calibration = enable_calibration

        # Initialize Bayesian predictor
        self.bayesian_predictor = BayesianThreadPredictor(
            input_dim=dgnn_model.output_dim,
            hidden_dim=256,
            output_dim=128
        ).to(self.device)

        # Prediction cache
        self.prediction_cache: Dict[str, PredictionResult] = {}
        self.cache_timestamps: Dict[str, float] = {}

        # Query processing
        self.query_queue = asyncio.Queue()
        self.processing_active = False

        # Calibration data
        self.calibration_data: List[Dict[str, Any]] = []
        self.calibration_metrics = {
            "expected_calibration_error": 0.0,
            "reliability_score": 0.0,
            "coverage_probability": 0.0
        }

        # Performance metrics
        self.performance_metrics = {
            "total_predictions": 0,
            "successful_predictions": 0,
            "average_prediction_time": 0.0,
            "cache_hit_rate": 0.0,
            "average_confidence": 0.0,
            "average_uncertainty": 0.0
        }

        # Export configuration
        self.export_formats = ["json", "csv", "pickle", "tensorboard"]
        self.export_history: List[Dict[str, Any]] = []

        logger.info("Cognitive Thread Predictor initialized")

    async def start_prediction_service(self):
        """Start the prediction service."""
        if self.processing_active:
            logger.warning("Prediction service already running")
            return

        self.processing_active = True
        logger.info("Starting Cognitive Thread Prediction Service")

        # Start query processing loop
        processing_task = asyncio.create_task(self._process_prediction_queries())

        # Start cache cleanup
        cleanup_task = asyncio.create_task(self._cleanup_cache())

        return [processing_task, cleanup_task]

    async def stop_prediction_service(self):
        """Stop the prediction service."""
        logger.info("Stopping Cognitive Thread Prediction Service")
        self.processing_active = False

        # Wait for queue to empty
        while not self.query_queue.empty():
            await asyncio.sleep(0.01)

        logger.info("Cognitive Thread Prediction Service stopped")

    async def predict_thread_evolution(
        self,
        thread_ids: List[str],
        horizon: int = DEFAULT_HORIZON,
        include_uncertainty: bool = True,
        cache_key: Optional[str] = None
    ) -> PredictionResult:
        """
        Predict evolution of specific cognitive threads.

        Args:
            thread_ids: List of thread IDs to predict
            horizon: Prediction horizon (number of steps)
            include_uncertainty: Whether to include uncertainty estimates
            cache_key: Optional cache key for result caching

        Returns:
            PredictionResult with evolution predictions
        """
        start_time = time.time()

        # Check cache first
        if cache_key and cache_key in self.prediction_cache:
            cache_age = time.time() - self.cache_timestamps.get(cache_key, 0)
            if cache_age < 300:  # 5 minute cache validity
                logger.debug(f"Cache hit for prediction: {cache_key}")
                self.performance_metrics["cache_hit_rate"] = (
                    self.performance_metrics["cache_hit_rate"] * 0.9 + 0.1
                )
                return self.prediction_cache[cache_key]

        # Get current graph state
        current_state = self.evolution_engine.get_current_graph_state()

        # Filter threads of interest
        target_threads = [
            thread for thread_id, thread in current_state.nodes.items()
            if thread_id in thread_ids
        ]

        if not target_threads:
            raise ValueError(f"No threads found with IDs: {thread_ids}")

        # Generate base evolution prediction using DGNN
        evolution = self.dgnn_model.predict_thread_evolution(
            target_threads, horizon=horizon
        )

        # Prepare input for Bayesian predictor
        if len(evolution.evolution_trajectory) > 0:
            current_features = evolution.evolution_trajectory[0]
            if current_features.size(0) > 0:
                # Move to device
                current_features = current_features.to(self.device)

                # Get Bayesian predictions with uncertainty
                bayesian_predictions = self.bayesian_predictor(
                    current_features,
                    enable_uncertainty=include_uncertainty
                )

                # Quantify uncertainty
                uncertainty = self._quantify_uncertainty(bayesian_predictions)

                # Generate multi-step predictions
                multi_step_predictions = await self._generate_multi_step_predictions(
                    target_threads, horizon, bayesian_predictions
                )

                # Calculate confidence intervals
                confidence_intervals = self._calculate_confidence_intervals(
                    bayesian_predictions, confidence_level=0.95
                )
            else:
                # Handle empty case
                bayesian_predictions = {
                    "evolution_prediction": torch.empty(0, 128, device=self.device),
                    "confidence_prediction": torch.empty(0, device=self.device),
                    "total_uncertainty": torch.empty(0, device=self.device)
                }
                uncertainty = UncertaintyQuantification(
                    epistemic_uncertainty=1.0,
                    aleatoric_uncertainty=1.0,
                    total_uncertainty=1.0,
                    confidence_intervals={},
                    calibration_score=0.0,
                    prediction_coverage=0.0
                )
                multi_step_predictions = {}
                confidence_intervals = {}
        else:
            # Handle empty trajectory
            bayesian_predictions = {
                "evolution_prediction": torch.empty(0, 128, device=self.device),
                "confidence_prediction": torch.empty(0, device=self.device),
                "total_uncertainty": torch.empty(0, device=self.device)
            }
            uncertainty = UncertaintyQuantification(
                epistemic_uncertainty=1.0,
                aleatoric_uncertainty=1.0,
                total_uncertainty=1.0,
                confidence_intervals={},
                calibration_score=0.0,
                prediction_coverage=0.0
            )
            multi_step_predictions = {}
            confidence_intervals = {}

        # Create prediction result
        execution_time = time.time() - start_time
        query_id = str(uuid.uuid4())

        result = PredictionResult(
            query_id=query_id,
            prediction_type=PredictionType.THREAD_EVOLUTION,
            target_threads=thread_ids,
            horizon=horizon,
            predictions={
                "evolution": evolution,
                "bayesian_predictions": {
                    key: tensor.cpu().numpy() if isinstance(tensor, torch.Tensor) else tensor
                    for key, tensor in bayesian_predictions.items()
                },
                "multi_step_predictions": multi_step_predictions,
                "confidence_intervals": confidence_intervals
            },
            confidence_scores=bayesian_predictions["confidence_prediction"].cpu(),
            uncertainty_estimates=bayesian_predictions["total_uncertainty"].cpu(),
            execution_time=execution_time,
            model_version="1.0.0",
            metadata={
                "uncertainty_quantification": asdict(uncertainty),
                "num_threads": len(target_threads),
                "graph_state_size": len(current_state.nodes),
                "timestamp": time.time()
            }
        )

        # Cache result if cache key provided
        if cache_key:
            self._cache_prediction(cache_key, result)

        # Update performance metrics
        self._update_performance_metrics(result)

        # Add to calibration data if enabled
        if self.enable_calibration:
            self._add_calibration_data(result)

        logger.info(f"Generated evolution prediction for {len(thread_ids)} threads in {execution_time:.3f}s")

        return result

    async def predict_relationship_formation(
        self,
        thread_ids: List[str],
        horizon: int = DEFAULT_HORIZON,
        threshold: float = 0.5
    ) -> PredictionResult:
        """
        Predict formation of relationships between cognitive threads.

        Args:
            thread_ids: List of thread IDs to analyze
            horizon: Prediction horizon
            threshold: Confidence threshold for relationship prediction

        Returns:
            PredictionResult with relationship formation predictions
        """
        start_time = time.time()

        # Get current graph state
        current_state = self.evolution_engine.get_current_graph_state()

        # Get current and predicted adjacency matrices
        current_adjacency = current_state.adjacency_matrix

        # Predict future adjacency evolution
        target_threads = [
            thread for thread_id, thread in current_state.nodes.items()
            if thread_id in thread_ids
        ]

        if len(target_threads) >= 2:
            # Get thread features
            thread_features = []
            thread_id_to_idx = {}

            for idx, thread in enumerate(target_threads):
                thread_features.append(thread.features)
                thread_id_to_idx[thread.thread_id] = idx

            features_tensor = torch.stack(thread_features).to(self.device)

            # Predict relationship formation for all pairs
            relationship_predictions = {}
            confidence_scores = []

            for i, thread1 in enumerate(target_threads):
                for j, thread2 in enumerate(target_threads):
                    if i != j:
                        # Combine features for pair prediction
                        combined_features = torch.cat([
                            features_tensor[i], features_tensor[j]
                        ]).unsqueeze(0)

                        # Get relationship prediction
                        with torch.no_grad():
                            rel_score = self.bayesian_predictor.relationship_head(combined_features)
                            confidence = self.bayesian_predictor.confidence_head(features_tensor[i:i+1])

                        pair_key = f"{thread1.thread_id}->{thread2.thread_id}"
                        relationship_predictions[pair_key] = {
                            "current_strength": current_adjacency[i, j].item() if i < current_adjacency.size(0) and j < current_adjacency.size(1) else 0.0,
                            "predicted_strength": rel_score.item(),
                            "confidence": confidence.item(),
                            "will_form": rel_score.item() > threshold and confidence.item() > CONFIDENCE_THRESHOLD
                        }
                        confidence_scores.append(confidence.item())

            # Create uncertainty estimates
            avg_confidence = np.mean(confidence_scores) if confidence_scores else 0.0
            uncertainty_estimates = torch.full((len(target_threads),), 1.0 - avg_confidence)

        else:
            relationship_predictions = {}
            uncertainty_estimates = torch.empty(0)

        # Create result
        execution_time = time.time() - start_time
        query_id = str(uuid.uuid4())

        result = PredictionResult(
            query_id=query_id,
            prediction_type=PredictionType.RELATIONSHIP_FORMATION,
            target_threads=thread_ids,
            horizon=horizon,
            predictions={"relationships": relationship_predictions},
            confidence_scores=torch.tensor(confidence_scores) if confidence_scores else torch.empty(0),
            uncertainty_estimates=uncertainty_estimates,
            execution_time=execution_time,
            model_version="1.0.0",
            metadata={"threshold": threshold, "num_pairs": len(relationship_predictions)}
        )

        self._update_performance_metrics(result)

        return result

    async def detect_anomalies(
        self,
        thread_ids: List[str],
        anomaly_threshold: float = 2.0
    ) -> PredictionResult:
        """
        Detect anomalous patterns in cognitive thread evolution.

        Args:
            thread_ids: List of thread IDs to analyze
            anomaly_threshold: Threshold for anomaly detection (standard deviations)

        Returns:
            PredictionResult with anomaly detection results
        """
        start_time = time.time()

        # Get recent evolution history
        prediction_buffer = self.evolution_engine.prediction_buffer
        if len(prediction_buffer) < 3:
            # Not enough history for anomaly detection
            return PredictionResult(
                query_id=str(uuid.uuid4()),
                prediction_type=PredictionType.ANOMALY_DETECTION,
                target_threads=thread_ids,
                horizon=0,
                predictions={"anomalies": {}, "insufficient_data": True},
                confidence_scores=torch.empty(0),
                uncertainty_estimates=torch.empty(0),
                execution_time=time.time() - start_time,
                model_version="1.0.0",
                metadata={"error": "Insufficient historical data"}
            )

        # Analyze recent predictions for anomalies
        recent_predictions = list(prediction_buffer)[-5:]  # Last 5 predictions

        anomalies = {}
        confidence_scores = []
        uncertainty_estimates = []

        for thread_id in thread_ids:
            # Collect confidence scores over time for this thread
            thread_confidences = []
            thread_uncertainties = []

            for prediction_data in recent_predictions:
                evolution = prediction_data["evolution"]
                if hasattr(evolution, 'confidence_scores') and len(evolution.confidence_scores) > 0:
                    # Find confidence for this thread (simplified)
                    thread_confidences.append(evolution.prediction_confidence)
                    thread_uncertainties.append(1.0 - evolution.prediction_confidence)

            if len(thread_confidences) >= 3:
                # Calculate statistical properties
                mean_confidence = np.mean(thread_confidences)
                std_confidence = np.std(thread_confidences)
                mean_uncertainty = np.mean(thread_uncertainties)

                # Detect anomalies
                is_anomalous = False
                anomaly_type = None

                # Confidence drop anomaly
                if len(thread_confidences) >= 2:
                    confidence_drop = thread_confidences[-2] - thread_confidences[-1]
                    if confidence_drop > 0.3:  # 30% drop
                        is_anomalous = True
                        anomaly_type = "confidence_drop"

                # Uncertainty spike anomaly
                if len(thread_uncertainties) >= 2:
                    uncertainty_spike = thread_uncertainties[-1] - thread_uncertainties[-2]
                    if uncertainty_spike > 0.4:  # 40% increase
                        is_anomalous = True
                        anomaly_type = "uncertainty_spike"

                # Statistical outlier anomaly
                z_score = abs(thread_confidences[-1] - mean_confidence) / (std_confidence + 1e-8)
                if z_score > anomaly_threshold:
                    is_anomalous = True
                    anomaly_type = "statistical_outlier"

                anomalies[thread_id] = {
                    "is_anomalous": is_anomalous,
                    "anomaly_type": anomaly_type,
                    "current_confidence": thread_confidences[-1] if thread_confidences else 0.0,
                    "confidence_trend": thread_confidences,
                    "z_score": z_score if 'z_score' in locals() else 0.0,
                    "uncertainty_trend": thread_uncertainties
                }

                confidence_scores.append(thread_confidences[-1] if thread_confidences else 0.0)
                uncertainty_estimates.append(mean_uncertainty)
            else:
                anomalies[thread_id] = {
                    "is_anomalous": False,
                    "anomaly_type": None,
                    "insufficient_data": True
                }

        # Create result
        execution_time = time.time() - start_time
        query_id = str(uuid.uuid4())

        result = PredictionResult(
            query_id=query_id,
            prediction_type=PredictionType.ANOMALY_DETECTION,
            target_threads=thread_ids,
            horizon=0,
            predictions={"anomalies": anomalies},
            confidence_scores=torch.tensor(confidence_scores) if confidence_scores else torch.empty(0),
            uncertainty_estimates=torch.tensor(uncertainty_estimates) if uncertainty_estimates else torch.empty(0),
            execution_time=execution_time,
            model_version="1.0.0",
            metadata={"anomaly_threshold": anomaly_threshold, "num_anomalies": sum(1 for a in anomalies.values() if a.get("is_anomalous", False))}
        )

        self._update_performance_metrics(result)

        return result

    async def _process_prediction_queries(self):
        """Process prediction queries from the queue."""
        while self.processing_active:
            try:
                # Get query with timeout
                query = await asyncio.wait_for(self.query_queue.get(), timeout=0.1)

                # Process query based on type
                if query.query_type == PredictionType.THREAD_EVOLUTION:
                    result = await self.predict_thread_evolution(
                        query.target_threads,
                        query.horizon,
                        **query.parameters
                    )
                elif query.query_type == PredictionType.RELATIONSHIP_FORMATION:
                    result = await self.predict_relationship_formation(
                        query.target_threads,
                        query.horizon,
                        **query.parameters
                    )
                elif query.query_type == PredictionType.ANOMALY_DETECTION:
                    result = await self.detect_anomalies(
                        query.target_threads,
                        **query.parameters
                    )
                else:
                    logger.warning(f"Unknown query type: {query.query_type}")
                    continue

                # Call callback if provided
                if query.callback:
                    try:
                        await query.callback(result)
                    except Exception as e:
                        logger.error(f"Query callback failed: {e}")

            except asyncio.TimeoutError:
                continue  # No queries to process
            except Exception as e:
                logger.error(f"Error processing prediction query: {e}")

    async def _cleanup_cache(self):
        """Periodically clean up expired cache entries."""
        while self.processing_active:
            await asyncio.sleep(60)  # Cleanup every minute

            current_time = time.time()
            expired_keys = []

            for key, timestamp in self.cache_timestamps.items():
                if current_time - timestamp > 300:  # 5 minute expiration
                    expired_keys.append(key)

            for key in expired_keys:
                if key in self.prediction_cache:
                    del self.prediction_cache[key]
                if key in self.cache_timestamps:
                    del self.cache_timestamps[key]

            if expired_keys:
                logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")

    def _quantify_uncertainty(self, predictions: Dict[str, torch.Tensor]) -> UncertaintyQuantification:
        """Quantify different types of uncertainty in predictions."""
        # Epistemic uncertainty (model uncertainty)
        epistemic = predictions.get("evolution_uncertainty", torch.tensor(0.0)).mean().item()

        # Aleatoric uncertainty (data uncertainty)
        aleatoric = predictions.get("confidence_uncertainty", torch.tensor(0.0)).mean().item()

        # Total uncertainty
        total = predictions.get("total_uncertainty", torch.tensor(0.0)).mean().item()

        # Confidence intervals (simplified)
        confidence_intervals = {
            "evolution": (
                predictions["evolution_prediction"].mean().item() - 2 * total,
                predictions["evolution_prediction"].mean().item() + 2 * total
            ),
            "confidence": (
                max(0, predictions["confidence_prediction"].mean().item() - 2 * total),
                min(1, predictions["confidence_prediction"].mean().item() + 2 * total)
            )
        }

        # Calibration score (simplified)
        calibration_score = 1.0 - abs(predictions["confidence_prediction"].mean().item() - 0.8)

        # Prediction coverage
        coverage = min(1.0, predictions["confidence_prediction"].mean().item() + (1.0 - total))

        return UncertaintyQuantification(
            epistemic_uncertainty=epistemic,
            aleatoric_uncertainty=aleatoric,
            total_uncertainty=total,
            confidence_intervals=confidence_intervals,
            calibration_score=calibration_score,
            prediction_coverage=coverage
        )

    async def _generate_multi_step_predictions(
        self,
        threads: List[CognitiveThread],
        horizon: int,
        bayesian_predictions: Dict[str, torch.Tensor]
    ) -> Dict[str, Any]:
        """Generate multi-step ahead predictions."""
        multi_step = {}

        current_features = bayesian_predictions["evolution_prediction"]

        for step in range(1, horizon + 1):
            # Predict next step (simplified - in practice, this would be more sophisticated)
            step_prediction = self.bayesian_predictor(current_features, enable_uncertainty=False)
            step_confidence = self.bayesian_predictor.confidence_head(current_features)

            multi_step[f"step_{step}"] = {
                "features": step_prediction["evolution_prediction"].cpu().numpy(),
                "confidence": step_confidence.cpu().numpy(),
                "timestamp": time.time() + step * 5.0  # 5-second intervals
            }

            # Update features for next iteration
            current_features = step_prediction["evolution_prediction"]

        return multi_step

    def _calculate_confidence_intervals(
        self,
        predictions: Dict[str, torch.Tensor],
        confidence_level: float = 0.95
    ) -> Dict[str, Tuple[float, float]]:
        """Calculate confidence intervals for predictions."""
        # Z-score for confidence level
        z_scores = {0.90: 1.645, 0.95: 1.96, 0.99: 2.576}
        z = z_scores.get(confidence_level, 1.96)

        intervals = {}

        for key, tensor in predictions.items():
            if "uncertainty" in key and tensor.numel() > 0:
                mean = predictions.get(key.replace("_uncertainty", "_prediction"), torch.tensor(0.0)).mean().item()
                std = tensor.mean().item()

                intervals[key] = (
                    max(0, mean - z * std),
                    min(1, mean + z * std)
                )

        return intervals

    def _cache_prediction(self, cache_key: str, result: PredictionResult):
        """Cache a prediction result."""
        # Remove oldest entry if cache is full
        if len(self.prediction_cache) >= self.cache_size:
            oldest_key = min(self.cache_timestamps.keys(), key=lambda k: self.cache_timestamps[k])
            del self.prediction_cache[oldest_key]
            del self.cache_timestamps[oldest_key]

        # Add new entry
        self.prediction_cache[cache_key] = result
        self.cache_timestamps[cache_key] = time.time()

    def _update_performance_metrics(self, result: PredictionResult):
        """Update performance metrics based on prediction result."""
        self.performance_metrics["total_predictions"] += 1
        self.performance_metrics["successful_predictions"] += 1

        # Update average prediction time
        total = self.performance_metrics["total_predictions"]
        prev_avg = self.performance_metrics["average_prediction_time"]
        self.performance_metrics["average_prediction_time"] = (
            (prev_avg * (total - 1) + result.execution_time) / total
        )

        # Update average confidence
        if result.confidence_scores.numel() > 0:
            avg_conf = result.confidence_scores.mean().item()
            prev_avg_conf = self.performance_metrics["average_confidence"]
            self.performance_metrics["average_confidence"] = (
                (prev_avg_conf * (total - 1) + avg_conf) / total
            )

        # Update average uncertainty
        if result.uncertainty_estimates.numel() > 0:
            avg_uncertainty = result.uncertainty_estimates.mean().item()
            prev_avg_uncertainty = self.performance_metrics["average_uncertainty"]
            self.performance_metrics["average_uncertainty"] = (
                (prev_avg_uncertainty * (total - 1) + avg_uncertainty) / total
            )

    def _add_calibration_data(self, result: PredictionResult):
        """Add prediction result to calibration dataset."""
        calibration_entry = {
            "timestamp": time.time(),
            "confidence_scores": result.confidence_scores.cpu().numpy().tolist(),
            "uncertainty_estimates": result.uncertainty_estimates.cpu().numpy().tolist(),
            "prediction_type": result.prediction_type.value,
            "execution_time": result.execution_time
        }

        self.calibration_data.append(calibration_entry)

        # Keep only recent calibration data
        if len(self.calibration_data) > 1000:
            self.calibration_data = self.calibration_data[-1000:]

        # Update calibration metrics if we have enough data
        if len(self.calibration_data) >= MIN_SAMPLES_FOR_CALIBRATION:
            self._update_calibration_metrics()

    def _update_calibration_metrics(self):
        """Update calibration metrics based on collected data."""
        if not self.calibration_data:
            return

        # Calculate Expected Calibration Error (ECE)
        all_confidences = []
        all_uncertainties = []

        for entry in self.calibration_data:
            all_confidences.extend(entry["confidence_scores"])
            all_uncertainties.extend(entry["uncertainty_estimates"])

        if all_confidences:
            # Simplified ECE calculation
            mean_confidence = np.mean(all_confidences)
            mean_uncertainty = np.mean(all_uncertainties)

            # ECE is the difference between predicted confidence and actual reliability
            # Here we use uncertainty as a proxy for reliability
            ece = abs(mean_confidence - (1.0 - mean_uncertainty))

            self.calibration_metrics["expected_calibration_error"] = ece
            self.calibration_metrics["reliability_score"] = 1.0 - ece
            self.calibration_metrics["coverage_probability"] = mean_confidence

    def export_predictions(
        self,
        format: str = "json",
        filename: Optional[str] = None,
        include_metadata: bool = True
    ) -> str:
        """
        Export prediction history and results.

        Args:
            format: Export format ('json', 'csv', 'pickle', 'tensorboard')
            filename: Optional filename (auto-generated if None)
            include_metadata: Whether to include metadata

        Returns:
            Path to exported file
        """
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"cognitive_predictions_{timestamp}.{format}"

        # Prepare export data
        export_data = {
            "predictions": [
                {
                    "query_id": result.query_id,
                    "prediction_type": result.prediction_type.value,
                    "target_threads": result.target_threads,
                    "horizon": result.horizon,
                    "confidence_scores": result.confidence_scores.cpu().numpy().tolist(),
                    "uncertainty_estimates": result.uncertainty_estimates.cpu().numpy().tolist(),
                    "execution_time": result.execution_time,
                    "timestamp": result.metadata.get("timestamp", time.time())
                }
                for result in self.prediction_cache.values()
            ],
            "performance_metrics": self.performance_metrics,
            "calibration_metrics": self.calibration_metrics,
            "export_timestamp": datetime.now().isoformat()
        }

        if include_metadata:
            export_data["metadata"] = {
                "model_version": "1.0.0",
                "cache_size": len(self.prediction_cache),
                "total_calibration_points": len(self.calibration_data)
            }

        # Export based on format
        filepath = f"/tmp/{filename}"

        if format == "json":
            with open(filepath, 'w') as f:
                json.dump(export_data, f, indent=2, default=str)
        elif format == "csv":
            # Export predictions as CSV
            with open(filepath, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(["query_id", "prediction_type", "target_threads", "horizon",
                               "avg_confidence", "avg_uncertainty", "execution_time", "timestamp"])

                for result in self.prediction_cache.values():
                    avg_conf = result.confidence_scores.mean().item() if result.confidence_scores.numel() > 0 else 0.0
                    avg_unc = result.uncertainty_estimates.mean().item() if result.uncertainty_estimates.numel() > 0 else 0.0

                    writer.writerow([
                        result.query_id,
                        result.prediction_type.value,
                        ";".join(result.target_threads),
                        result.horizon,
                        avg_conf,
                        avg_unc,
                        result.execution_time,
                        result.metadata.get("timestamp", time.time())
                    ])
        elif format == "pickle":
            with open(filepath, 'wb') as f:
                pickle.dump(export_data, f)
        else:
            raise ValueError(f"Unsupported export format: {format}")

        # Record export
        self.export_history.append({
            "filename": filename,
            "format": format,
            "filepath": filepath,
            "timestamp": time.time(),
            "num_predictions": len(self.prediction_cache)
        })

        logger.info(f"Exported predictions to {filepath}")
        return filepath

    def get_performance_metrics(self) -> Dict[str, Any]:
        """Get comprehensive performance metrics."""
        return {
            **self.performance_metrics,
            "calibration_metrics": self.calibration_metrics,
            "cache_size": len(self.prediction_cache),
            "calibration_data_size": len(self.calibration_data),
            "export_history_size": len(self.export_history)
        }

    def validate_performance_targets(self) -> Dict[str, bool]:
        """Validate if performance targets are met."""
        metrics = self.get_performance_metrics()

        return {
            "prediction_speed_target_met": metrics["average_prediction_time"] < 0.1,  # < 100ms
            "confidence_target_met": metrics["average_confidence"] >= CONFIDENCE_THRESHOLD,
            "uncertainty_acceptable": metrics["average_uncertainty"] <= UNCERTAINTY_THRESHOLD,
            "cache_efficient": metrics["cache_hit_rate"] >= 0.3,  # 30% cache hit rate
            "calibration_acceptable": metrics["calibration_metrics"]["expected_calibration_error"] <= 0.1
        }


# Integration utilities
async def create_integrated_predictor(
    decomposer,
    neo4j_uri: str = "bolt://localhost:7687",
    neo4j_user: str = "neo4j",
    neo4j_password: str = "password"
) -> Tuple[CognitiveThreadPredictor, GraphEvolutionEngine]:
    """
    Create an integrated prediction system from a cognitive decomposer.

    Args:
        decomposer: CognitiveDecomposer instance
        neo4j_uri: Neo4j database URI
        neo4j_user: Neo4j username
        neo4j_password: Neo4j password

    Returns:
        Tuple of (CognitiveThreadPredictor, GraphEvolutionEngine)
    """
    from .graph_evolution import create_evolution_engine_from_decomposer

    # Create evolution engine
    evolution_engine = await create_evolution_engine_from_decomposer(
        decomposer, neo4j_uri, neo4j_user, neo4j_password
    )

    # Create DGNN model
    dgnn_model = CognitiveThreadDGNN(
        input_dim=512,
        hidden_dim=256,
        output_dim=128
    )

    # Create predictor
    predictor = CognitiveThreadPredictor(
        dgnn_model=dgnn_model,
        evolution_engine=evolution_engine
    )

    return predictor, evolution_engine


if __name__ == "__main__":
    # Example usage
    import asyncio

    async def test_thread_predictor():
        logger.info("Testing Cognitive Thread Predictor")

        # Create mock components
        dgnn_model = CognitiveThreadDGNN(
            input_dim=512,
            hidden_dim=256,
            output_dim=128
        )

        from .graph_evolution import GraphEvolutionEngine
        evolution_engine = GraphEvolutionEngine(
            dgnn_model=dgnn_model,
            enable_persistence=False
        )

        # Create predictor
        predictor = CognitiveThreadPredictor(
            dgnn_model=dgnn_model,
            evolution_engine=evolution_engine
        )

        # Start services
        predictor_tasks = await predictor.start_prediction_service()
        engine_tasks = await evolution_engine.start_evolution_engine()

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

        # Add threads to evolution engine
        for thread in test_threads:
            await evolution_engine.add_cognitive_thread(thread)

        # Wait a bit for processing
        await asyncio.sleep(1.0)

        # Test evolution prediction
        evolution_result = await predictor.predict_thread_evolution(
            ["test_1", "test_2"],
            horizon=3,
            cache_key="test_prediction"
        )
        logger.info(f"Evolution prediction completed in {evolution_result.execution_time:.3f}s")

        # Test relationship prediction
        relationship_result = await predictor.predict_relationship_formation(
            ["test_1", "test_2"],
            horizon=3
        )
        logger.info(f"Relationship prediction completed in {relationship_result.execution_time:.3f}s")

        # Test anomaly detection
        anomaly_result = await predictor.detect_anomalies(
            ["test_1", "test_2"],
            anomaly_threshold=2.0
        )
        logger.info(f"Anomaly detection completed in {anomaly_result.execution_time:.3f}s")

        # Get performance metrics
        metrics = predictor.get_performance_metrics()
        logger.info(f"Predictor metrics: {metrics}")

        # Validate performance
        validation = predictor.validate_performance_targets()
        logger.info(f"Performance validation: {validation}")

        # Export predictions
        export_path = predictor.export_predictions("json", "test_predictions.json")
        logger.info(f"Exported predictions to {export_path}")

        # Stop services
        await predictor.stop_prediction_service()
        await evolution_engine.stop_evolution_engine()

        # Cancel tasks
        for task in predictor_tasks + engine_tasks:
            task.cancel()

        logger.info("Cognitive Thread Predictor test completed")

    # Run test
    asyncio.run(test_thread_predictor())