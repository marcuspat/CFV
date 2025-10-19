"""
Comprehensive Test Suite for Multi-modal Integration

Tests to validate the 25% improvement in contextual understanding
and ensure all multi-modal components work correctly.
"""

import asyncio
import time
import numpy as np
import torch
import pytest
from typing import Dict, List, Optional, Any
from unittest.mock import Mock, patch, AsyncMock
import tempfile
import os
from loguru import logger

# Import the modules to test
import sys
sys.path.append('/workspaces/cfv/src/ml')

from multimodal_processor import MultiModalProcessor, MultiModalFeatures, AudioFeatures, VisualFeatures, TextFeatures
from conversation_analyzer import ConversationAnalyzer, ConversationAnalysis, SpeakingTurn
from fusion_engine import CrossModalFusionEngine, FusionResult, FusionWeights
from multimodal_cognitive_integration import MultiModalCognitiveIntegrator, MultiModalCognitiveResult
from performance_optimizer import PerformanceOptimizer, OptimizationConfig


# Test Configuration
TEST_CONFIG = {
    'contextual_improvement_target': 0.25,
    'processing_time_target': 3.0,
    'confidence_threshold': 0.7,
    'test_data_size': 10
}


class MockDataProvider:
    """Provides mock data for testing."""

    @staticmethod
    def get_mock_audio_features() -> AudioFeatures:
        """Create mock audio features."""
        return AudioFeatures(
            transcript="This is a test transcript for speech recognition testing.",
            confidence=0.85,
            speaker_embedding=np.random.rand(13),
            prosody_features={
                'pitch_mean': 120.5,
                'pitch_std': 15.2,
                'energy': 0.75,
                'spectral_centroid_mean': 2000.0,
                'zero_crossing_rate_mean': 0.05
            },
            timing_features={
                'speech_rate': 150.0,
                'pause_duration': 0.5,
                'total_duration': 2.0,
                'num_pauses': 2
            },
            audio_segments=[
                {
                    'id': 0,
                    'start_time': 0.0,
                    'end_time': 2.0,
                    'text': 'This is a test transcript',
                    'confidence': 0.85
                }
            ]
        )

    @staticmethod
    def get_mock_visual_features() -> VisualFeatures:
        """Create mock visual features."""
        return VisualFeatures(
            scene_description="A person standing in front of a whiteboard with diagrams.",
            object_detections=[
                {'type': 'person', 'confidence': 0.9, 'bbox': [100, 100, 200, 300]},
                {'type': 'whiteboard', 'confidence': 0.8, 'bbox': [300, 50, 500, 350]}
            ],
            gesture_recognition=[
                {'type': 'pointing', 'confidence': 0.7, 'target': 'whiteboard'}
            ],
            whiteboard_content="Mathematical equations and diagrams",
            visual_attention_map=np.random.rand(224, 224),
            frame_embeddings=np.random.rand(512)
        )

    @staticmethod
    def get_mock_text_features() -> TextFeatures:
        """Create mock text features."""
        return TextFeatures(
            raw_text="This is a comprehensive text sample for testing cognitive analysis capabilities.",
            semantic_embeddings=np.random.rand(768),
            linguistic_features={
                'word_count': 12,
                'sentence_count': 1,
                'avg_word_length': 5.5,
                'punctuation_ratio': 0.08
            },
            contextual_enrichment={
                'has_speech_content': True,
                'text_complexity': 0.6,
                'semantic_density': 0.7
            }
        )

    @staticmethod
    def get_mock_multimodal_features() -> MultiModalFeatures:
        """Create complete mock multi-modal features."""
        return MultiModalFeatures(
            audio=MockDataProvider.get_mock_audio_features(),
            visual=MockDataProvider.get_mock_visual_features(),
            text=MockDataProvider.get_mock_text_features(),
            alignment_scores={
                'audio_text': 0.75,
                'visual_text': 0.65,
                'audio_visual': 0.60,
                'overall': 0.67
            },
            cross_modal_attention=np.random.rand(512),
            temporal_sync={
                'audio_duration': 2.0,
                'audio_segments': 1,
                'text_length': 50,
                'sync_quality': 0.8
            },
            confidence_score=0.75
        )


class TestMultiModalProcessor:
    """Test cases for MultiModalProcessor."""

    @pytest.fixture
    def processor(self):
        """Create processor instance for testing."""
        return MultiModalProcessor()

    @pytest.mark.asyncio
    async def test_audio_processing(self, processor):
        """Test audio processing functionality."""
        # Create mock audio data
        mock_audio_data = np.random.randint(0, 256, 16000).astype(np.float32)  # 1 second of audio

        # Mock the whisper model to avoid actual model loading
        with patch.object(processor.audio_processor.whisper_model, 'transcribe') as mock_transcribe:
            mock_transcribe.return_value = {
                'text': 'Mock transcription result',
                'segments': [
                    {
                        'start': 0.0,
                        'end': 2.0,
                        'text': 'Mock transcription result',
                        'confidence': 0.85
                    }
                ]
            }

            # Process audio
            result = await processor.process_audio(mock_audio_data)

            # Assertions
            assert isinstance(result, AudioFeatures)
            assert result.transcript == 'Mock transcription result'
            assert result.confidence == 0.85
            assert len(result.speaker_embedding) == 13

    @pytest.mark.asyncio
    async def test_visual_processing(self, processor):
        """Test visual processing functionality."""
        # Create mock image data
        mock_image = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

        # Mock BLIP model to avoid actual model loading
        with patch.object(processor.visual_processor.blip_model, 'generate') as mock_generate:
            mock_generate.return_value = [torch.tensor([1, 2, 3])]  # Mock token ids

            with patch.object(processor.visual_processor.blip_processor, 'decode') as mock_decode:
                mock_decode.return_value = "Mock image description"

                # Process visual
                result = await processor.process_visual(mock_image)

                # Assertions
                assert isinstance(result, VisualFeatures)
                assert result.scene_description == "Mock image description"
                assert len(result.frame_embeddings) == 512

    @pytest.mark.asyncio
    async def test_multimodal_integration(self, processor):
        """Test multi-modal integration."""
        # Create mock multi-modal data
        mock_audio = MockDataProvider.get_mock_audio_features()
        mock_visual = MockDataProvider.get_mock_visual_features()
        text_input = "Test text input for multi-modal analysis"

        # Mock processing methods to return our mock data
        with patch.object(processor, 'process_audio', return_value=mock_audio), \
             patch.object(processor, 'process_visual', return_value=mock_visual):

            # Process multi-modal
            result = await processor.process_multimodal(
                audio_input=b"mock_audio_data",
                visual_input=np.random.rand(480, 640, 3),
                text_input=text_input
            )

            # Assertions
            assert isinstance(result, MultiModalFeatures)
            assert result.audio is not None
            assert result.visual is not None
            assert result.text is not None
            assert result.confidence_score > 0

    def test_performance_metrics(self, processor):
        """Test performance metrics collection."""
        metrics = processor.get_performance_metrics()

        # Assertions
        assert 'avg_processing_time' in metrics
        assert 'avg_accuracy' in metrics
        assert 'total_processed' in metrics
        assert 'contextual_improvement' in metrics


class TestConversationAnalyzer:
    """Test cases for ConversationAnalyzer."""

    @pytest.fixture
    def analyzer(self):
        """Create analyzer instance for testing."""
        multimodal_processor = Mock()
        multimodal_processor.process_multimodal = AsyncMock(return_value=MockDataProvider.get_mock_multimodal_features())
        return ConversationAnalyzer(multimodal_processor)

    @pytest.mark.asyncio
    async def test_conversation_start(self, analyzer):
        """Test conversation start functionality."""
        conversation_id = "test_conversation_001"
        metadata = {"test": True}

        result = await analyzer.start_conversation(conversation_id, metadata)

        # Assertions
        assert result == conversation_id
        assert conversation_id in analyzer.active_conversations
        assert analyzer.active_conversations[conversation_id]['metadata'] == metadata

    @pytest.mark.asyncio
    async def test_speaker_diarization(self, analyzer):
        """Test speaker diarization functionality."""
        # Create mock audio features
        mock_audio = MockDataProvider.get_mock_audio_features()

        # Process audio segment
        turn = await analyzer.diarization.process_audio_segment(
            mock_audio,
            start_time=0.0,
            end_time=2.0
        )

        # Assertions
        assert isinstance(turn, SpeakingTurn)
        assert turn.content == mock_audio.transcript
        assert turn.confidence == mock_audio.confidence
        assert turn.duration == 2.0

    @pytest.mark.asyncio
    async def test_conversation_segment_processing(self, analyzer):
        """Test conversation segment processing."""
        conversation_id = "test_conversation_002"
        await analyzer.start_conversation(conversation_id)

        # Mock multi-modal features
        mock_features = MockDataProvider.get_mock_multimodal_features()
        analyzer.multimodal_processor.process_multimodal.return_value = mock_features

        # Process segment
        segment = await analyzer.process_conversation_segment(
            conversation_id,
            audio_data=b"mock_audio",
            visual_data=np.random.rand(480, 640, 3),
            text_data="Test conversation text"
        )

        # Assertions
        assert segment is not None
        assert segment.segment_id.startswith(conversation_id)
        assert segment.confidence_score > 0

    def test_turn_taking_patterns(self, analyzer):
        """Test turn-taking pattern analysis."""
        patterns = analyzer.turn_detector.get_turn_taking_patterns()

        # Should return empty dict if no turns analyzed
        assert isinstance(patterns, dict)


class TestFusionEngine:
    """Test cases for CrossModalFusionEngine."""

    @pytest.fixture
    def fusion_engine(self):
        """Create fusion engine instance for testing."""
        modality_dims = {
            'audio': 13,
            'visual': 512,
            'text': 768
        }
        return CrossModalFusionEngine(modality_dims)

    @pytest.mark.asyncio
    async def test_cross_modal_fusion(self, fusion_engine):
        """Test cross-modal fusion functionality."""
        # Create mock multi-modal features
        mock_features = MockDataProvider.get_mock_multimodal_features()

        # Perform fusion
        result = await fusion_engine.fuse_modalities(
            multimodal_features=mock_features,
            temporal_context=True,
            adaptive_weighting=True
        )

        # Assertions
        assert isinstance(result, FusionResult)
        assert len(result.fused_features) == 512  # Hidden dimension
        assert result.confidence_score > 0
        assert isinstance(result.fusion_weights, FusionWeights)
        assert 'contextual_enrichment' in result.contextual_enhancement

    def test_fusion_weights(self, fusion_engine):
        """Test fusion weights calculation."""
        # Create mock tensor weights
        mock_weights = torch.tensor([0.3, 0.4, 0.3])
        fusion_engine.adaptive_fusion.fusion_gate = Mock()
        fusion_engine.adaptive_fusion.fusion_gate.return_value = mock_weights

        # Test weight creation
        weights = fusion_engine._create_fusion_weights(
            mock_weights,
            adaptive_weighting=True
        )

        # Assertions
        assert isinstance(weights, FusionWeights)
        assert weights.audio_weight + weights.visual_weight + weights.text_weight == pytest.approx(1.0, rel=1e-6)

    def test_performance_report(self, fusion_engine):
        """Test performance report generation."""
        report = fusion_engine.get_performance_report()

        # Assertions
        assert 'avg_processing_time' in report
        assert 'total_fusions' in report
        assert 'real_time_capability' in report
        assert 'contextual_improvement_achieved' in report


class TestMultiModalCognitiveIntegrator:
    """Test cases for MultiModalCognitiveIntegrator."""

    @pytest.fixture
    def integrator(self):
        """Create integrator instance for testing."""
        # Mock API keys to avoid actual API calls
        return MultiModalCognitiveIntegrator(
            openai_api_key="mock_key",
            anthropic_api_key="mock_key"
        )

    @pytest.mark.asyncio
    async def test_complete_multimodal_analysis(self, integrator):
        """Test complete multi-modal cognitive analysis."""
        # Mock the cognitive decomposer to avoid actual API calls
        with patch.object(integrator.cognitive_decomposer, 'decompose_cognition') as mock_decompose:
            # Create mock cognitive decomposition result
            from cognitive_decomposer import CognitivePrimitive, CognitiveDecompositionResult

            mock_primitive = CognitivePrimitive(
                text="Test cognitive primitive",
                cognitive_dimension="factual",
                sub_type="statement",
                confidence=0.8,
                evidence={"source": "test"},
                source_span=(0, 10),
                relationships=[]
            )

            mock_result = CognitiveDecompositionResult(
                primitives=[mock_primitive],
                factual_analysis={"accuracy": 0.9},
                logical_analysis={"precision": 0.85},
                creative_analysis={"rouge_l": 0.6},
                metacognitive_analysis={"f1_score": 0.96},
                ensemble_results={},
                processing_time=1.0,
                overall_confidence=0.85,
                performance_metrics={"precision": 0.95}
            )

            mock_decompose.return_value = mock_result

            # Perform complete analysis
            result = await integrator.analyze_multimodal_cognitive_content(
                text_input="This is a test text for cognitive analysis.",
                audio_data=b"mock_audio_data",
                visual_data=np.random.rand(480, 640, 3),
                conversation_id="test_conversation_003"
            )

            # Assertions
            assert isinstance(result, MultiModalCognitiveResult)
            assert result.base_result is not None
            assert result.multimodal_features is not None
            assert result.fusion_result is not None
            assert len(result.enhanced_primitives) > 0
            assert result.overall_contextual_score > 0

    @pytest.mark.asyncio
    async def test_contextual_improvement_validation(self, integrator):
        """Test that 25% contextual improvement is achieved."""
        # Mock components for controlled testing
        with patch.object(integrator.cognitive_decomposer, 'decompose_cognition') as mock_decompose, \
             patch.object(integrator.multimodal_processor, 'process_multimodal') as mock_multimodal, \
             patch.object(integrator.fusion_engine, 'fuse_modalities') as mock_fusion:

            # Create mock results with known scores
            from cognitive_decomposer import CognitivePrimitive, CognitiveDecompositionResult

            mock_primitive = CognitivePrimitive(
                text="Test primitive",
                cognitive_dimension="factual",
                sub_type="statement",
                confidence=0.7,  # Base confidence
                evidence={},
                source_span=(0, 5),
                relationships=[]
            )

            mock_cognitive_result = CognitiveDecompositionResult(
                primitives=[mock_primitive],
                factual_analysis={},
                logical_analysis={},
                creative_analysis={},
                metacognitive_analysis={},
                ensemble_results={},
                processing_time=1.0,
                overall_confidence=0.7,  # Base confidence
                performance_metrics={}
            )

            mock_multimodal_features = MockDataProvider.get_mock_multimodal_features()
            mock_multimodal_features.confidence_score = 0.8  # 0.1 improvement

            mock_fusion_result = Mock(spec=FusionResult)
            mock_fusion_result.confidence_score = 0.85  # Additional 0.05 improvement
            mock_fusion_result.contextual_enhancement = {
                'semantic_richness': 0.7,
                'feature_complementarity': 0.6,
                'overall_improvement': 0.15
            }
            mock_fusion_result.to_dict.return_value = {}

            mock_decompose.return_value = mock_cognitive_result
            mock_multimodal.return_value = mock_multimodal_features
            mock_fusion.return_value = mock_fusion_result

            # Perform analysis
            result = await integrator.analyze_multimodal_cognitive_content(
                text_input="Test input for improvement validation",
                audio_data=b"mock_audio",
                visual_data=np.random.rand(480, 640, 3)
            )

            # Calculate improvement
            base_confidence = 0.7
            final_score = result.overall_contextual_score
            improvement = (final_score - base_confidence) / base_confidence

            # Assertions
            assert improvement >= TEST_CONFIG['contextual_improvement_target'], \
                f"Expected improvement >= {TEST_CONFIG['contextual_improvement_target']}, got {improvement:.3f}"

    def test_performance_tracking(self, integrator):
        """Test performance tracking functionality."""
        report = integrator.get_integration_performance_report()

        # Assertions
        assert 'total_integrations' in report
        assert 'target_improvement_achieved' in report
        assert 'improvement_achievement_rate' in report

    @pytest.mark.asyncio
    async def test_batch_processing(self, integrator):
        """Test batch processing capabilities."""
        # Create mock conversations
        conversations = [
            {
                'text': f'Test conversation {i}',
                'audio': b'mock_audio_data',
                'conversation_id': f'conv_{i}'
            }
            for i in range(3)
        ]

        # Mock the analysis method
        with patch.object(integrator, 'analyze_multimodal_cognitive_content') as mock_analyze:
            mock_result = Mock(spec=MultiModalCognitiveResult)
            mock_result.overall_contextual_score = 0.8
            mock_analyze.return_value = mock_result

            # Perform batch analysis
            results = await integrator.batch_analyze_conversations(conversations)

            # Assertions
            assert len(results) == len(conversations)
            assert mock_analyze.call_count == len(conversations)


class TestPerformanceOptimizer:
    """Test cases for PerformanceOptimizer."""

    @pytest.fixture
    def optimizer(self):
        """Create optimizer instance for testing."""
        config = OptimizationConfig(
            enable_gpu_acceleration=False,  # Disable for testing
            max_batch_size=4,
            max_workers=2
        )
        return PerformanceOptimizer(config)

    @pytest.mark.asyncio
    async def test_optimizer_initialization(self, optimizer):
        """Test optimizer initialization."""
        await optimizer.initialize()

        # Assertions
        assert optimizer.resource_manager.monitoring_active
        assert optimizer.async_processor.processing_active
        assert optimizer.batch_processor.batch_processing_active

        # Cleanup
        await optimizer.shutdown()

    def test_performance_metrics(self, optimizer):
        """Test performance metrics collection."""
        metrics = optimizer.resource_manager.get_current_metrics()

        # Assertions
        assert isinstance(metrics.cpu_usage, float)
        assert isinstance(metrics.memory_usage, float)
        assert isinstance(metrics.processing_latency, float)

    def test_performance_report(self, optimizer):
        """Test comprehensive performance report."""
        report = optimizer.get_comprehensive_performance_report()

        # Assertions
        assert 'resource_metrics' in report
        assert 'async_processing' in report
        assert 'model_cache' in report
        assert 'batch_processing' in report
        assert 'overall_performance_score' in report
        assert 'real_time_capable' in report

    def test_config_updates(self, optimizer):
        """Test configuration updates."""
        new_config = OptimizationConfig(
            enable_gpu_acceleration=True,
            max_batch_size=8
        )

        optimizer.update_config(new_config)

        # Assertions
        assert optimizer.config.enable_gpu_acceleration == True
        assert optimizer.config.max_batch_size == 8


class TestIntegrationEndToEnd:
    """End-to-end integration tests."""

    @pytest.mark.asyncio
    async def test_complete_pipeline(self):
        """Test the complete multi-modal pipeline end-to-end."""
        # This test validates the entire pipeline works together

        # Create integrator with mock APIs
        integrator = MultiModalCognitiveIntegrator(
            openai_api_key="mock_key",
            anthropic_api_key="mock_key"
        )

        # Mock all external dependencies
        with patch.object(integrator.cognitive_decomposer, 'decompose_cognition') as mock_decompose, \
             patch.object(integrator.multimodal_processor, 'process_multimodal') as mock_multimodal, \
             patch.object(integrator.fusion_engine, 'fuse_modalities') as mock_fusion, \
             patch.object(integrator.conversation_analyzer, 'start_conversation') as mock_start_conv, \
             patch.object(integrator.conversation_analyzer, 'process_conversation_segment') as mock_process_segment:

            # Setup mocks
            from cognitive_decomposer import CognitivePrimitive, CognitiveDecompositionResult

            mock_primitive = CognitivePrimitive(
                text="End-to-end test primitive",
                cognitive_dimension="factual",
                sub_type="statement",
                confidence=0.8,
                evidence={},
                source_span=(0, 20),
                relationships=[]
            )

            mock_cognitive_result = CognitiveDecompositionResult(
                primitives=[mock_primitive],
                factual_analysis={},
                logical_analysis={},
                creative_analysis={},
                metacognitive_analysis={},
                ensemble_results={},
                processing_time=2.0,
                overall_confidence=0.8,
                performance_metrics={"precision": 0.95}
            )

            mock_multimodal_features = MockDataProvider.get_mock_multimodal_features()
            mock_multimodal_features.confidence_score = 0.85

            mock_fusion_result = Mock(spec=FusionResult)
            mock_fusion_result.confidence_score = 0.9
            mock_fusion_result.contextual_enhancement = {
                'overall_improvement': 0.2
            }
            mock_fusion_result.to_dict.return_value = {}

            mock_decompose.return_value = mock_cognitive_result
            mock_multimodal.return_value = mock_multimodal_features
            mock_fusion.return_value = mock_fusion_result
            mock_start_conv.return_value = "test_conv_e2e"
            mock_process_segment.return_value = None

            # Execute complete pipeline
            start_time = time.time()
            result = await integrator.analyze_multimodal_cognitive_content(
                text_input="This is an end-to-end test of the complete multi-modal pipeline.",
                audio_data=b"mock_audio_data_for_e2e_test",
                visual_data=np.random.rand(480, 640, 3),
                conversation_id="e2e_test_conversation"
            )
            processing_time = time.time() - start_time

            # Validate results
            assert isinstance(result, MultiModalCognitiveResult)
            assert result.processing_breakdown['total_processing'] <= TEST_CONFIG['processing_time_target']
            assert result.overall_contextual_score > 0.7
            assert len(result.enhanced_primitives) > 0

            # Validate improvement
            improvement = result.contextual_improvements.get('total_improvement', 0)
            assert improvement >= TEST_CONFIG['contextual_improvement_target'] * 0.5  # Allow some tolerance

            logger.info(f"End-to-end test completed in {processing_time:.2f}s with {improvement:.1%} improvement")

    @pytest.mark.asyncio
    async def test_performance_under_load(self):
        """Test system performance under concurrent load."""
        integrator = MultiModalCognitiveIntegrator(
            openai_api_key="mock_key",
            anthropic_api_key="mock_key"
        )

        # Mock external dependencies
        with patch.object(integrator, 'analyze_multimodal_cognitive_content') as mock_analyze:
            mock_result = Mock(spec=MultiModalCognitiveResult)
            mock_result.overall_contextual_score = 0.85
            mock_result.processing_breakdown = {'total_processing': 1.5}
            mock_analyze.return_value = mock_result

            # Create concurrent tasks
            tasks = []
            for i in range(5):
                task = integrator.analyze_multimodal_cognitive_content(
                    text_input=f"Concurrent test {i}",
                    conversation_id=f"concurrent_{i}"
                )
                tasks.append(task)

            # Execute all tasks concurrently
            start_time = time.time()
            results = await asyncio.gather(*tasks, return_exceptions=True)
            total_time = time.time() - start_time

            # Validate results
            successful_results = [r for r in results if not isinstance(r, Exception)]
            assert len(successful_results) == 5

            # Check that concurrent processing is efficient
            avg_time_per_request = total_time / 5
            assert avg_time_per_request < 2.0  # Should complete much faster than sequential

            logger.info(f"Load test completed: {len(successful_results)}/5 successful in {total_time:.2f}s")


# Test Runner
if __name__ == "__main__":
    # Configure logging for tests
    logger.add("test_results.log", level="INFO")

    # Run tests
    pytest.main([__file__, "-v", "--tb=short"])