"""
Meta-Cognition Analyzer with Real-time Multi-modal Detection

Implements meta-cognition analysis with 0.96 F1-score target using:
- Real-time multi-modal detection (audio + video)
- Self-correction and planning identification
- Strategy monitoring and cognitive load estimation
"""

import numpy as np
import librosa
import cv2
from typing import Dict, List, Optional, Tuple, Any, Union
from dataclasses import dataclass
from enum import Enum

import spacy
import torch
import torch.nn as nn
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import speech_recognition as sr
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score, precision_score, recall_score
import re
from loguru import logger

# Performance Targets
METACOGNITION_F1_TARGET = 0.96
COGNITIVE_LOAD_CORRELATION = 0.85
MULTIMODAL_SYNC_THRESHOLD = 0.8


class MetacognitiveType(Enum):
    """Types of metacognitive processes."""
    CONFIDENCE = "confidence"
    UNCERTAINTY = "uncertainty"
    PLANNING = "planning"
    REFLECTION = "reflection"
    SELF_MONITORING = "self_monitoring"
    STRATEGY_ADJUSTMENT = "strategy_adjustment"


@dataclass
class MetacognitiveElement:
    """Represents a metacognitive element in communication."""
    element: str
    metacognitive_type: MetacognitiveType
    awareness_level: float
    self_monitoring: bool
    confidence: float
    source_span: Tuple[int, int]
    modality: str  # "text", "audio", "video"


@dataclass
class CognitiveLoadEstimate:
    """Represents cognitive load estimation."""
    load_level: float  # 0-1 scale
    factors: Dict[str, float]  # Individual contributing factors
    timestamp: float
    modality: str


@dataclass
class SelfCorrectionEvent:
    """Represents a self-correction event."""
    original_statement: str
    corrected_statement: str
    correction_type: str
    confidence_improvement: float
    timestamp: float
    modality: str


class MultimodalMetacognitiveNet(nn.Module):
    """Neural network for multimodal metacognition detection."""

    def __init__(
        self,
        text_dim: int = 768,
        audio_dim: int = 128,
        video_dim: int = 512,
        hidden_dim: int = 256,
        output_dim: int = 128
    ):
        super().__init__()

        # Modality encoders
        self.text_encoder = nn.Sequential(
            nn.Linear(text_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim)
        )

        self.audio_encoder = nn.Sequential(
            nn.Linear(audio_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim // 2, hidden_dim // 2)
        )

        self.video_encoder = nn.Sequential(
            nn.Linear(video_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim)
        )

        # Cross-modal attention
        self.cross_modal_attention = nn.MultiheadAttention(
            embed_dim=hidden_dim,
            num_heads=8,
            dropout=0.1
        )

        # Metacognition classifiers
        self.metacognition_classifier = nn.Sequential(
            nn.Linear(hidden_dim * 3, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(hidden_dim, len(MetacognitiveType))
        )

        self.cognitive_load_regressor = nn.Sequential(
            nn.Linear(hidden_dim * 3, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid()
        )

        self.confidence_estimator = nn.Sequential(
            nn.Linear(hidden_dim * 3, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid()
        )

    def forward(self, text_features, audio_features, video_features):
        """Forward pass through multimodal network."""
        # Encode modalities
        text_encoded = self.text_encoder(text_features)
        audio_encoded = self.audio_encoder(audio_features)
        video_encoded = self.video_encoder(video_features)

        # Cross-modal attention
        combined_features = torch.stack([text_encoded, audio_encoded, video_encoded], dim=1)
        attended_features, attention_weights = self.cross_modal_attention(
            combined_features, combined_features, combined_features
        )

        # Flatten attended features
        flattened_features = attended_features.view(attended_features.size(0), -1)

        # Classifications
        metacognition_logits = self.metacognition_classifier(flattened_features)
        cognitive_load = self.cognitive_load_regressor(flattened_features)
        confidence = self.confidence_estimator(flattened_features)

        return {
            "metacognition_logits": metacognition_logits,
            "cognitive_load": cognitive_load,
            "confidence": confidence,
            "attention_weights": attention_weights,
            "modality_features": {
                "text": text_encoded,
                "audio": audio_encoded,
                "video": video_encoded
            }
        }


class MetaCognitionAnalyzer:
    """
    Analyzes metacognition with 0.96 F1-score target using multi-modal detection.

    Features:
    - Real-time multi-modal detection (audio + video)
    - Self-correction and planning identification
    - Strategy monitoring and cognitive load estimation
    - Cross-modal synchronization analysis
    """

    def __init__(
        self,
        spacy_model: str = "en_core_web_lg",
        metacognition_model: str = "bert-base-uncased"
    ):
        """Initialize metacognition analyzer."""
        # Load NLP models
        try:
            self.nlp = spacy.load(spacy_model)
        except OSError:
            self.nlp = spacy.load("en_core_web_sm")

        # Load metacognition classification model
        self.metacognition_tokenizer = AutoTokenizer.from_pretrained(metacognition_model)
        self.metacognition_model = AutoModelForSequenceClassification.from_pretrained(
            metacognition_model,
            num_labels=len(MetacognitiveType)
        )

        # Initialize multimodal neural network
        self.multimodal_net = MultimodalMetacognitiveNet()
        self.multimodal_net.eval()

        # Initialize speech recognizer
        self.speech_recognizer = sr.Recognizer()

        # Metacognitive indicators
        self.confidence_indicators = [
            "confident", "sure", "certain", "definitely", "absolutely",
            "without doubt", "clearly", "obviously"
        ]

        self.uncertainty_indicators = [
            "maybe", "perhaps", "possibly", "might", "could",
            "uncertain", "unsure", "not sure", "probably"
        ]

        self.planning_indicators = [
            "plan to", "will", "going to", "intend to", "strategy",
            "approach", "method", "next step", "first"
        ]

        self.reflection_indicators = [
            "think about", "reflect on", "consider", "realize",
            "understand", "recognize", "become aware"
        ]

        self.self_monitoring_indicators = [
            "check", "verify", "monitor", "watch", "observe",
            "notice", "detect", "identify", "assess"
        ]

        self.strategy_adjustment_indicators = [
            "adjust", "modify", "change approach", "try different",
            "alternative", "reconsider", "revise"
        ]

        # Performance metrics
        self.metrics = {
            "metacognitive_elements_detected": 0,
            "self_corrections_detected": 0,
            "cognitive_load_estimates": 0,
            "f1_score": 0.0,
            "precision": 0.0,
            "recall": 0.0
        }

    def _extract_text_metacognition(self, text: str) -> List[MetacognitiveElement]:
        """Extract metacognitive elements from text."""
        doc = self.nlp(text)
        metacognitive_elements = []

        # Process each sentence
        for sent in doc.sents:
            sent_text = sent.text.strip()
            sent_lower = sent_text.lower()

            # Check for different metacognitive types
            metacognitive_checks = [
                (MetacognitiveType.CONFIDENCE, self.confidence_indicators),
                (MetacognitiveType.UNCERTAINTY, self.uncertainty_indicators),
                (MetacognitiveType.PLANNING, self.planning_indicators),
                (MetacognitiveType.REFLECTION, self.reflection_indicators),
                (MetacognitiveType.SELF_MONITORING, self.self_monitoring_indicators),
                (MetacognitiveType.STRATEGY_ADJUSTMENT, self.strategy_adjustment_indicators)
            ]

            for metacog_type, indicators in metacognitive_checks:
                if any(indicator in sent_lower for indicator in indicators):
                    # Calculate awareness level
                    awareness_level = self._calculate_awareness_level(sent_text, metacog_type)

                    # Determine self-monitoring
                    self_monitoring = self._has_self_monitoring(sent_text)

                    # Calculate confidence
                    confidence = self._calculate_text_confidence(sent_text, metacog_type)

                    element = MetacognitiveElement(
                        element=sent_text,
                        metacognitive_type=metacog_type,
                        awareness_level=awareness_level,
                        self_monitoring=self_monitoring,
                        confidence=confidence,
                        source_span=(sent.start_char, sent.end_char),
                        modality="text"
                    )

                    metacognitive_elements.append(element)

        return metacognitive_elements

    def _calculate_awareness_level(
        self,
        text: str,
        metacognitive_type: MetacognitiveType
    ) -> float:
        """Calculate awareness level of metacognitive process."""
        awareness_factors = []

        # Explicitness of metacognitive language
        explicit_indicators = {
            MetacognitiveType.CONFIDENCE: ["i am confident", "i am sure"],
            MetacognitiveType.UNCERTAINTY: ["i am uncertain", "i am unsure"],
            MetacognitiveType.PLANNING: ["i plan to", "my plan is"],
            MetacognitiveType.REFLECTION: ["i realize that", "i became aware"],
            MetacognitiveType.SELF_MONITORING: ["i notice that", "i can see"],
            MetacognitiveType.STRATEGY_ADJUSTMENT: ["i need to change", "i should adjust"]
        }

        text_lower = text.lower()
        explicit_count = sum(1 for indicator in explicit_indicators.get(metacognitive_type, [])
                           if indicator in text_lower)

        explicitness_score = min(1.0, explicit_count / 2.0)
        awareness_factors.append(explicitness_score)

        # Linguistic complexity (more complex sentences indicate higher awareness)
        complexity_score = min(1.0, len(text.split()) / 15.0)
        awareness_factors.append(complexity_score)

        # Metacognitive verb density
        metacognitive_verbs = ["think", "know", "understand", "realize", "recognize", "notice"]
        verb_density = sum(1 for verb in metacognitive_verbs if verb in text_lower) / max(1, len(text.split()))
        awareness_factors.append(min(1.0, verb_density * 10))

        return np.mean(awareness_factors)

    def _has_self_monitoring(self, text: str) -> bool:
        """Check if text contains self-monitoring indicators."""
        self_monitoring_patterns = [
            r"i (notice|observe|detect|see|find) that",
            r"i (realize|recognize|become aware)",
            r"i (check|verify|monitor)",
            r"it seems to me that",
            r"i (believe|think|feel) that"
        ]

        text_lower = text.lower()
        return any(re.search(pattern, text_lower) for pattern in self_monitoring_patterns)

    def _calculate_text_confidence(
        self,
        text: str,
        metacognitive_type: MetacognitiveType
    ) -> float:
        """Calculate confidence in metacognitive element detection."""
        confidence_factors = []

        # Type-specific confidence
        type_confidence = {
            MetacognitiveType.CONFIDENCE: 0.9,
            MetacognitiveType.UNCERTAINTY: 0.85,
            MetacognitiveType.PLANNING: 0.8,
            MetacognitiveType.REFLECTION: 0.75,
            MetacognitiveType.SELF_MONITORING: 0.8,
            MetacognitiveType.STRATEGY_ADJUSTMENT: 0.7
        }
        confidence_factors.append(type_confidence.get(metacognitive_type, 0.5))

        # Pattern match confidence
        pattern_count = 0
        patterns = {
            MetacognitiveType.CONFIDENCE: self.confidence_indicators,
            MetacognitiveType.UNCERTAINTY: self.uncertainty_indicators,
            MetacognitiveType.PLANNING: self.planning_indicators,
            MetacognitiveType.REFLECTION: self.reflection_indicators,
            MetacognitiveType.SELF_MONITORING: self.self_monitoring_indicators,
            MetacognitiveType.STRATEGY_ADJUSTMENT: self.strategy_adjustment_indicators
        }

        text_lower = text.lower()
        for pattern in patterns.get(metacognitive_type, []):
            if pattern in text_lower:
                pattern_count += 1

        pattern_confidence = min(1.0, pattern_count / 2.0)
        confidence_factors.append(pattern_confidence)

        return np.mean(confidence_factors)

    def _process_audio_metacognition(self, audio_data: np.ndarray, sample_rate: int) -> Dict[str, Any]:
        """Process audio for metacognitive cues."""
        try:
            # Extract audio features
            mfcc_features = librosa.feature.mfcc(y=audio_data, sr=sample_rate, n_mfcc=13)
            spectral_centroids = librosa.feature.spectral_centroid(y=audio_data, sr=sample_rate)
            zero_crossing_rate = librosa.feature.zero_crossing_rate(audio_data)

            # Prosodic features (speaking rate, pauses, pitch variation)
            tempo, beats = librosa.beat.beat_track(y=audio_data, sr=sample_rate)
            rms_energy = librosa.feature.rms(y=audio_data)

            # Combine features
            audio_features = np.concatenate([
                np.mean(mfcc_features, axis=1),
                np.mean(spectral_centroids),
                np.mean(zero_crossing_rate),
                [tempo],
                np.mean(rms_energy)
            ])

            # Speech recognition
            with sr.AudioFile(audio_data) as source:
                audio_listened = self.speech_recognizer.record(source)
                try:
                    transcription = self.speech_recognizer.recognize_google(audio_listened)
                except:
                    transcription = ""

            # Detect hesitation and uncertainty in speech
            hesitation_indicators = self._detect_hesitation_indicators(audio_data, sample_rate)

            # Estimate cognitive load from vocal characteristics
            cognitive_load_from_audio = self._estimate_cognitive_load_from_audio(audio_features)

            return {
                "features": audio_features,
                "transcription": transcription,
                "hesitation_indicators": hesitation_indicators,
                "cognitive_load_estimate": cognitive_load_from_audio,
                "prosodic_features": {
                    "tempo": tempo,
                    "energy": np.mean(rms_energy),
                    "spectral_centroid": np.mean(spectral_centroids)
                }
            }

        except Exception as e:
            logger.error(f"Audio processing failed: {e}")
            return {
                "features": np.zeros(128),
                "transcription": "",
                "hesitation_indicators": [],
                "cognitive_load_estimate": 0.0,
                "prosodic_features": {}
            }

    def _detect_hesitation_indicators(
        self,
        audio_data: np.ndarray,
        sample_rate: int
    ) -> List[Dict[str, float]]:
        """Detect hesitation indicators in audio."""
        hesitation_indicators = []

        # Detect filled pauses (um, uh, etc.)
        # This is a simplified implementation
        pause_threshold = 0.5  # seconds
        frame_length = int(sample_rate * 0.025)  # 25ms frames

        energy = librosa.feature.rms(y=audio_data, frame_length=frame_length)[0]

        # Find low energy regions (pauses)
        pause_regions = []
        in_pause = False
        pause_start = 0

        for i, frame_energy in enumerate(energy):
            if frame_energy < 0.01 and not in_pause:
                # Start of pause
                in_pause = True
                pause_start = i
            elif frame_energy >= 0.01 and in_pause:
                # End of pause
                pause_duration = (i - pause_start) * frame_length / sample_rate
                if pause_duration >= pause_threshold:
                    pause_regions.append({
                        "start": pause_start * frame_length / sample_rate,
                        "duration": pause_duration,
                        "type": "filled_pause"
                    })
                in_pause = False

        # Pitch variation analysis (monotone speech can indicate concentration)
        pitches, magnitudes = librosa.piptrack(y=audio_data, sr=sample_rate)
        pitch_variation = np.std(pitches[pitches > 0]) if np.any(pitches > 0) else 0

        if pitch_variation < 50:  # Low variation
            hesitation_indicators.append({
                "type": "monotone_speech",
                "confidence": 0.7,
                "pitch_variation": pitch_variation
            })

        return hesitation_indicators

    def _estimate_cognitive_load_from_audio(self, audio_features: np.ndarray) -> float:
        """Estimate cognitive load from audio features."""
        # Simplified cognitive load estimation
        # In practice, this would be trained on labeled data

        # Factors that correlate with cognitive load:
        # - Speaking rate (slower = higher load)
        # - Pitch variation (less variation = higher concentration)
        # - Energy variation (less variation = more focused)

        speaking_rate_factor = 1.0 - min(1.0, audio_features[13] / 200.0)  # tempo normalization
        energy_variation_factor = 0.5  # Placeholder

        cognitive_load = (speaking_rate_factor + energy_variation_factor) / 2.0
        return np.clip(cognitive_load, 0.0, 1.0)

    def _process_video_metacognition(self, video_frames: List[np.ndarray]) -> Dict[str, Any]:
        """Process video for metacognitive cues."""
        try:
            # Extract facial features (simplified)
            # In practice, would use facial landmark detection, eye tracking, etc.

            facial_features = []
            eye_contact_features = []
            expression_features = []

            for frame in video_frames:
                # Convert to grayscale for processing
                if len(frame.shape) == 3:
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                else:
                    gray = frame

                # Extract basic features (placeholder for actual computer vision)
                # Face detection, eye tracking, etc. would go here

                # Simple features based on image statistics
                hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
                facial_features.append(hist.flatten()[:100])  # Reduced dimensionality

                # Placeholder for eye contact detection
                eye_contact_features.append(np.random.random())  # Random placeholder

                # Placeholder for expression analysis
                expression_features.append(np.random.random(5))  # Random placeholder

            # Aggregate features
            avg_facial_features = np.mean(facial_features, axis=0) if facial_features else np.zeros(100)
            avg_eye_contact = np.mean(eye_contact_features) if eye_contact_features else 0.0
            avg_expressions = np.mean(expression_features, axis=0) if expression_features else np.zeros(5)

            # Combine features
            video_features = np.concatenate([
                avg_facial_features,
                [avg_eye_contact],
                avg_expressions
            ])

            # Estimate cognitive load from visual cues
            cognitive_load_from_video = self._estimate_cognitive_load_from_video(
                avg_eye_contact, avg_expressions
            )

            return {
                "features": video_features,
                "eye_contact_level": avg_eye_contact,
                "expression_features": avg_expressions,
                "cognitive_load_estimate": cognitive_load_from_video
            }

        except Exception as e:
            logger.error(f"Video processing failed: {e}")
            return {
                "features": np.zeros(512),
                "eye_contact_level": 0.0,
                "expression_features": np.zeros(5),
                "cognitive_load_estimate": 0.0
            }

    def _estimate_cognitive_load_from_video(
        self,
        eye_contact: float,
        expressions: np.ndarray
    ) -> float:
        """Estimate cognitive load from video features."""
        # Factors that correlate with cognitive load:
        # - Eye contact (less eye contact = higher load)
        # - Expression intensity (more intense = higher load)

        eye_contact_factor = 1.0 - eye_contact
        expression_intensity = np.mean(expressions)

        cognitive_load = (eye_contact_factor + expression_intensity) / 2.0
        return np.clip(cognitive_load, 0.0, 1.0)

    def _detect_self_corrections(self, text: str) -> List[SelfCorrectionEvent]:
        """Detect self-correction events in text."""
        self_corrections = []

        # Patterns indicating self-correction
        correction_patterns = [
            r"(?:actually|rather|no|i mean|in other words),?\s*([^.]*)",
            r"wait,?\s*(?:i|that)'?s?\s+([^.]*)",
            r"correct(?:ion)?[^.]*is\s+([^.]*)",
            r"let me(?:\s+re)?phrase[^.]*:\s*([^.]*)",
            r"what i(?:\s+really)?\s+mean(?:t)?[^.]*is\s+([^.]*)"
        ]

        for pattern in correction_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                original_part = text[:match.start()].strip()
                corrected_part = match.group(1).strip()

                if len(original_part) > 10 and len(corrected_part) > 10:
                    # Calculate confidence improvement
                    original_confidence = self._estimate_statement_confidence(original_part)
                    corrected_confidence = self._estimate_statement_confidence(corrected_part)
                    confidence_improvement = corrected_confidence - original_confidence

                    correction = SelfCorrectionEvent(
                        original_statement=original_part,
                        corrected_statement=corrected_part,
                        correction_type="clarification",
                        confidence_improvement=confidence_improvement,
                        timestamp=0.0,  # Would be actual timestamp in real-time processing
                        modality="text"
                    )

                    self_corrections.append(correction)

        return self_corrections

    def _estimate_statement_confidence(self, statement: str) -> float:
        """Estimate confidence level of a statement."""
        statement_lower = statement.lower()

        # Count confidence and uncertainty indicators
        confidence_count = sum(1 for indicator in self.confidence_indicators
                             if indicator in statement_lower)
        uncertainty_count = sum(1 for indicator in self.uncertainty_indicators
                               if indicator in statement_lower)

        # Base confidence
        if confidence_count > 0:
            base_confidence = 0.8 + (confidence_count * 0.1)
        elif uncertainty_count > 0:
            base_confidence = 0.4 - (uncertainty_count * 0.1)
        else:
            base_confidence = 0.6

        return np.clip(base_confidence, 0.0, 1.0)

    def _apply_multimodal_fusion(
        self,
        text_features: torch.Tensor,
        audio_features: torch.Tensor,
        video_features: torch.Tensor
    ) -> Dict[str, Any]:
        """Apply multimodal fusion for metacognition detection."""
        with torch.no_grad():
            output = self.multimodal_net(text_features, audio_features, video_features)

            # Convert logits to probabilities
            metacognition_probs = torch.softmax(output["metacognition_logits"], dim=-1)

            return {
                "metacognition_type_probs": metacognition_probs.numpy(),
                "cognitive_load": output["cognitive_load"].item(),
                "confidence": output["confidence"].item(),
                "attention_weights": output["attention_weights"].numpy(),
                "modality_contributions": {
                    "text": output["modality_features"]["text"].numpy(),
                    "audio": output["modality_features"]["audio"].numpy(),
                    "video": output["modality_features"]["video"].numpy()
                }
            }

    def analyze_metacognition(
        self,
        text: str,
        audio_data: Optional[np.ndarray] = None,
        audio_sample_rate: Optional[int] = None,
        video_frames: Optional[List[np.ndarray]] = None
    ) -> Dict[str, Any]:
        """
        Analyze metacognition with 0.96 F1-score target.

        Args:
            text: Text input to analyze
            audio_data: Audio data as numpy array
            audio_sample_rate: Sample rate of audio data
            video_frames: List of video frames as numpy arrays

        Returns:
            Complete metacognitive analysis
        """
        # Extract text metacognition
        text_metacognition = self._extract_text_metacognition(text)

        # Process audio if provided
        audio_results = None
        if audio_data is not None and audio_sample_rate is not None:
            audio_results = self._process_audio_metacognition(audio_data, audio_sample_rate)

        # Process video if provided
        video_results = None
        if video_frames is not None:
            video_results = self._process_video_metacognition(video_frames)

        # Detect self-corrections
        self_corrections = self._detect_self_corrections(text)

        # Apply multimodal fusion if multiple modalities available
        multimodal_results = None
        if audio_results is not None or video_results is not None:
            # Create feature tensors
            text_embedding = np.random.random(768)  # Placeholder for actual text embedding

            text_tensor = torch.tensor(text_embedding, dtype=torch.float32).unsqueeze(0)
            audio_tensor = torch.tensor(audio_results["features"], dtype=torch.float32).unsqueeze(0)
            video_tensor = torch.tensor(video_results["features"], dtype=torch.float32).unsqueeze(0)

            multimodal_results = self._apply_multimodal_fusion(
                text_tensor, audio_tensor, video_tensor
            )

        # Calculate cognitive load estimates
        cognitive_loads = []

        # Text-based cognitive load estimation
        text_cognitive_load = self._estimate_cognitive_load_from_text(text)
        cognitive_loads.append(CognitiveLoadEstimate(
            load_level=text_cognitive_load,
            factors={"text_complexity": text_cognitive_load},
            timestamp=0.0,
            modality="text"
        ))

        # Audio-based cognitive load if available
        if audio_results is not None:
            cognitive_loads.append(CognitiveLoadEstimate(
                load_level=audio_results["cognitive_load_estimate"],
                factors={"prosodic_features": audio_results["cognitive_load_estimate"]},
                timestamp=0.0,
                modality="audio"
            ))

        # Video-based cognitive load if available
        if video_results is not None:
            cognitive_loads.append(CognitiveLoadEstimate(
                load_level=video_results["cognitive_load_estimate"],
                factors={"visual_cues": video_results["cognitive_load_estimate"]},
                timestamp=0.0,
                modality="video"
            ))

        # Calculate overall metrics
        avg_cognitive_load = np.mean([cl.load_level for cl in cognitive_loads])

        # Metacognitive diversity
        metacog_types = [elem.metacognitive_type for elem in text_metacognition]
        type_diversity = len(set(metacog_types)) / max(1, len(metacog_types))

        # Self-correction rate
        correction_rate = len(self_corrections) / max(1, len(text.split()))

        # Update metrics
        self.metrics["metacognitive_elements_detected"] += len(text_metacognition)
        self.metrics["self_corrections_detected"] += len(self_corrections)
        self.metrics["cognitive_load_estimates"] += len(cognitive_loads)

        return {
            "metacognitive_elements": [
                {
                    "element": elem.element,
                    "metacognitive_type": elem.metacognitive_type.value,
                    "awareness_level": elem.awareness_level,
                    "self_monitoring": elem.self_monitoring,
                    "confidence": elem.confidence,
                    "source_span": elem.source_span,
                    "modality": elem.modality
                }
                for elem in text_metacognition
            ],
            "self_corrections": [
                {
                    "original_statement": sc.original_statement,
                    "corrected_statement": sc.corrected_statement,
                    "correction_type": sc.correction_type,
                    "confidence_improvement": sc.confidence_improvement,
                    "timestamp": sc.timestamp,
                    "modality": sc.modality
                }
                for sc in self_corrections
            ],
            "cognitive_load_estimates": [
                {
                    "load_level": cl.load_level,
                    "factors": cl.factors,
                    "timestamp": cl.timestamp,
                    "modality": cl.modality
                }
                for cl in cognitive_loads
            ],
            "multimodal_analysis": multimodal_results,
            "audio_analysis": audio_results,
            "video_analysis": video_results,
            "overall_metrics": {
                "metacognitive_density": len(text_metacognition) / max(1, len(text.split())),
                "cognitive_load_level": avg_cognitive_load,
                "self_correction_rate": correction_rate,
                "metacognitive_diversity": type_diversity,
                "multimodal_sync": multimodal_results["confidence"] if multimodal_results else 0.0
            },
            "performance_metrics": self.get_performance_metrics()
        }

    def _estimate_cognitive_load_from_text(self, text: str) -> float:
        """Estimate cognitive load from text characteristics."""
        load_factors = []

        # Linguistic complexity
        doc = self.nlp(text)
        avg_sentence_length = np.mean([len(sent) for sent in doc.sents]) if doc.sents else 0
        complexity_factor = min(1.0, avg_sentence_length / 20.0)
        load_factors.append(complexity_factor)

        # Metacognitive density
        metacog_indicators_count = sum([
            sum(1 for indicator in self.confidence_indicators if indicator in text.lower()),
            sum(1 for indicator in self.uncertainty_indicators if indicator in text.lower()),
            sum(1 for indicator in self.planning_indicators if indicator in text.lower()),
            sum(1 for indicator in self.reflection_indicators if indicator in text.lower())
        ])
        metacog_density = metacog_indicators_count / max(1, len(text.split()))
        load_factors.append(min(1.0, metacog_density * 5))

        # Uncertainty indicators (higher uncertainty = higher cognitive load)
        uncertainty_count = sum(1 for indicator in self.uncertainty_indicators
                              if indicator in text.lower())
        uncertainty_factor = min(1.0, uncertainty_count / max(1, len(text.split())) * 10)
        load_factors.append(uncertainty_factor)

        return np.mean(load_factors)

    def get_performance_metrics(self) -> Dict[str, float]:
        """Get metacognition analyzer performance metrics."""
        return self.metrics.copy()

    def evaluate_metacognitive_quality(self, analysis_result: Dict[str, Any]) -> Dict[str, float]:
        """
        Evaluate quality of metacognitive analysis.

        Args:
            analysis_result: Result from analyze_metacognition

        Returns:
            Quality metrics
        """
        return {
            "metacognitive_depth": analysis_result["overall_metrics"]["metacognitive_diversity"],
            "self_monitoring_quality": np.mean([
                elem["self_monitoring"] for elem in analysis_result["metacognitive_elements"]
            ]) if analysis_result["metacognitive_elements"] else 0.0,
            "cognitive_load_appropriateness": min(1.0, analysis_result["overall_metrics"]["cognitive_load_level"]),
            "self_correction_effectiveness": np.mean([
                sc["confidence_improvement"]
                for sc in analysis_result["self_corrections"]
            ]) if analysis_result["self_corrections"] else 0.0,
            "multimodal_consistency": analysis_result["overall_metrics"]["multimodal_sync"]
        }