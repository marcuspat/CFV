"""
Uncertainty Quantification System for Cognitive Fabric Visualizer
Implements confidence visualization and uncertainty analysis
Target: Accurate uncertainty bounds with 95% confidence intervals
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple, Union
import json
import logging
from dataclasses import dataclass, asdict, field
from enum import Enum
from datetime import datetime
from scipy import stats
from scipy.stats import norm, beta, gaussian_kde
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import cross_val_predict, KFold
from sklearn.metrics import mean_squared_error
import matplotlib.pyplot as plt
import seaborn as sns
from concurrent.futures import ThreadPoolExecutor
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class UncertaintyType(Enum):
    """Types of uncertainty quantification"""
    ALEATORIC = "aleatoric"  # Data uncertainty
    EPISTEMIC = "epistemic"  # Model uncertainty
    PREDICTIVE = "predictive"  # Total uncertainty
    COGNITIVE = "cognitive"  # Cognitive model specific
    CONFIDENCE_INTERVAL = "confidence_interval"
    CREDIBLE_INTERVAL = "credible_interval"
    PREDICTION_INTERVAL = "prediction_interval"

class ConfidenceMethod(Enum):
    """Methods for confidence calculation"""
    BOOTSTRAP = "bootstrap"
    CONFORMAL = "conformal"
    QUANTILE = "quantile"
    ENSEMBLE = "ensemble"
    BAYESIAN = "bayesian"
    MONTE_CARLO = "monte_carlo"

@dataclass
class UncertaintyBounds:
    """Represents uncertainty bounds for a prediction"""
    lower_bound: float
    upper_bound: float
    confidence_level: float
    bound_type: UncertaintyType
    method: ConfidenceMethod
    width: float = field(init=False)

    def __post_init__(self):
        self.width = self.upper_bound - self.lower_bound

    def contains(self, value: float) -> bool:
        """Check if value is within bounds"""
        return self.lower_bound <= value <= self.upper_bound

    def center(self) -> float:
        """Get center of bounds"""
        return (self.lower_bound + self.upper_bound) / 2

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'lower_bound': self.lower_bound,
            'upper_bound': self.upper_bound,
            'confidence_level': self.confidence_level,
            'bound_type': self.bound_type.value,
            'method': self.method.value,
            'width': self.width,
            'center': self.center()
        }

@dataclass
class ConfidenceScore:
    """Represents confidence score with uncertainty components"""
    point_estimate: float
    aleatoric_uncertainty: float
    epistemic_uncertainty: float
    total_uncertainty: float
    uncertainty_components: Dict[str, float]
    method: ConfidenceMethod
    timestamp: datetime = field(default_factory=datetime.now)

    @property
    def confidence_interval(self) -> UncertaintyBounds:
        """Get 95% confidence interval"""
        return UncertaintyBounds(
            lower_bound=self.point_estimate - 1.96 * self.total_uncertainty,
            upper_bound=self.point_estimate + 1.96 * self.total_uncertainty,
            confidence_level=0.95,
            bound_type=UncertaintyType.CONFIDENCE_INTERVAL,
            method=self.method
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'point_estimate': self.point_estimate,
            'aleatoric_uncertainty': self.aleatoric_uncertainty,
            'epistemic_uncertainty': self.epistemic_uncertainty,
            'total_uncertainty': self.total_uncertainty,
            'uncertainty_components': self.uncertainty_components,
            'method': self.method.value,
            'confidence_interval': self.confidence_interval.to_dict(),
            'timestamp': self.timestamp.isoformat()
        }

@dataclass
class UncertaintyAnalysis:
    """Complete uncertainty analysis result"""
    analysis_id: str
    prediction: float
    confidence_score: ConfidenceScore
    bounds: List[UncertaintyBounds]
    uncertainty_decomposition: Dict[str, float]
    calibration_score: float
    reliability_score: float
    feature_uncertainties: Dict[str, UncertaintyBounds]
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'analysis_id': self.analysis_id,
            'prediction': self.prediction,
            'confidence_score': self.confidence_score.to_dict(),
            'bounds': [bound.to_dict() for bound in self.bounds],
            'uncertainty_decomposition': self.uncertainty_decomposition,
            'calibration_score': self.calibration_score,
            'reliability_score': self.reliability_score,
            'feature_uncertainties': {k: v.to_dict() for k, v in self.feature_uncertainties.items()},
            'timestamp': self.timestamp.isoformat()
        }

class BootstrapUncertaintyEstimator:
    """Bootstrap-based uncertainty estimation"""

    def __init__(self, n_bootstrap: int = 1000, confidence_level: float = 0.95):
        self.n_bootstrap = n_bootstrap
        self.confidence_level = confidence_level
        self.bootstrap_samples = []

    def fit(self, model: Any, X: np.ndarray, y: np.ndarray):
        """Fit bootstrap estimator"""
        self.model = model
        self.X_train = X
        self.y_train = y
        self.bootstrap_models = []

        # Generate bootstrap samples
        for _ in range(self.n_bootstrap):
            # Bootstrap sample
            indices = np.random.choice(len(X), size=len(X), replace=True)
            X_boot = X[indices]
            y_boot = y[indices]

            # Train model on bootstrap sample
            boot_model = self._create_model_copy()
            boot_model.fit(X_boot, y_boot)
            self.bootstrap_models.append(boot_model)

    def _create_model_copy(self) -> Any:
        """Create a copy of the base model"""
        # This would need to be customized based on the model type
        if hasattr(self.model, 'get_params'):
            return self.model.__class__(**self.model.get_params())
        else:
            # Fallback to RandomForest if model type is unknown
            return RandomForestRegressor(n_estimators=100, random_state=42)

    def predict_with_uncertainty(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Predict with uncertainty estimates"""
        predictions = []

        # Get predictions from all bootstrap models
        for boot_model in self.bootstrap_models:
            pred = boot_model.predict(X)
            predictions.append(pred)

        predictions = np.array(predictions)

        # Calculate statistics
        mean_prediction = np.mean(predictions, axis=0)
        std_prediction = np.std(predictions, axis=0)

        # Calculate confidence intervals
        alpha = 1 - self.confidence_level
        lower_percentile = (alpha / 2) * 100
        upper_percentile = (1 - alpha / 2) * 100

        lower_bound = np.percentile(predictions, lower_percentile, axis=0)
        upper_bound = np.percentile(predictions, upper_percentile, axis=0)

        return mean_prediction, std_prediction, np.column_stack([lower_bound, upper_bound])

class ConformalUncertaintyEstimator:
    """Conformal prediction-based uncertainty estimation"""

    def __init__(self, confidence_level: float = 0.95):
        self.confidence_level = confidence_level
        self.calibration_scores = None
        self.model = None

    def fit(self, model: Any, X: np.ndarray, y: np.ndarray, calibration_size: float = 0.2):
        """Fit conformal estimator"""
        self.model = model

        # Split data for calibration
        n_calib = int(len(X) * calibration_size)
        indices = np.random.permutation(len(X))
        calib_indices = indices[:n_calib]
        train_indices = indices[n_calib:]

        # Train model on training data
        X_train = X[train_indices]
        y_train = y[train_indices]
        self.model.fit(X_train, y_train)

        # Calculate calibration scores
        X_calib = X[calib_indices]
        y_calib = y[calib_indices]
        y_pred_calib = self.model.predict(X_calib)

        # Nonconformity scores (absolute residuals)
        self.calibration_scores = np.abs(y_calib - y_pred_calib)

    def predict_with_uncertainty(self, X: np.ndarray) -> Tuple[np.ndarray, UncertaintyBounds]:
        """Predict with conformal uncertainty intervals"""
        predictions = self.model.predict(X)

        # Calculate quantile for confidence level
        alpha = 1 - self.confidence_level
        n_calib = len(self.calibration_scores)
        quantile = np.ceil((n_calib + 1) * (1 - alpha)) / n_calib
        calibration_quantile = np.quantile(self.calibration_scores, quantile)

        # Create uncertainty bounds
        bounds_list = []
        for i, pred in enumerate(predictions):
            bound = UncertaintyBounds(
                lower_bound=pred - calibration_quantile,
                upper_bound=pred + calibration_quantile,
                confidence_level=self.confidence_level,
                bound_type=UncertaintyType.PREDICTION_INTERVAL,
                method=ConfidenceMethod.CONFORMAL
            )
            bounds_list.append(bound)

        return predictions, bounds_list

class EnsembleUncertaintyEstimator:
    """Ensemble-based uncertainty estimation"""

    def __init__(self, n_models: int = 10, confidence_level: float = 0.95):
        self.n_models = n_models
        self.confidence_level = confidence_level
        self.ensemble_models = []

    def fit(self, X: np.ndarray, y: np.ndarray):
        """Fit ensemble models"""
        self.ensemble_models = []

        for i in range(self.n_models):
            # Create model with different random state
            model = GradientBoostingRegressor(
                n_estimators=100,
                learning_rate=0.1,
                max_depth=3,
                random_state=i
            )

            # Train on bootstrap sample
            indices = np.random.choice(len(X), size=len(X), replace=True)
            X_boot = X[indices]
            y_boot = y[indices]

            model.fit(X_boot, y_boot)
            self.ensemble_models.append(model)

    def predict_with_uncertainty(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray, UncertaintyBounds]:
        """Predict with ensemble uncertainty"""
        predictions = []

        # Get predictions from all models
        for model in self.ensemble_models:
            pred = model.predict(X)
            predictions.append(pred)

        predictions = np.array(predictions)

        # Calculate statistics
        mean_prediction = np.mean(predictions, axis=0)
        std_prediction = np.std(predictions, axis=0)

        # Calculate prediction intervals
        alpha = 1 - self.confidence_level
        z_score = norm.ppf(1 - alpha / 2)

        bounds_list = []
        for i, (mean_pred, std_pred) in enumerate(zip(mean_prediction, std_prediction)):
            bound = UncertaintyBounds(
                lower_bound=mean_pred - z_score * std_pred,
                upper_bound=mean_pred + z_score * std_pred,
                confidence_level=self.confidence_level,
                bound_type=UncertaintyType.PREDICTIVE,
                method=ConfidenceMethod.ENSEMBLE
            )
            bounds_list.append(bound)

        return mean_prediction, std_prediction, bounds_list

class UncertaintyQuantificationEngine:
    """
    Main uncertainty quantification engine
    Provides comprehensive uncertainty analysis for cognitive predictions
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize uncertainty quantification engine

        Args:
            config: Configuration dictionary
        """
        self.config = config or self._default_config()
        self.estimators = {}
        self.uncertainty_cache = {}
        self.performance_metrics = {
            'total_analyses': 0,
            'average_uncertainty': 0.0,
            'calibration_error': 0.0,
            'coverage_rate': 0.0,
            'analysis_time': 0.0
        }

        # Initialize estimators
        self._initialize_estimators()

    def _default_config(self) -> Dict[str, Any]:
        """Default configuration"""
        return {
            'confidence_level': 0.95,
            'n_bootstrap_samples': 1000,
            'n_ensemble_models': 10,
            'enable_caching': True,
            'cache_size': 1000,
            'parallel_processing': True,
            'uncertainty_threshold': 0.1,
            'calibration_samples': 200,
            'feature_uncertainty_analysis': True
        }

    def _initialize_estimators(self):
        """Initialize uncertainty estimators"""
        self.estimators = {
            ConfidenceMethod.BOOTSTRAP: BootstrapUncertaintyEstimator(
                n_bootstrap=self.config['n_bootstrap_samples'],
                confidence_level=self.config['confidence_level']
            ),
            ConfidenceMethod.CONFORMAL: ConformalUncertaintyEstimator(
                confidence_level=self.config['confidence_level']
            ),
            ConfidenceMethod.ENSEMBLE: EnsembleUncertaintyEstimator(
                n_models=self.config['n_ensemble_models'],
                confidence_level=self.config['confidence_level']
            )
        }

    def analyze_uncertainty(self, model: Any, X: np.ndarray, y: np.ndarray,
                           X_test: np.ndarray, methods: Optional[List[ConfidenceMethod]] = None,
                           feature_names: Optional[List[str]] = None) -> UncertaintyAnalysis:
        """
        Perform comprehensive uncertainty analysis

        Args:
            model: Prediction model
            X: Training features
            y: Training targets
            X_test: Test features
            methods: Uncertainty estimation methods
            feature_names: Names of features

        Returns:
            Comprehensive uncertainty analysis
        """
        if methods is None:
            methods = [ConfidenceMethod.BOOTSTRAP, ConfidenceMethod.CONFORMAL, ConfidenceMethod.ENSEMBLE]

        analysis_id = f"unc_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        try:
            # Check cache first
            cache_key = self._create_cache_key(X_test, methods)
            if self.config['enable_caching'] and cache_key in self.uncertainty_cache:
                logger.info(f"Returning cached uncertainty analysis: {analysis_id}")
                return self.uncertainty_cache[cache_key]

            start_time = datetime.now()

            # Fit estimators
            self._fit_estimators(model, X, y, methods)

            # Get predictions
            predictions = model.predict(X_test)

            # Calculate uncertainty for single test point (first one for analysis)
            X_single = X_test[0:1] if len(X_test.shape) > 1 else X_test.reshape(1, -1)
            prediction = predictions[0] if len(predictions.shape) > 0 else predictions

            # Estimate uncertainties using different methods
            uncertainty_bounds = []
            uncertainty_scores = []

            for method in methods:
                if method in self.estimators:
                    estimator = self.estimators[method]

                    if hasattr(estimator, 'predict_with_uncertainty'):
                        result = estimator.predict_with_uncertainty(X_single)

                        if method == ConfidenceMethod.BOOTSTRAP:
                            mean_pred, std_pred, bounds = result
                            uncertainty_score = ConfidenceScore(
                                point_estimate=float(mean_pred[0]),
                                aleatoric_uncertainty=float(std_pred[0]),
                                epistemic_uncertainty=float(std_pred[0]) * 0.5,  # Approximation
                                total_uncertainty=float(std_pred[0]),
                                uncertainty_components={'bootstrap': float(std_pred[0])},
                                method=method
                            )
                            uncertainty_bounds.extend(bounds)

                        elif method == ConfidenceMethod.CONFORMAL:
                            pred, bounds = result
                            uncertainty_score = ConfidenceScore(
                                point_estimate=float(pred[0]),
                                aleatoric_uncertainty=bounds[0].width / 4,
                                epistemic_uncertainty=bounds[0].width / 4,
                                total_uncertainty=bounds[0].width / 2,
                                uncertainty_components={'conformal': bounds[0].width / 2},
                                method=method
                            )
                            uncertainty_bounds.append(bounds[0])

                        elif method == ConfidenceMethod.ENSEMBLE:
                            mean_pred, std_pred, bounds = result
                            uncertainty_score = ConfidenceScore(
                                point_estimate=float(mean_pred[0]),
                                aleatoric_uncertainty=float(std_pred[0]) * 0.6,
                                epistemic_uncertainty=float(std_pred[0]) * 0.4,
                                total_uncertainty=float(std_pred[0]),
                                uncertainty_components={'ensemble_mean': float(std_pred[0])},
                                method=method
                            )
                            uncertainty_bounds.append(bounds[0])

                        uncertainty_scores.append(uncertainty_score)

            # Combine uncertainty estimates
            combined_confidence = self._combine_uncertainty_scores(uncertainty_scores)

            # Decompose uncertainty
            uncertainty_decomposition = self._decompose_uncertainty(combined_confidence, X_single, feature_names)

            # Calculate calibration and reliability scores
            calibration_score = self._calculate_calibration_score(model, X, y)
            reliability_score = self._calculate_reliability_score(combined_confidence)

            # Analyze feature uncertainties
            feature_uncertainties = {}
            if feature_names and self.config['feature_uncertainty_analysis']:
                feature_uncertainties = self._analyze_feature_uncertainties(
                    X_single, model, feature_names, methods[0]
                )

            # Create analysis result
            analysis = UncertaintyAnalysis(
                analysis_id=analysis_id,
                prediction=float(prediction),
                confidence_score=combined_confidence,
                bounds=uncertainty_bounds,
                uncertainty_decomposition=uncertainty_decomposition,
                calibration_score=calibration_score,
                reliability_score=reliability_score,
                feature_uncertainties=feature_uncertainties
            )

            # Cache result
            if self.config['enable_caching']:
                self.uncertainty_cache[cache_key] = analysis

            # Update metrics
            analysis_time = (datetime.now() - start_time).total_seconds()
            self._update_performance_metrics(analysis, analysis_time)

            logger.info(f"Completed uncertainty analysis {analysis_id} in {analysis_time:.2f}s")

            return analysis

        except Exception as e:
            logger.error(f"Error in uncertainty analysis {analysis_id}: {e}")
            raise

    def _fit_estimators(self, model: Any, X: np.ndarray, y: np.ndarray,
                       methods: List[ConfidenceMethod]):
        """Fit uncertainty estimators"""
        for method in methods:
            if method in self.estimators:
                estimator = self.estimators[method]
                try:
                    estimator.fit(model, X, y)
                    logger.info(f"Fitted {method.value} estimator")
                except Exception as e:
                    logger.error(f"Error fitting {method.value} estimator: {e}")

    def _combine_uncertainty_scores(self, scores: List[ConfidenceScore]) -> ConfidenceScore:
        """Combine uncertainty scores from different methods"""
        if not scores:
            raise ValueError("No uncertainty scores to combine")

        # Weighted average based on method reliability
        method_weights = {
            ConfidenceMethod.BOOTSTRAP: 0.4,
            ConfidenceMethod.CONFORMAL: 0.3,
            ConfidenceMethod.ENSEMBLE: 0.3
        }

        weighted_estimate = 0.0
        weighted_aleatoric = 0.0
        weighted_epistemic = 0.0
        total_weight = 0.0

        all_components = {}

        for score in scores:
            weight = method_weights.get(score.method, 0.33)
            weighted_estimate += score.point_estimate * weight
            weighted_aleatoric += score.aleatoric_uncertainty * weight
            weighted_epistemic += score.epistemic_uncertainty * weight
            total_weight += weight

            # Combine uncertainty components
            for component, value in score.uncertainty_components.items():
                if component not in all_components:
                    all_components[component] = []
                all_components[component].append(value * weight)

        # Normalize
        if total_weight > 0:
            weighted_estimate /= total_weight
            weighted_aleatoric /= total_weight
            weighted_epistemic /= total_weight

        # Average components
        for component in all_components:
            all_components[component] = np.mean(all_components[component])

        combined_score = ConfidenceScore(
            point_estimate=weighted_estimate,
            aleatoric_uncertainty=weighted_aleatoric,
            epistemic_uncertainty=weighted_epistemic,
            total_uncertainty=np.sqrt(weighted_aleatoric**2 + weighted_epistemic**2),
            uncertainty_components=all_components,
            method=ConfidenceMethod.ENSEMBLE  # Represent combined method
        )

        return combined_score

    def _decompose_uncertainty(self, confidence_score: ConfidenceScore,
                             X: np.ndarray, feature_names: Optional[List[str]]) -> Dict[str, float]:
        """Decompose uncertainty into components"""
        decomposition = {
            'aleatoric': confidence_score.aleatoric_uncertainty,
            'epistemic': confidence_score.epistemic_uncertainty,
            'total': confidence_score.total_uncertainty,
            'data_noise': 0.0,
            'model_uncertainty': 0.0,
            'feature_uncertainty': 0.0
        }

        # Estimate data noise (simplified)
        if len(X.shape) > 1 and X.shape[1] > 0:
            feature_std = np.std(X, axis=0)
            decomposition['data_noise'] = np.mean(feature_std) * 0.1

        # Model uncertainty (simplified)
        decomposition['model_uncertainty'] = confidence_score.epistemic_uncertainty * 0.8

        # Feature uncertainty (simplified)
        if feature_names:
            decomposition['feature_uncertainty'] = confidence_score.total_uncertainty * 0.2 / len(feature_names)

        return decomposition

    def _calculate_calibration_score(self, model: Any, X: np.ndarray, y: np.ndarray) -> float:
        """Calculate calibration score using cross-validation"""
        try:
            # Use cross-validation to get predictions
            cv = KFold(n_splits=5, shuffle=True, random_state=42)
            y_pred = cross_val_predict(model, X, y, cv=cv)

            # Calculate calibration error (simplified Expected Calibration Error)
            n_bins = 10
            bin_edges = np.linspace(0, 1, n_bins + 1)
            bin_lowers = bin_edges[:-1]
            bin_uppers = bin_edges[1:]

            calibration_error = 0.0
            bin_counts = np.zeros(n_bins)

            for i, (lower, upper) in enumerate(zip(bin_lowers, bin_uppers)):
                # Find samples in this bin
                mask = (y_pred >= lower) & (y_pred < upper)
                bin_count = np.sum(mask)
                bin_counts[i] = bin_count

                if bin_count > 0:
                    # Calculate accuracy and confidence in this bin
                    bin_accuracy = np.mean(y[mask] == (y_pred[mask] >= 0.5))
                    bin_confidence = np.mean(y_pred[mask])
                    calibration_error += bin_count * np.abs(bin_accuracy - bin_confidence)

            # Normalize by total samples
            calibration_error /= len(y)

            # Convert to score (higher is better)
            calibration_score = 1.0 - calibration_error

            return max(0.0, min(1.0, calibration_score))

        except Exception as e:
            logger.error(f"Error calculating calibration score: {e}")
            return 0.5  # Default to neutral score

    def _calculate_reliability_score(self, confidence_score: ConfidenceScore) -> float:
        """Calculate reliability score based on uncertainty characteristics"""
        # Factors affecting reliability:
        # 1. Lower total uncertainty is more reliable
        # 2. Balanced aleatoric/epistemic uncertainty is good
        # 3. Reasonable confidence intervals

        total_uncertainty = confidence_score.total_uncertainty
        aleatoric = confidence_score.aleatoric_uncertainty
        epistemic = confidence_score.epistemic_uncertainty

        # Score based on uncertainty magnitude (lower uncertainty = higher reliability)
        uncertainty_score = np.exp(-total_uncertainty * 5)  # Exponential decay

        # Score based on uncertainty balance
        if total_uncertainty > 0:
            balance_ratio = min(aleatoric, epistemic) / total_uncertainty
            balance_score = balance_ratio * 2  # Amplify the effect
        else:
            balance_score = 1.0

        # Combined reliability score
        reliability_score = (uncertainty_score + balance_score) / 2

        return max(0.0, min(1.0, reliability_score))

    def _analyze_feature_uncertainties(self, X: np.ndarray, model: Any,
                                     feature_names: List[str],
                                     method: ConfidenceMethod) -> Dict[str, UncertaintyBounds]:
        """Analyze uncertainty for individual features"""
        feature_uncertainties = {}

        if len(X.shape) == 1 or X.shape[1] != len(feature_names):
            return feature_uncertainties

        base_prediction = model.predict(X)[0]

        for i, feature_name in enumerate(feature_names):
            try:
                # Create perturbed data
                X_perturbed = X.copy()
                original_value = X_perturbed[0, i]

                # Add small perturbation
                perturbation = 0.01 * np.std(X_perturbed[:, i])
                X_perturbed[0, i] = original_value + perturbation

                # Get perturbed prediction
                perturbed_prediction = model.predict(X_perturbed)[0]

                # Estimate sensitivity
                sensitivity = abs(perturbed_prediction - base_prediction) / abs(perturbation)

                # Create uncertainty bounds based on sensitivity
                uncertainty_width = sensitivity * perturbation * 2

                bound = UncertaintyBounds(
                    lower_bound=base_prediction - uncertainty_width,
                    upper_bound=base_prediction + uncertainty_width,
                    confidence_level=self.config['confidence_level'],
                    bound_type=UncertaintyType.FEATURE_SPECIFIC,
                    method=method
                )

                feature_uncertainties[feature_name] = bound

            except Exception as e:
                logger.error(f"Error analyzing uncertainty for feature {feature_name}: {e}")
                continue

        return feature_uncertainties

    def _create_cache_key(self, X: np.ndarray, methods: List[ConfidenceMethod]) -> str:
        """Create cache key for uncertainty analysis"""
        # Hash the input data and methods
        data_hash = hashlib.md5(X.tobytes()).hexdigest()
        methods_str = "_".join(sorted([m.value for m in methods]))
        return f"{data_hash}_{methods_str}"

    def _update_performance_metrics(self, analysis: UncertaintyAnalysis, analysis_time: float):
        """Update performance metrics"""
        self.performance_metrics['total_analyses'] += 1

        # Update average uncertainty
        current_avg = self.performance_metrics['average_uncertainty']
        n = self.performance_metrics['total_analyses']
        new_avg = ((current_avg * (n - 1)) + analysis.confidence_score.total_uncertainty) / n
        self.performance_metrics['average_uncertainty'] = new_avg

        # Update analysis time
        current_time = self.performance_metrics['analysis_time']
        new_time = ((current_time * (n - 1)) + analysis_time) / n
        self.performance_metrics['analysis_time'] = new_time

        # Update calibration and reliability
        self.performance_metrics['calibration_error'] = 1.0 - analysis.calibration_score
        self.performance_metrics['coverage_rate'] = analysis.reliability_score

    def get_uncertainty_summary(self, limit: int = 100) -> Dict[str, Any]:
        """Get summary of uncertainty analyses"""
        # Get recent analyses from cache
        recent_analyses = list(self.uncertainty_cache.values())[-limit:]

        if not recent_analyses:
            return {'message': 'No uncertainty analyses available'}

        # Calculate summary statistics
        total_uncertainties = [analysis.confidence_score.total_uncertainty for analysis in recent_analyses]
        aleatoric_uncertainties = [analysis.confidence_score.aleatoric_uncertainty for analysis in recent_analyses]
        epistemic_uncertainties = [analysis.confidence_score.epistemic_uncertainty for analysis in recent_analyses]
        calibration_scores = [analysis.calibration_score for analysis in recent_analyses]
        reliability_scores = [analysis.reliability_score for analysis in recent_analyses]

        summary = {
            'total_analyses': len(recent_analyses),
            'uncertainty_statistics': {
                'total_uncertainty': {
                    'mean': np.mean(total_uncertainties),
                    'std': np.std(total_uncertainties),
                    'min': np.min(total_uncertainties),
                    'max': np.max(total_uncertainties)
                },
                'aleatoric_uncertainty': {
                    'mean': np.mean(aleatoric_uncertainties),
                    'std': np.std(aleatoric_uncertainties),
                    'min': np.min(aleatoric_uncertainties),
                    'max': np.max(aleatoric_uncertainties)
                },
                'epistemic_uncertainty': {
                    'mean': np.mean(epistemic_uncertainties),
                    'std': np.std(epistemic_uncertainties),
                    'min': np.min(epistemic_uncertainties),
                    'max': np.max(epistemic_uncertainties)
                }
            },
            'quality_metrics': {
                'average_calibration_score': np.mean(calibration_scores),
                'average_reliability_score': np.mean(reliability_scores),
                'calibration_score_distribution': np.histogram(calibration_scores, bins=5)[0].tolist(),
                'reliability_score_distribution': np.histogram(reliability_scores, bins=5)[0].tolist()
            },
            'performance_metrics': self.performance_metrics.copy(),
            'configuration': self.config.copy()
        }

        return summary

    def visualize_uncertainty(self, analysis: UncertaintyAnalysis,
                            save_path: Optional[str] = None) -> str:
        """
        Create visualization of uncertainty analysis

        Args:
            analysis: Uncertainty analysis result
            save_path: Path to save visualization

        Returns:
            Base64 encoded image or file path
        """
        try:
            fig, axes = plt.subplots(2, 2, figsize=(12, 10))
            fig.suptitle(f'Uncertainty Analysis - {analysis.analysis_id}', fontsize=16)

            # Plot 1: Uncertainty bounds
            ax1 = axes[0, 0]
            bound_types = [bound.bound_type.value for bound in analysis.bounds]
            bound_widths = [bound.width for bound in analysis.bounds]

            ax1.bar(bound_types, bound_widths)
            ax1.set_title('Uncertainty Bounds by Type')
            ax1.set_ylabel('Bound Width')
            ax1.tick_params(axis='x', rotation=45)

            # Plot 2: Uncertainty decomposition
            ax2 = axes[0, 1]
            components = list(analysis.uncertainty_decomposition.keys())
            values = list(analysis.uncertainty_decomposition.values())

            ax2.pie(values, labels=components, autopct='%1.1f%%')
            ax2.set_title('Uncertainty Decomposition')

            # Plot 3: Confidence intervals
            ax3 = axes[1, 0]
            methods = [score.method.value for score in [analysis.confidence_score]]
            confidences = [score.point_estimate for score in [analysis.confidence_score]]
            errors = [score.total_uncertainty for score in [analysis.confidence_score]]

            ax3.errorbar(methods, confidences, yerr=errors, fmt='o', capsize=5)
            ax3.set_title('Prediction with Confidence Intervals')
            ax3.set_ylabel('Prediction Value')
            ax3.tick_params(axis='x', rotation=45)

            # Plot 4: Quality metrics
            ax4 = axes[1, 1]
            metrics = ['Calibration', 'Reliability']
            scores = [analysis.calibration_score, analysis.reliability_score]

            bars = ax4.bar(metrics, scores, color=['blue', 'green'])
            ax4.set_title('Quality Metrics')
            ax4.set_ylabel('Score')
            ax4.set_ylim(0, 1)

            # Add value labels on bars
            for bar, score in zip(bars, scores):
                height = bar.get_height()
                ax4.text(bar.get_x() + bar.get_width()/2., height,
                        f'{score:.3f}', ha='center', va='bottom')

            plt.tight_layout()

            # Save or return as base64
            if save_path:
                plt.savefig(save_path, dpi=300, bbox_inches='tight')
                plt.close()
                return save_path
            else:
                # Convert to base64 string
                import io
                import base64

                buffer = io.BytesIO()
                plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
                buffer.seek(0)
                image_base64 = base64.b64encode(buffer.getvalue()).decode()
                plt.close()

                return f"data:image/png;base64,{image_base64}"

        except Exception as e:
            logger.error(f"Error creating uncertainty visualization: {e}")
            return ""

# Utility functions
def generate_uncertainty_test_data(n_samples: int = 1000, n_features: int = 10,
                                 noise_level: float = 0.1) -> Tuple[np.ndarray, np.ndarray]:
    """Generate synthetic data for uncertainty quantification testing"""
    np.random.seed(42)

    # Generate features
    X = np.random.randn(n_samples, n_features)

    # Generate target with known relationship and noise
    true_coefs = np.random.randn(n_features) * 0.5
    y_signal = X @ true_coefs
    y_noise = np.random.normal(0, noise_level, n_samples)
    y = y_signal + y_noise

    return X, y

if __name__ == "__main__":
    # Example usage
    # Generate test data
    X, y = generate_uncertainty_test_data(n_samples=500, n_features=8, noise_level=0.2)

    # Split data
    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # Create and train model
    from sklearn.ensemble import RandomForestRegressor
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)

    # Initialize uncertainty engine
    uncertainty_engine = UncertaintyQuantificationEngine()

    # Perform uncertainty analysis
    analysis = uncertainty_engine.analyze_uncertainty(
        model=model,
        X=X_train,
        y=y_train,
        X_test=X_test[:5],  # Analyze first 5 test samples
        methods=[ConfidenceMethod.BOOTSTRAP, ConfidenceMethod.CONFORMAL],
        feature_names=[f'feature_{i}' for i in range(X.shape[1])]
    )

    print(f"Uncertainty Analysis ID: {analysis.analysis_id}")
    print(f"Prediction: {analysis.prediction:.3f}")
    print(f"Total Uncertainty: {analysis.confidence_score.total_uncertainty:.3f}")
    print(f"Calibration Score: {analysis.calibration_score:.3f}")
    print(f"Reliability Score: {analysis.reliability_score:.3f}")

    # Get uncertainty summary
    summary = uncertainty_engine.get_uncertainty_summary()
    print(f"Total Analyses: {summary['total_analyses']}")
    print(f"Average Uncertainty: {summary['uncertainty_statistics']['total_uncertainty']['mean']:.3f}")

    # Create visualization
    visualization = uncertainty_engine.visualize_uncertainty(analysis)
    if visualization:
        print(f"Visualization created: {len(visualization)} characters")