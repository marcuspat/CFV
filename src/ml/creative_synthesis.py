"""
Creative Synthesis Identifier with Neuro-Symbolic Generative AI

Implements creative synthesis detection with 0.60 ROUGE-L target using:
- Neuro-symbolic generative AI for novelty detection
- Counterfactual reasoning analysis
- Abstractive summarization for innovation identification
"""

import torch
import torch.nn as nn
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum

import spacy
from transformers import (
    AutoTokenizer, AutoModelForSeq2SeqLM, AutoModelForCausalLM,
    pipeline, GPT2LMHeadModel, GPT2Tokenizer
)
from sentence_transformers import SentenceTransformer
import networkx as nx
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.cluster import KMeans
import re
from loguru import logger

# Performance Targets
CREATIVE_ROUGE_L_TARGET = 0.60
NOVELTY_THRESHOLD = 0.7
COUNTERFACTUAL_CONFIDENCE = 0.65


class CreativityType(Enum):
    """Types of creative expression."""
    METAPHOR = "metaphor"
    ANALOGY = "analogy"
    SYNTHESIS = "synthesis"
    COUNTERFACTUAL = "counterfactual"
    INNOVATIVE = "innovative"


@dataclass
class CreativeElement:
    """Represents a creative element in text."""
    element: str
    creativity_type: CreativityType
    novelty_score: float
    originality: str  # "high", "medium", "low"
    confidence: float
    source_span: Tuple[int, int]
    semantic_distance: float
    contextual_surprise: float


@dataclass
class CounterfactualScenario:
    """Represents a counterfactual reasoning scenario."""
    premise: str
    counterfactual: str
    likelihood: float
    creativity_score: float
    confidence: float
    source_span: Tuple[int, int]


@dataclass
class InnovationPattern:
    """Represents an innovative pattern or idea."""
    pattern: str
    novelty_score: float
    practicality: float
    impact_score: float
    supporting_concepts: List[str]
    confidence: float


class NeuroSymbolicCreativeNet(nn.Module):
    """Neuro-symbolic network for creative synthesis detection."""

    def __init__(self, input_dim: int = 768, hidden_dim: int = 256, output_dim: int = 128):
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.output_dim = output_dim

        # Neural components
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, output_dim)
        )

        # Symbolic reasoning layers
        self.symbolic_gate = nn.Sequential(
            nn.Linear(output_dim, hidden_dim // 2),
            nn.Tanh(),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid()
        )

        self.novelty_detector = nn.Sequential(
            nn.Linear(output_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid()
        )

        self.creativity_classifier = nn.Sequential(
            nn.Linear(output_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, len(CreativityType))
        )

    def forward(self, x):
        """Forward pass through neuro-symbolic network."""
        # Neural encoding
        encoded = self.encoder(x)

        # Symbolic reasoning
        symbolic_weight = self.symbolic_gate(encoded)
        novelty_score = self.novelty_detector(encoded)
        creativity_logits = self.creativity_classifier(encoded)

        return {
            "encoded": encoded,
            "symbolic_weight": symbolic_weight,
            "novelty_score": novelty_score,
            "creativity_logits": creativity_logits
        }


class CreativeSynthesisIdentifier:
    """
    Identifies creative synthesis with 0.60 ROUGE-L target using neuro-symbolic AI.

    Features:
    - Neuro-symbolic generative AI for novelty detection
    - Counterfactual reasoning analysis
    - Abstractive summarization for innovation identification
    - Semantic distance measurement for originality assessment
    """

    def __init__(
        self,
        sentence_model: str = "all-MiniLM-L6-v2",
        generative_model: str = "facebook/bart-large-cnn",
        gpt_model: str = "gpt2"
    ):
        """Initialize creative synthesis identifier."""
        # Load NLP models
        try:
            self.nlp = spacy.load("en_core_web_lg")
        except OSError:
            self.nlp = spacy.load("en_core_web_sm")

        # Load sentence transformer for semantic similarity
        self.sentence_model = SentenceTransformer(sentence_model)

        # Load generative models
        self.tokenizer = AutoTokenizer.from_pretrained(generative_model)
        self.generative_model = AutoModelForSeq2SeqLM.from_pretrained(generative_model)

        # Load GPT model for counterfactual generation
        self.gpt_tokenizer = GPT2Tokenizer.from_pretrained(gpt_model)
        self.gpt_model = GPT2LMHeadModel.from_pretrained(gpt_model)
        if self.gpt_tokenizer.pad_token is None:
            self.gpt_tokenizer.pad_token = self.gpt_tokenizer.eos_token

        # Initialize neuro-symbolic network
        self.neuro_symbolic_net = NeuroSymbolicCreativeNet()
        self.neuro_symbolic_net.eval()

        # Creative pattern recognition
        self.creative_patterns = {
            CreativityType.METAPHOR: [
                r"(\w+) is (a|an) (\w+)",
                r"(\w+) like (a|an) (\w+)",
                r"(\w+) as (\w+) as"
            ],
            CreativityType.ANALOGY: [
                r"just as (\w+), so too (\w+)",
                r"(\w+) is to (\w+) as (\w+) is to (\w+)",
                r"similar to how (\w+), (\w+)"
            ],
            CreativityType.SYNTHESIS: [
                r"combines? (\w+) and (\w+)",
                r"integrates? (\w+) with (\w+)",
                r"merges? (\w+) and (\w+)"
            ],
            CreativityType.COUNTERFACTUAL: [
                r"if (\w+) had (\w+), (\w+) would have (\w+)",
                r"had (\w+) (\w+), (\w+) would have (\w+)",
                r"without (\w+), (\w+) would not have (\w+)"
            ]
        }

        # Innovation indicators
        self.innovation_indicators = [
            "breakthrough", "revolutionary", "novel", "innovative",
            "pioneering", "groundbreaking", "unprecedented", "paradigm shift"
        ]

        # Performance metrics
        self.metrics = {
            "creative_elements_detected": 0,
            "novelty_scores": [],
            "creativity_scores": [],
            "rouge_l_scores": [],
            "counterfactual_scenarios": 0
        }

    def _calculate_semantic_distance(
        self,
        text1: str,
        text2: str,
        reference_corpus: List[str] = None
    ) -> float:
        """Calculate semantic distance between two texts."""
        embeddings = self.sentence_model.encode([text1, text2])

        # Cosine similarity
        similarity = cosine_similarity([embeddings[0]], [embeddings[1]])[0][0]
        distance = 1 - similarity  # Convert to distance

        # If reference corpus is provided, calculate contextual distance
        if reference_corpus:
            ref_embeddings = self.sentence_model.encode(reference_corpus)

            # Calculate average similarity to reference corpus
            sim1 = np.mean(cosine_similarity([embeddings[0]], ref_embeddings))
            sim2 = np.mean(cosine_similarity([embeddings[1]], ref_embeddings))

            # Adjust distance based on reference corpus similarity
            contextual_factor = abs(sim1 - sim2)
            distance = distance * (1 + contextual_factor)

        return min(1.0, distance)  # Cap at 1.0

    def _identify_creative_patterns(self, doc: spacy.tokens.Doc) -> List[CreativeElement]:
        """Identify creative patterns in the document."""
        creative_elements = []
        text = doc.text

        for creativity_type, patterns in self.creative_patterns.items():
            for pattern in patterns:
                for match in re.finditer(pattern, text, re.IGNORECASE):
                    element_text = match.group()
                    start_pos = match.start()
                    end_pos = match.end()

                    # Calculate semantic distance to expected patterns
                    semantic_distance = self._calculate_semantic_distance(
                        element_text,
                        self._get_prototypical_example(creativity_type)
                    )

                    # Calculate contextual surprise
                    contextual_surprise = self._calculate_contextual_surprise(
                        element_text, text, start_pos, end_pos
                    )

                    # Calculate novelty score
                    novelty_score = self._calculate_novelty_score(
                        element_text, creativity_type, semantic_distance, contextual_surprise
                    )

                    # Determine originality
                    originality = self._determine_originality(novelty_score)

                    # Calculate confidence
                    confidence = self._calculate_creative_confidence(
                        element_text, creativity_type, semantic_distance
                    )

                    if novelty_score >= NOVELTY_THRESHOLD:
                        creative_element = CreativeElement(
                            element=element_text,
                            creativity_type=creativity_type,
                            novelty_score=novelty_score,
                            originality=originality,
                            confidence=confidence,
                            source_span=(start_pos, end_pos),
                            semantic_distance=semantic_distance,
                            contextual_surprise=contextual_surprise
                        )
                        creative_elements.append(creative_element)

        return creative_elements

    def _get_prototypical_example(self, creativity_type: CreativityType) -> str:
        """Get prototypical example for creativity type."""
        examples = {
            CreativityType.METAPHOR: "Time is money",
            CreativityType.ANALOGY: "The heart is like a pump",
            CreativityType.SYNTHESIS: "This technology combines AI and human creativity",
            CreativityType.COUNTERFACTUAL: "If I had studied harder, I would have passed"
        }
        return examples.get(creativity_type, "creative expression")

    def _calculate_contextual_surprise(
        self,
        element: str,
        full_text: str,
        start_pos: int,
        end_pos: int
    ) -> float:
        """Calculate contextual surprise of an element."""
        # Get context window
        context_window = 100
        context_start = max(0, start_pos - context_window)
        context_end = min(len(full_text), end_pos + context_window)
        context = full_text[context_start:context_end]

        # Calculate semantic similarity between element and context
        element_embedding = self.sentence_model.encode([element])
        context_embedding = self.sentence_model.encode([context])

        similarity = cosine_similarity(element_embedding, context_embedding)[0][0]
        surprise = 1 - similarity  # Convert to surprise

        return min(1.0, surprise)

    def _calculate_novelty_score(
        self,
        element: str,
        creativity_type: CreativityType,
        semantic_distance: float,
        contextual_surprise: float
    ) -> float:
        """Calculate novelty score for a creative element."""
        novelty_factors = []

        # Semantic distance factor
        novelty_factors.append(semantic_distance)

        # Contextual surprise factor
        novelty_factors.append(contextual_surprise)

        # Type-specific novelty
        type_novelty = {
            CreativityType.METAPHOR: 0.7,
            CreativityType.ANALOGY: 0.8,
            CreativityType.SYNTHESIS: 0.9,
            CreativityType.COUNTERFACTUAL: 0.85
        }
        novelty_factors.append(type_novelty.get(creativity_type, 0.5))

        # Length complexity (longer expressions can be more novel)
        length_factor = min(1.0, len(element.split()) / 10.0)
        novelty_factors.append(length_factor)

        return np.mean(novelty_factors)

    def _determine_originality(self, novelty_score: float) -> str:
        """Determine originality level from novelty score."""
        if novelty_score >= 0.8:
            return "high"
        elif novelty_score >= 0.6:
            return "medium"
        else:
            return "low"

    def _calculate_creative_confidence(
        self,
        element: str,
        creativity_type: CreativityType,
        semantic_distance: float
    ) -> float:
        """Calculate confidence in creative element identification."""
        confidence_factors = []

        # Pattern match confidence
        pattern_confidence = 0.8 if creativity_type != CreativityType.INNOVATIVE else 0.6
        confidence_factors.append(pattern_confidence)

        # Semantic distance confidence
        if semantic_distance >= 0.7:
            confidence_factors.append(0.9)
        elif semantic_distance >= 0.5:
            confidence_factors.append(0.7)
        else:
            confidence_factors.append(0.5)

        # Text clarity
        clarity_factor = min(1.0, len(element.split()) / 5.0)
        confidence_factors.append(clarity_factor)

        return np.mean(confidence_factors)

    def _detect_counterfactual_scenarios(self, doc: spacy.tokens.Doc) -> List[CounterfactualScenario]:
        """Detect counterfactual reasoning scenarios."""
        counterfactuals = []
        text = doc.text

        patterns = self.creative_patterns[CreativityType.COUNTERFACTUAL]

        for pattern in patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                scenario_text = match.group()
                start_pos = match.start()
                end_pos = match.end()

                # Extract premise and counterfactual parts
                parts = self._parse_counterfactual(scenario_text)
                if not parts:
                    continue

                premise, counterfactual = parts

                # Calculate likelihood (how plausible is the counterfactual)
                likelihood = self._calculate_counterfactual_likelihood(premise, counterfactual)

                # Calculate creativity score
                creativity_score = self._calculate_counterfactual_creativity(
                    premise, counterfactual
                )

                # Calculate confidence
                confidence = min(1.0, likelihood * creativity_score)

                if confidence >= COUNTERFACTUAL_CONFIDENCE:
                    scenario = CounterfactualScenario(
                        premise=premise,
                        counterfactual=counterfactual,
                        likelihood=likelihood,
                        creativity_score=creativity_score,
                        confidence=confidence,
                        source_span=(start_pos, end_pos)
                    )
                    counterfactuals.append(scenario)

        return counterfactuals

    def _parse_counterfactual(self, scenario_text: str) -> Optional[Tuple[str, str]]:
        """Parse counterfactual scenario into premise and counterfactual."""
        # Simplified parsing - could be enhanced with NLP
        if "if" in scenario_text.lower():
            parts = scenario_text.lower().split("if", 1)
            if len(parts) > 1:
                premise_part = "if" + parts[1]
                # Find the conclusion part
                conclusion_indicators = ["then", "would", "could", "might"]
                for indicator in conclusion_indicators:
                    if indicator in premise_part:
                        counterfactual_part = premise_part.split(indicator, 1)[1]
                        return premise_part.strip(), counterfactual_part.strip()

        return None

    def _calculate_counterfactual_likelihood(
        self,
        premise: str,
        counterfactual: str
    ) -> float:
        """Calculate likelihood of counterfactual scenario."""
        # Simplified likelihood calculation
        likelihood_factors = []

        # Temporal plausibility
        if any(word in premise.lower() for word in ["had", "was", "were"]):
            likelihood_factors.append(0.7)
        else:
            likelihood_factors.append(0.5)

        # Logical consistency
        premise_embedding = self.sentence_model.encode([premise])
        counterfactual_embedding = self.sentence_model.encode([counterfactual])

        consistency = cosine_similarity(premise_embedding, counterfactual_embedding)[0][0]
        likelihood_factors.append(max(0.3, consistency))  # Minimum 0.3

        return np.mean(likelihood_factors)

    def _calculate_counterfactual_creativity(
        self,
        premise: str,
        counterfactual: str
    ) -> float:
        """Calculate creativity score of counterfactual."""
        creativity_factors = []

        # Novelty of counterfactual
        semantic_distance = self._calculate_semantic_distance(premise, counterfactual)
        creativity_factors.append(semantic_distance)

        # Complexity of reasoning
        complexity = len(counterfactual.split()) / 10.0
        creativity_factors.append(min(1.0, complexity))

        # Surprise factor
        surprise = self._calculate_contextual_surprise(counterfactual, premise, 0, len(premise))
        creativity_factors.append(surprise)

        return np.mean(creativity_factors)

    def _detect_innovation_patterns(self, doc: spacy.tokens.Doc) -> List[InnovationPattern]:
        """Detect innovative patterns and ideas."""
        innovations = []

        # Look for innovation indicators
        for sent in doc.sents:
            sent_text = sent.text.lower()

            if any(indicator in sent_text for indicator in self.innovation_indicators):
                # Extract the innovative concept
                innovation_pattern = self._extract_innovation_pattern(sent)

                if innovation_pattern:
                    innovations.append(innovation_pattern)

        return innovations

    def _extract_innovation_pattern(self, sent: spacy.tokens.Span) -> Optional[InnovationPattern]:
        """Extract innovation pattern from sentence."""
        # Find key innovation concepts
        innovation_concepts = []

        for token in sent:
            if token.pos_ in ["NOUN", "ADJ"] and len(token.text) > 3:
                innovation_concepts.append(token.text)

        if not innovation_concepts:
            return None

        # Calculate novelty based on semantic distance to common concepts
        common_concepts = ["technology", "method", "approach", "system", "process"]
        pattern_text = " ".join(innovation_concepts)

        max_distance = 0.0
        for concept in common_concepts:
            distance = self._calculate_semantic_distance(pattern_text, concept)
            max_distance = max(max_distance, distance)

        novelty_score = max_distance

        # Calculate practicality and impact
        practicality = self._calculate_practicality(sent.text)
        impact_score = self._calculate_impact_score(sent.text)

        # Calculate confidence
        confidence = (novelty_score + practicality + impact_score) / 3.0

        return InnovationPattern(
            pattern=pattern_text,
            novelty_score=novelty_score,
            practicality=practicality,
            impact_score=impact_score,
            supporting_concepts=innovation_concepts,
            confidence=confidence
        )

    def _calculate_practicality(self, text: str) -> float:
        """Calculate practicality score of an innovation."""
        practicality_indicators = [
            "feasible", "practical", "implementable", "usable",
            "efficient", "effective", "scalable"
        ]

        text_lower = text.lower()
        indicator_count = sum(1 for indicator in practicality_indicators if indicator in text_lower)

        return min(1.0, indicator_count / 3.0)

    def _calculate_impact_score(self, text: str) -> float:
        """Calculate potential impact score of an innovation."""
        impact_indicators = [
            "transformative", "revolutionary", "breakthrough",
            "game-changing", "paradigm shift", "disruptive"
        ]

        text_lower = text.lower()
        indicator_count = sum(1 for indicator in impact_indicators if indicator in text_lower)

        return min(1.0, indicator_count / 2.0)

    def _apply_neuro_symbolic_analysis(
        self,
        text_embedding: torch.Tensor
    ) -> Dict[str, Any]:
        """Apply neuro-symbolic network for creativity analysis."""
        with torch.no_grad():
            output = self.neuro_symbolic_net(text_embedding)

            return {
                "encoded_representation": output["encoded"].numpy(),
                "symbolic_weight": output["symbolic_weight"].item(),
                "novelty_score": output["novelty_score"].item(),
                "creativity_type_probs": torch.softmax(output["creativity_logits"], dim=-1).numpy()
            }

    def _calculate_rouge_l(self, reference: str, candidate: str) -> float:
        """Calculate ROUGE-L score for creative synthesis evaluation."""
        # Simple ROUGE-L implementation
        reference_tokens = reference.lower().split()
        candidate_tokens = candidate.lower().split()

        # Find longest common subsequence
        m, n = len(reference_tokens), len(candidate_tokens)
        dp = [[0] * (n + 1) for _ in range(m + 1)]

        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if reference_tokens[i - 1] == candidate_tokens[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1] + 1
                else:
                    dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])

        lcs_length = dp[m][n]

        # Precision, recall, and F1
        precision = lcs_length / max(1, n)
        recall = lcs_length / max(1, m)

        if precision + recall == 0:
            return 0.0

        f1 = 2 * precision * recall / (precision + recall)
        return f1

    def analyze_creative_synthesis(self, text: str) -> Dict[str, Any]:
        """
        Analyze creative synthesis in text with 0.60 ROUGE-L target.

        Args:
            text: Input text to analyze

        Returns:
            Complete creative analysis results
        """
        doc = self.nlp(text)

        # Identify creative patterns
        creative_elements = self._identify_creative_patterns(doc)

        # Detect counterfactual scenarios
        counterfactuals = self._detect_counterfactual_scenarios(doc)

        # Detect innovation patterns
        innovations = self._detect_innovation_patterns(doc)

        # Apply neuro-symbolic analysis
        text_embedding = self.sentence_model.encode([text])
        text_tensor = torch.tensor(text_embedding, dtype=torch.float32)

        neuro_symbolic_results = self._apply_neuro_symbolic_analysis(text_tensor)

        # Generate abstractive summary for innovation identification
        if len(text) > 100:
            summary = self._generate_abstractive_summary(text)
            summary_rouge = self._calculate_rouge_l(text, summary)
        else:
            summary = text
            summary_rouge = 1.0

        # Calculate overall creativity metrics
        novelty_scores = [elem.novelty_score for elem in creative_elements]
        avg_novelty = np.mean(novelty_scores) if novelty_scores else 0.0

        confidence_scores = [elem.confidence for elem in creative_elements]
        avg_confidence = np.mean(confidence_scores) if confidence_scores else 0.0

        creativity_scores = [
            elem.novelty_score * elem.confidence
            for elem in creative_elements
        ]
        avg_creativity = np.mean(creativity_scores) if creativity_scores else 0.0

        # Update metrics
        self.metrics["creative_elements_detected"] += len(creative_elements)
        self.metrics["novelty_scores"].extend(novelty_scores)
        self.metrics["creativity_scores"].extend(creativity_scores)
        self.metrics["rouge_l_scores"].append(summary_rouge)
        self.metrics["counterfactual_scenarios"] += len(counterfactuals)

        return {
            "creative_elements": [
                {
                    "element": elem.element,
                    "creativity_type": elem.creativity_type.value,
                    "novelty_score": elem.novelty_score,
                    "originality": elem.originality,
                    "confidence": elem.confidence,
                    "source_span": elem.source_span,
                    "semantic_distance": elem.semantic_distance,
                    "contextual_surprise": elem.contextual_surprise
                }
                for elem in creative_elements
            ],
            "counterfactual_scenarios": [
                {
                    "premise": cf.premise,
                    "counterfactual": cf.counterfactual,
                    "likelihood": cf.likelihood,
                    "creativity_score": cf.creativity_score,
                    "confidence": cf.confidence,
                    "source_span": cf.source_span
                }
                for cf in counterfactuals
            ],
            "innovation_patterns": [
                {
                    "pattern": innovation.pattern,
                    "novelty_score": innovation.novelty_score,
                    "practicality": innovation.practicality,
                    "impact_score": innovation.impact_score,
                    "supporting_concepts": innovation.supporting_concepts,
                    "confidence": innovation.confidence
                }
                for innovation in innovations
            ],
            "neuro_symbolic_analysis": {
                "symbolic_weight": neuro_symbolic_results["symbolic_weight"],
                "neural_novelty_score": neuro_symbolic_results["novelty_score"],
                "creativity_type_probabilities": neuro_symbolic_results["creativity_type_probs"].tolist()
            },
            "abstractive_summary": {
                "summary": summary,
                "rouge_l_score": summary_rouge
            },
            "overall_metrics": {
                "creativity_score": avg_creativity,
                "novelty_score": avg_novelty,
                "confidence_score": avg_confidence,
                "creative_density": len(creative_elements) / max(1, len(text.split())),
                "innovation_density": len(innovations) / max(1, len(text.split())),
                "counterfactual_density": len(counterfactuals) / max(1, len(text.split()))
            },
            "performance_metrics": self.get_performance_metrics()
        }

    def _generate_abstractive_summary(self, text: str) -> str:
        """Generate abstractive summary for innovation identification."""
        try:
            inputs = self.tokenizer(text, max_length=512, truncation=True, return_tensors="pt")

            with torch.no_grad():
                summary_ids = self.generative_model.generate(
                    inputs.input_ids,
                    max_length=150,
                    min_length=50,
                    length_penalty=2.0,
                    num_beams=4,
                    early_stopping=True
                )

            summary = self.tokenizer.decode(summary_ids[0], skip_special_tokens=True)
            return summary

        except Exception as e:
            logger.error(f"Summary generation failed: {e}")
            # Fallback to simple extractive summary
            sentences = text.split('.')
            return '. '.join(sentences[:2]) + '.' if len(sentences) > 2 else text

    def get_performance_metrics(self) -> Dict[str, float]:
        """Get creative synthesis performance metrics."""
        metrics = self.metrics.copy()

        # Calculate averages
        if metrics["novelty_scores"]:
            metrics["average_novelty"] = np.mean(metrics["novelty_scores"])
        else:
            metrics["average_novelty"] = 0.0

        if metrics["creativity_scores"]:
            metrics["average_creativity"] = np.mean(metrics["creativity_scores"])
        else:
            metrics["average_creativity"] = 0.0

        if metrics["rouge_l_scores"]:
            metrics["average_rouge_l"] = np.mean(metrics["rouge_l_scores"])
        else:
            metrics["average_rouge_l"] = 0.0

        return metrics

    def evaluate_creative_potential(self, text: str) -> Dict[str, float]:
        """
        Evaluate creative potential of text.

        Args:
            text: Text to evaluate

        Returns:
            Creative potential metrics
        """
        analysis = self.analyze_creative_synthesis(text)

        return {
            "overall_creativity": analysis["overall_metrics"]["creativity_score"],
            "novelty_factor": analysis["overall_metrics"]["novelty_score"],
            "innovation_potential": analysis["overall_metrics"]["innovation_density"],
            "counterfactual_reasoning": analysis["overall_metrics"]["counterfactual_density"],
            "neural_symbolic_alignment": analysis["neuro_symbolic_analysis"]["symbolic_weight"],
            "summary_quality": analysis["abstractive_summary"]["rouge_l_score"]
        }