"""
Cognitive Fabric Visualizer - Core Cognitive Decomposition Engine

This module implements the core cognitive decomposition engine that processes
conversations and breaks them down into four primary cognitive dimensions:
1. Factual Retrieval (92% accuracy target)
2. Logical Inference (85% precision target)
3. Creative Synthesis (0.60 ROUGE-L target)
4. Meta-Cognition (0.96 F1-score target)

Engine Architecture:
- Ensemble LLM coordinator with 95% precision target
- Neuro-symbolic hybrid models for cognitive primitive decomposition
- Knowledge graph integration for factual verification
- Real-time processing pipeline with <5 second latency
"""

from .cognitive_decomposer import CognitiveDecomposer
from .ensemble_llm import EnsembleLLMCoordinator
from .factual_retrieval import FactualRetrievalDetector
from .logical_inference import LogicalInferenceMapper
from .creative_synthesis import CreativeSynthesisIdentifier
from .meta_cognition import MetaCognitionAnalyzer
from .knowledge_graph import KnowledgeGraphIntegrator
from .confidence_scorer import ConfidenceScorer
from .explanation_generator import ExplanationGenerator

__version__ = "1.0.0"
__all__ = [
    "CognitiveDecomposer",
    "EnsembleLLMCoordinator",
    "FactualRetrievalDetector",
    "LogicalInferenceMapper",
    "CreativeSynthesisIdentifier",
    "MetaCognitionAnalyzer",
    "KnowledgeGraphIntegrator",
    "ConfidenceScorer",
    "ExplanationGenerator",
]