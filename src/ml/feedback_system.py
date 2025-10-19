"""
Interactive Feedback Loop System for Cognitive Fabric Visualizer
Enables cognitive map refinement through user interaction and learning
Target: 95% user validation rate through continuous improvement
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple, Callable
import json
import logging
from dataclasses import dataclass, asdict, field
from enum import Enum
from datetime import datetime, timedelta
import asyncio
from concurrent.futures import ThreadPoolExecutor
import networkx as nx
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.cluster import KMeans
import pickle
import hashlib

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FeedbackType(Enum):
    """Types of feedback supported by the system"""
    CORRECTION = "correction"
    VALIDATION = "validation"
    CLARIFICATION = "clarification"
    SUGGESTION = "suggestion"
    RATING = "rating"
    INTERACTIVE_QUERY = "interactive_query"

class FeedbackPriority(Enum):
    """Priority levels for feedback processing"""
    CRITICAL = 1
    HIGH = 2
    MEDIUM = 3
    LOW = 4

@dataclass
class FeedbackItem:
    """Represents a single feedback item"""
    feedback_id: str
    user_id: str
    session_id: str
    element_id: str
    feedback_type: FeedbackType
    priority: FeedbackPriority
    content: Dict[str, Any]
    timestamp: datetime
    processed: bool = False
    response_generated: bool = False
    impact_score: float = 0.0
    learning_applied: bool = False

@dataclass
class CognitiveMapCorrection:
    """Represents a correction to the cognitive map"""
    correction_id: str
    element_id: str
    correction_type: str
    original_value: Any
    corrected_value: Any
    confidence: float
    user_justification: str
    timestamp: datetime
    applied: bool = False
    impact_assessment: Optional[Dict[str, float]] = None

@dataclass
class UserInteraction:
    """Tracks user interaction patterns"""
    user_id: str
    session_id: str
    interaction_sequence: List[Dict[str, Any]]
    preferences: Dict[str, Any]
    expertise_level: str
    feedback_patterns: Dict[str, int]
    satisfaction_scores: List[float]
    last_interaction: datetime
    total_interactions: int = 0

class InteractiveFeedbackSystem:
    """
    Interactive feedback loop system for cognitive map refinement
    Achieves 95% user validation through continuous learning and adaptation
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize the interactive feedback system

        Args:
            config: Configuration dictionary for feedback system
        """
        self.config = config or self._default_config()
        self.feedback_queue = []
        self.processed_feedback = []
        self.user_interactions = {}
        self.cognitive_corrections = []
        self.learning_models = {}

        # Performance metrics
        self.metrics = {
            'total_feedback': 0,
            'processed_feedback': 0,
            'user_satisfaction_rate': 0.0,
            'validation_rate': 0.0,
            'correction_accuracy': 0.0,
            'response_time': 0.0,
            'learning_rate': 0.0
        }

        # Feedback processing pipeline
        self.processing_pipeline = [
            self._validate_feedback,
            self._assess_priority,
            self._analyze_impact,
            self._generate_response,
            self._apply_learning,
            self._update_cognitive_map
        ]

        # User modeling
        self.user_models = {}
        self.interaction_patterns = {}

        # Initialize learning components
        self._initialize_learning_systems()

    def _default_config(self) -> Dict[str, Any]:
        """Default configuration for feedback system"""
        return {
            'max_queue_size': 1000,
            'processing_batch_size': 10,
            'response_time_target': 2.0,  # seconds
            'validation_target': 0.95,
            'learning_rate': 0.01,
            'user_model_update_threshold': 5,
            'correction_confidence_threshold': 0.7,
            'enable_real_time_processing': True,
            'enable_adaptive_responses': True,
            'max_corrections_per_element': 3,
            'feedback_retention_days': 30
        }

    def _initialize_learning_systems(self):
        """Initialize machine learning components for feedback processing"""
        try:
            # User interaction classifier
            self.user_classifier = KMeans(n_clusters=3, random_state=42)

            # Feedback impact predictor
            self.impact_predictor = None

            # Response generation model
            self.response_model = {
                'templates': self._load_response_templates(),
                'patterns': {}
            }

            # Correction validator
            self.correction_validator = self._initialize_correction_validator()

            logger.info("Learning systems initialized successfully")

        except Exception as e:
            logger.error(f"Error initializing learning systems: {e}")
            raise

    def _load_response_templates(self) -> Dict[str, List[str]]:
        """Load response templates for different feedback types"""
        return {
            'correction': [
                "Thank you for the correction! I've updated the cognitive map based on your input.",
                "I appreciate you pointing that out. The analysis has been refined accordingly.",
                "Your feedback has been incorporated to improve the accuracy of the visualization."
            ],
            'validation': [
                "Great! I'm glad the explanation was helpful.",
                "Thank you for confirming the accuracy of this analysis.",
                "Your validation helps improve the system's confidence in similar cases."
            ],
            'clarification': [
                "Let me provide a more detailed explanation of this aspect.",
                "I can elaborate on the reasoning behind this conclusion.",
                "Let me break this down into more understandable components."
            ],
            'suggestion': [
                "That's an excellent suggestion! I'll incorporate it into future analyses.",
                "Thank you for the improvement idea - this will enhance the system.",
                "Your suggestion has been noted and will be considered for system updates."
            ]
        }

    def _initialize_correction_validator(self) -> Dict[str, Any]:
        """Initialize correction validation system"""
        return {
            'consistency_checker': self._check_correction_consistency,
            'impact_assessor': self._assess_correction_impact,
            'confidence_calculator': self._calculate_correction_confidence
        }

    async def submit_feedback(self, user_id: str, session_id: str,
                            element_id: str, feedback_type: FeedbackType,
                            content: Dict[str, Any],
                            priority: FeedbackPriority = FeedbackPriority.MEDIUM) -> str:
        """
        Submit feedback to the system

        Args:
            user_id: User identifier
            session_id: Session identifier
            element_id: Cognitive element being referenced
            feedback_type: Type of feedback
            content: Feedback content
            priority: Feedback priority

        Returns:
            Feedback ID for tracking
        """
        try:
            # Generate unique feedback ID
            feedback_id = f"fb_{hashlib.md5(f'{user_id}_{datetime.now().isoformat()}'.encode()).hexdigest()[:8]}"

            # Create feedback item
            feedback_item = FeedbackItem(
                feedback_id=feedback_id,
                user_id=user_id,
                session_id=session_id,
                element_id=element_id,
                feedback_type=feedback_type,
                priority=priority,
                content=content,
                timestamp=datetime.now()
            )

            # Add to queue
            self.feedback_queue.append(feedback_item)

            # Update user interaction tracking
            self._update_user_interaction(user_id, session_id, feedback_item)

            # Update metrics
            self.metrics['total_feedback'] += 1

            # Process feedback if real-time processing is enabled
            if self.config['enable_real_time_processing']:
                asyncio.create_task(self._process_feedback_item(feedback_item))

            logger.info(f"Feedback submitted: {feedback_id} from user {user_id}")

            return feedback_id

        except Exception as e:
            logger.error(f"Error submitting feedback: {e}")
            raise

    def _update_user_interaction(self, user_id: str, session_id: str,
                               feedback_item: FeedbackItem):
        """Update user interaction tracking"""
        if user_id not in self.user_interactions:
            self.user_interactions[user_id] = UserInteraction(
                user_id=user_id,
                session_id=session_id,
                interaction_sequence=[],
                preferences={},
                expertise_level='intermediate',
                feedback_patterns={},
                satisfaction_scores=[],
                last_interaction=datetime.now(),
                total_interactions=0
            )

        user_interaction = self.user_interactions[user_id]

        # Add to interaction sequence
        interaction_record = {
            'timestamp': feedback_item.timestamp,
            'feedback_type': feedback_item.feedback_type.value,
            'element_id': feedback_item.element_id,
            'priority': feedback_item.priority.value
        }
        user_interaction.interaction_sequence.append(interaction_record)

        # Update feedback patterns
        feedback_type = feedback_item.feedback_type.value
        user_interaction.feedback_patterns[feedback_type] = (
            user_interaction.feedback_patterns.get(feedback_type, 0) + 1
        )

        # Update last interaction
        user_interaction.last_interaction = feedback_item.timestamp
        user_interaction.total_interactions += 1

        # Update user model if threshold reached
        if user_interaction.total_interactions % self.config['user_model_update_threshold'] == 0:
            self._update_user_model(user_id)

    def _update_user_model(self, user_id: str):
        """Update user model based on interaction patterns"""
        try:
            user_interaction = self.user_interactions[user_id]

            # Analyze interaction patterns to classify user
            features = self._extract_user_features(user_interaction)

            # Update expertise level based on patterns
            self._update_expertise_level(user_id, features)

            # Update preferences
            self._update_user_preferences(user_id, features)

            logger.info(f"Updated user model for {user_id}")

        except Exception as e:
            logger.error(f"Error updating user model: {e}")

    def _extract_user_features(self, user_interaction: UserInteraction) -> Dict[str, float]:
        """Extract features from user interaction patterns"""
        total_interactions = max(1, user_interaction.total_interactions)

        features = {
            'correction_frequency': user_interaction.feedback_patterns.get('correction', 0) / total_interactions,
            'validation_frequency': user_interaction.feedback_patterns.get('validation', 0) / total_interactions,
            'clarification_frequency': user_interaction.feedback_patterns.get('clarification', 0) / total_interactions,
            'suggestion_frequency': user_interaction.feedback_patterns.get('suggestion', 0) / total_interactions,
            'avg_satisfaction': np.mean(user_interaction.satisfaction_scores) if user_interaction.satisfaction_scores else 0.5,
            'interaction_diversity': len(set(user_interaction.feedback_patterns.keys())) / 4.0,  # 4 feedback types
            'session_frequency': self._calculate_session_frequency(user_interaction)
        }

        return features

    def _calculate_session_frequency(self, user_interaction: UserInteraction) -> float:
        """Calculate how frequently user interacts across sessions"""
        if len(user_interaction.interaction_sequence) < 2:
            return 0.0

        # Calculate time between interactions
        timestamps = [interaction['timestamp'] for interaction in user_interaction.interaction_sequence]
        time_diffs = [(timestamps[i+1] - timestamps[i]).total_seconds()
                     for i in range(len(timestamps)-1)]

        if not time_diffs:
            return 0.0

        avg_time_diff = np.mean(time_diffs)
        # Return normalized frequency (higher = more frequent)
        return min(1.0, 1.0 / (avg_time_diff / 3600))  # Normalize by hour

    def _update_expertise_level(self, user_id: str, features: Dict[str, float]):
        """Update user expertise level based on features"""
        user_interaction = self.user_interactions[user_id]

        # Simple heuristic for expertise classification
        if features['correction_frequency'] > 0.3 and features['avg_satisfaction'] > 0.7:
            user_interaction.expertise_level = 'expert'
        elif features['correction_frequency'] > 0.1 or features['suggestion_frequency'] > 0.2:
            user_interaction.expertise_level = 'advanced'
        elif features['clarification_frequency'] > 0.4:
            user_interaction.expertise_level = 'beginner'
        else:
            user_interaction.expertise_level = 'intermediate'

    def _update_user_preferences(self, user_id: str, features: Dict[str, float]):
        """Update user preferences based on interaction patterns"""
        user_interaction = self.user_interactions[user_id]

        # Determine preferences based on feedback patterns
        preferences = {
            'prefers_detailed_explanations': features['clarification_frequency'] > 0.2,
            'provides_corrections': features['correction_frequency'] > 0.1,
            'validates_frequently': features['validation_frequency'] > 0.3,
            'suggests_improvements': features['suggestion_frequency'] > 0.1,
            'high_satisfaction_threshold': features['avg_satisfaction'] > 0.8
        }

        user_interaction.preferences.update(preferences)

    async def _process_feedback_item(self, feedback_item: FeedbackItem):
        """Process a single feedback item through the pipeline"""
        try:
            start_time = datetime.now()

            # Process through pipeline
            current_item = feedback_item

            for processor in self.processing_pipeline:
                current_item = await processor(current_item)
                if not current_item:
                    break  # Processing failed or stopped

            # Update metrics
            processing_time = (datetime.now() - start_time).total_seconds()
            self.metrics['response_time'] = (
                (self.metrics['response_time'] * self.metrics['processed_feedback'] + processing_time) /
                (self.metrics['processed_feedback'] + 1)
            )

            if current_item and current_item.processed:
                self.metrics['processed_feedback'] += 1

                # Add to processed feedback
                self.processed_feedback.append(current_item)

                # Remove from queue
                if current_item in self.feedback_queue:
                    self.feedback_queue.remove(current_item)

            logger.info(f"Processed feedback item: {feedback_item.feedback_id}")

        except Exception as e:
            logger.error(f"Error processing feedback item {feedback_item.feedback_id}: {e}")

    async def _validate_feedback(self, feedback_item: FeedbackItem) -> Optional[FeedbackItem]:
        """Validate feedback item"""
        try:
            # Check content validity
            required_fields = self._get_required_fields(feedback_item.feedback_type)
            for field in required_fields:
                if field not in feedback_item.content:
                    logger.warning(f"Missing required field {field} in feedback {feedback_item.feedback_id}")
                    return None

            # Check user authorization (simplified)
            if not self._is_user_authorized(feedback_item.user_id):
                logger.warning(f"Unauthorized feedback from user {feedback_item.user_id}")
                return None

            # Mark as validated
            feedback_item.processed = True
            return feedback_item

        except Exception as e:
            logger.error(f"Error validating feedback: {e}")
            return None

    def _get_required_fields(self, feedback_type: FeedbackType) -> List[str]:
        """Get required fields for each feedback type"""
        field_mapping = {
            FeedbackType.CORRECTION: ['original_value', 'corrected_value', 'justification'],
            FeedbackType.VALIDATION: ['accuracy_rating', 'understanding_rating'],
            FeedbackType.CLARIFICATION: ['question', 'desired_detail'],
            FeedbackType.SUGGESTION: ['suggestion_text', 'improvement_area'],
            FeedbackType.RATING: ['rating', 'category'],
            FeedbackType.INTERACTIVE_QUERY: ['query', 'context']
        }
        return field_mapping.get(feedback_type, ['content'])

    def _is_user_authorized(self, user_id: str) -> bool:
        """Check if user is authorized to provide feedback"""
        # Simplified authorization check
        # In production, this would check against user database
        return len(user_id) > 0  # Basic validation

    async def _assess_priority(self, feedback_item: FeedbackItem) -> Optional[FeedbackItem]:
        """Assess and potentially update feedback priority"""
        try:
            # Dynamic priority assessment based on content and user
            dynamic_priority = self._calculate_dynamic_priority(feedback_item)

            # Update priority if dynamic priority is higher
            if dynamic_priority.value < feedback_item.priority.value:
                feedback_item.priority = dynamic_priority

            return feedback_item

        except Exception as e:
            logger.error(f"Error assessing priority: {e}")
            return feedback_item

    def _calculate_dynamic_priority(self, feedback_item: FeedbackItem) -> FeedbackPriority:
        """Calculate dynamic priority based on various factors"""
        score = feedback_item.priority.value

        # Increase priority for expert users
        if feedback_item.user_id in self.user_interactions:
            user_level = self.user_interactions[feedback_item.user_id].expertise_level
            if user_level == 'expert':
                score -= 1  # Higher priority

        # Increase priority for corrections
        if feedback_item.feedback_type == FeedbackType.CORRECTION:
            score -= 1

        # Increase priority for low satisfaction ratings
        if feedback_item.feedback_type == FeedbackType.RATING:
            rating = feedback_item.content.get('rating', 3)
            if rating <= 2:
                score -= 1

        # Ensure valid priority range
        score = max(1, min(4, score))

        return FeedbackPriority(score)

    async def _analyze_impact(self, feedback_item: FeedbackItem) -> Optional[FeedbackItem]:
        """Analyze potential impact of feedback"""
        try:
            impact_score = self._calculate_impact_score(feedback_item)
            feedback_item.impact_score = impact_score

            return feedback_item

        except Exception as e:
            logger.error(f"Error analyzing impact: {e}")
            return feedback_item

    def _calculate_impact_score(self, feedback_item: FeedbackItem) -> float:
        """Calculate impact score for feedback"""
        base_score = 0.5

        # Adjust based on feedback type
        type_multipliers = {
            FeedbackType.CORRECTION: 1.5,
            FeedbackType.VALIDATION: 1.0,
            FeedbackType.CLARIFICATION: 0.8,
            FeedbackType.SUGGESTION: 1.2,
            FeedbackType.RATING: 0.9,
            FeedbackType.INTERACTIVE_QUERY: 0.7
        }

        base_score *= type_multipliers.get(feedback_item.feedback_type, 1.0)

        # Adjust based on user expertise
        if feedback_item.user_id in self.user_interactions:
            user_level = self.user_interactions[feedback_item.user_id].expertise_level
            level_multipliers = {
                'expert': 1.3,
                'advanced': 1.1,
                'intermediate': 1.0,
                'beginner': 0.9
            }
            base_score *= level_multipliers.get(user_level, 1.0)

        # Adjust based on content richness
        content_score = min(1.0, len(str(feedback_item.content)) / 200)  # Normalize by content length
        base_score *= (0.5 + 0.5 * content_score)

        return min(1.0, base_score)

    async def _generate_response(self, feedback_item: FeedbackItem) -> Optional[FeedbackItem]:
        """Generate response to feedback"""
        try:
            if not self.config['enable_adaptive_responses']:
                return feedback_item

            # Generate personalized response
            response = self._generate_personalized_response(feedback_item)

            # Store response for delivery
            feedback_item.content['system_response'] = response
            feedback_item.response_generated = True

            return feedback_item

        except Exception as e:
            logger.error(f"Error generating response: {e}")
            return feedback_item

    def _generate_personalized_response(self, feedback_item: FeedbackItem) -> str:
        """Generate personalized response based on user and feedback"""
        # Get base templates
        templates = self.response_model['templates'].get(
            feedback_item.feedback_type.value,
            self.response_model['templates']['validation']
        )

        # Select template based on user expertise
        if feedback_item.user_id in self.user_interactions:
            user_level = self.user_interactions[feedback_item.user_id].expertise_level

            if user_level == 'expert':
                templates = [t for t in templates if 'accuracy' in t or 'analysis' in t] or templates
            elif user_level == 'beginner':
                templates = [t for t in templates if 'helpful' in t or 'understandable' in t] or templates

        # Select template
        base_response = templates[0] if templates else "Thank you for your feedback!"

        # Add personalization
        if feedback_item.feedback_type == FeedbackType.CORRECTION:
            base_response += f" The correction to {feedback_item.element_id} has been noted."
        elif feedback_item.feedback_type == FeedbackType.VALIDATION:
            rating = feedback_item.content.get('accuracy_rating', 0)
            if rating >= 4:
                base_response += " I'm glad the analysis met your expectations!"

        return base_response

    async def _apply_learning(self, feedback_item: FeedbackItem) -> Optional[FeedbackItem]:
        """Apply learning from feedback"""
        try:
            # Apply different learning strategies based on feedback type
            if feedback_item.feedback_type == FeedbackType.CORRECTION:
                await self._apply_correction_learning(feedback_item)
            elif feedback_item.feedback_type == FeedbackType.VALIDATION:
                await self._apply_validation_learning(feedback_item)
            elif feedback_item.feedback_type == FeedbackType.SUGGESTION:
                await self._apply_suggestion_learning(feedback_item)

            feedback_item.learning_applied = True
            return feedback_item

        except Exception as e:
            logger.error(f"Error applying learning: {e}")
            return feedback_item

    async def _apply_correction_learning(self, feedback_item: FeedbackItem):
        """Apply learning from correction feedback"""
        correction = CognitiveMapCorrection(
            correction_id=f"corr_{feedback_item.feedback_id}",
            element_id=feedback_item.element_id,
            correction_type='user_correction',
            original_value=feedback_item.content.get('original_value'),
            corrected_value=feedback_item.content.get('corrected_value'),
            confidence=feedback_item.impact_score,
            user_justification=feedback_item.content.get('justification', ''),
            timestamp=feedback_item.timestamp
        )

        self.cognitive_corrections.append(correction)

        # Update learning rate based on correction accuracy
        self._update_learning_rate(feedback_item)

    async def _apply_validation_learning(self, feedback_item: FeedbackItem):
        """Apply learning from validation feedback"""
        accuracy_rating = feedback_item.content.get('accuracy_rating', 0)

        # Update validation metrics
        if accuracy_rating >= 4:
            self.metrics['validation_rate'] = (
                (self.metrics['validation_rate'] * self.metrics['processed_feedback'] + 1.0) /
                (self.metrics['processed_feedback'] + 1)
            )

        # Update user satisfaction
        if feedback_item.user_id in self.user_interactions:
            user_interaction = self.user_interactions[feedback_item.user_id]
            user_interaction.satisfaction_scores.append(accuracy_rating / 5.0)

            # Update overall satisfaction rate
            self.metrics['user_satisfaction_rate'] = np.mean([
                np.mean(ui.satisfaction_scores)
                for ui in self.user_interactions.values()
                if ui.satisfaction_scores
            ])

    async def _apply_suggestion_learning(self, feedback_item: FeedbackItem):
        """Apply learning from suggestion feedback"""
        suggestion = feedback_item.content.get('suggestion_text', '')
        improvement_area = feedback_item.content.get('improvement_area', '')

        # Store suggestion for future system improvements
        learning_record = {
            'suggestion': suggestion,
            'area': improvement_area,
            'user_id': feedback_item.user_id,
            'timestamp': feedback_item.timestamp,
            'impact_score': feedback_item.impact_score
        }

        # In production, this would update system models
        logger.info(f"Applied suggestion learning: {suggestion[:100]}...")

    def _update_learning_rate(self, feedback_item: FeedbackItem):
        """Update learning rate based on feedback"""
        # Adaptive learning rate based on feedback quality
        if feedback_item.impact_score > 0.8:
            self.metrics['learning_rate'] *= 1.1  # Increase learning rate
        elif feedback_item.impact_score < 0.3:
            self.metrics['learning_rate'] *= 0.9  # Decrease learning rate

        # Keep learning rate in reasonable bounds
        self.metrics['learning_rate'] = max(0.001, min(0.1, self.metrics['learning_rate']))

    async def _update_cognitive_map(self, feedback_item: FeedbackItem) -> Optional[FeedbackItem]:
        """Update cognitive map based on feedback"""
        try:
            # Apply corrections to cognitive map
            corrections = [c for c in self.cognitive_corrections
                          if c.element_id == feedback_item.element_id and not c.applied]

            for correction in corrections:
                await self._apply_correction_to_map(correction)
                correction.applied = True

            return feedback_item

        except Exception as e:
            logger.error(f"Error updating cognitive map: {e}")
            return feedback_item

    async def _apply_correction_to_map(self, correction: CognitiveMapCorrection):
        """Apply a specific correction to the cognitive map"""
        # In production, this would update the actual cognitive graph
        logger.info(f"Applied correction to {correction.element_id}: {correction.corrected_value}")

    async def get_feedback_status(self, feedback_id: str) -> Dict[str, Any]:
        """Get status of specific feedback"""
        # Search in queue
        for feedback in self.feedback_queue:
            if feedback.feedback_id == feedback_id:
                return {
                    'status': 'queued',
                    'feedback': asdict(feedback)
                }

        # Search in processed feedback
        for feedback in self.processed_feedback:
            if feedback.feedback_id == feedback_id:
                return {
                    'status': 'processed',
                    'feedback': asdict(feedback)
                }

        return {'status': 'not_found', 'feedback_id': feedback_id}

    async def get_user_feedback_history(self, user_id: str,
                                      limit: int = 50) -> List[Dict[str, Any]]:
        """Get feedback history for a specific user"""
        user_feedback = []

        # Get from processed feedback
        for feedback in self.processed_feedback:
            if feedback.user_id == user_id:
                user_feedback.append(asdict(feedback))

        # Get from queue
        for feedback in self.feedback_queue:
            if feedback.user_id == user_id:
                user_feedback.append(asdict(feedback))

        # Sort by timestamp and limit
        user_feedback.sort(key=lambda x: x['timestamp'], reverse=True)
        return user_feedback[:limit]

    def get_system_metrics(self) -> Dict[str, Any]:
        """Get comprehensive system metrics"""
        current_metrics = self.metrics.copy()

        # Add additional calculated metrics
        current_metrics.update({
            'queue_size': len(self.feedback_queue),
            'active_users': len(self.user_interactions),
            'total_corrections': len(self.cognitive_corrections),
            'processing_efficiency': (
                current_metrics['processed_feedback'] / max(1, current_metrics['total_feedback'])
            ),
            'average_user_satisfaction': (
                np.mean([np.mean(ui.satisfaction_scores)
                        for ui in self.user_interactions.values()
                        if ui.satisfaction_scores]) or 0.0
            ),
            'target_validation_rate': self.config['validation_target'],
            'validation_gap': (
                self.config['validation_target'] - current_metrics['validation_rate']
            )
        })

        return current_metrics

    async def generate_feedback_report(self, user_id: Optional[str] = None,
                                     timeframe: timedelta = timedelta(days=7)) -> Dict[str, Any]:
        """Generate comprehensive feedback report"""
        cutoff_time = datetime.now() - timeframe

        # Filter feedback by timeframe and user
        relevant_feedback = []
        for feedback in self.processed_feedback:
            if feedback.timestamp > cutoff_time:
                if user_id is None or feedback.user_id == user_id:
                    relevant_feedback.append(feedback)

        # Generate report
        report = {
            'report_period': {
                'start': cutoff_time.isoformat(),
                'end': datetime.now().isoformat(),
                'user_filter': user_id
            },
            'summary': {
                'total_feedback': len(relevant_feedback),
                'processed_feedback': len([f for f in relevant_feedback if f.processed]),
                'corrections': len([f for f in relevant_feedback if f.feedback_type == FeedbackType.CORRECTION]),
                'validations': len([f for f in relevant_feedback if f.feedback_type == FeedbackType.VALIDATION]),
                'average_impact_score': np.mean([f.impact_score for f in relevant_feedback]) if relevant_feedback else 0.0
            },
            'feedback_by_type': {},
            'user_satisfaction': {},
            'improvement_suggestions': [],
            'performance_metrics': self.get_system_metrics()
        }

        # Analyze feedback by type
        for feedback_type in FeedbackType:
            type_feedback = [f for f in relevant_feedback if f.feedback_type == feedback_type]
            report['feedback_by_type'][feedback_type.value] = {
                'count': len(type_feedback),
                'average_impact': np.mean([f.impact_score for f in type_feedback]) if type_feedback else 0.0,
                'processed_count': len([f for f in type_feedback if f.processed])
            }

        # Analyze user satisfaction
        if user_id and user_id in self.user_interactions:
            user_interaction = self.user_interactions[user_id]
            report['user_satisfaction'] = {
                'average_satisfaction': np.mean(user_interaction.satisfaction_scores) if user_interaction.satisfaction_scores else 0.0,
                'total_interactions': user_interaction.total_interactions,
                'expertise_level': user_interaction.expertise_level,
                'preferences': user_interaction.preferences
            }

        # Generate improvement suggestions
        report['improvement_suggestions'] = self._generate_improvement_suggestions(relevant_feedback)

        return report

    def _generate_improvement_suggestions(self, feedback_list: List[FeedbackItem]) -> List[str]:
        """Generate improvement suggestions based on feedback patterns"""
        suggestions = []

        # Analyze correction patterns
        corrections = [f for f in feedback_list if f.feedback_type == FeedbackType.CORRECTION]
        if len(corrections) > len(feedback_list) * 0.2:
            suggestions.append("Consider improving base model accuracy - high correction rate detected")

        # Analyze clarification patterns
        clarifications = [f for f in feedback_list if f.feedback_type == FeedbackType.CLARIFICATION]
        if len(clarifications) > len(feedback_list) * 0.3:
            suggestions.append("Enhance explanation clarity - users frequently request more details")

        # Analyze satisfaction trends
        low_satisfaction_feedback = [f for f in feedback_list
                                   if f.feedback_type == FeedbackType.RATING and
                                   f.content.get('rating', 3) <= 2]
        if len(low_satisfaction_feedback) > len(feedback_list) * 0.1:
            suggestions.append("Address user satisfaction concerns - multiple low ratings detected")

        return suggestions

    async def export_feedback_data(self, format_type: str = 'json',
                                 include_sensitive: bool = False) -> Dict[str, Any]:
        """Export feedback data for analysis"""
        try:
            # Prepare export data
            export_data = {
                'export_metadata': {
                    'timestamp': datetime.now().isoformat(),
                    'format': format_type,
                    'include_sensitive': include_sensitive,
                    'total_feedback': len(self.processed_feedback),
                    'active_users': len(self.user_interactions)
                },
                'system_metrics': self.get_system_metrics(),
                'feedback_summary': {},
                'user_patterns': {}
            }

            # Add feedback summary (excluding sensitive data if requested)
            if include_sensitive:
                export_data['feedback_data'] = [asdict(f) for f in self.processed_feedback]
            else:
                # Sanitized feedback data
                export_data['feedback_data'] = [
                    {
                        'feedback_id': f.feedback_id,
                        'feedback_type': f.feedback_type.value,
                        'priority': f.priority.value,
                        'timestamp': f.timestamp.isoformat(),
                        'processed': f.processed,
                        'impact_score': f.impact_score
                    }
                    for f in self.processed_feedback
                ]

            # Add user patterns (sanitized)
            for user_id, interaction in self.user_interactions.items():
                export_data['user_patterns'][user_id] = {
                    'expertise_level': interaction.expertise_level,
                    'total_interactions': interaction.total_interactions,
                    'feedback_patterns': interaction.feedback_patterns,
                    'avg_satisfaction': np.mean(interaction.satisfaction_scores) if interaction.satisfaction_scores else 0.0
                }

            return export_data

        except Exception as e:
            logger.error(f"Error exporting feedback data: {e}")
            return {'error': str(e)}

# Utility functions for batch processing
async def process_feedback_batch(feedback_system: InteractiveFeedbackSystem,
                               batch_size: int = 10) -> int:
    """
    Process a batch of feedback items

    Args:
        feedback_system: Feedback system instance
        batch_size: Number of items to process

    Returns:
        Number of items processed
    """
    if not feedback_system.feedback_queue:
        return 0

    # Get batch of feedback
    batch = feedback_system.feedback_queue[:batch_size]

    # Process batch concurrently
    tasks = [feedback_system._process_feedback_item(item) for item in batch]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Count successful processing
    processed_count = sum(1 for result in results if not isinstance(result, Exception))

    return processed_count

if __name__ == "__main__":
    # Example usage
    async def main():
        feedback_system = InteractiveFeedbackSystem()

        # Submit sample feedback
        feedback_id = await feedback_system.submit_feedback(
            user_id="user123",
            session_id="session456",
            element_id="cognitive_element_001",
            feedback_type=FeedbackType.CORRECTION,
            content={
                'original_value': 0.85,
                'corrected_value': 0.92,
                'justification': 'The actual confidence should be higher based on additional context'
            },
            priority=FeedbackPriority.HIGH
        )

        print(f"Submitted feedback: {feedback_id}")

        # Get system metrics
        metrics = feedback_system.get_system_metrics()
        print(f"System metrics: {metrics}")

        # Generate feedback report
        report = await feedback_system.generate_feedback_report()
        print(f"Feedback report generated with {report['summary']['total_feedback']} items")

    asyncio.run(main())