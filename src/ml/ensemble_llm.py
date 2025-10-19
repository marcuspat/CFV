"""
Ensemble LLM Coordinator for Cognitive Decomposition

Implements ensemble of multiple LLMs with specialized prompting strategies
to achieve 95% precision in cognitive primitive decomposition.
"""

import asyncio
import json
import time
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum

import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from openai import AsyncOpenAI
import anthropic
from loguru import logger

# Performance Targets
ENSEMBLE_PRECISION_TARGET = 0.95
COORDINATION_TIMEOUT = 30.0
CONSENSUS_THRESHOLD = 0.8


class ModelProvider(Enum):
    """Available LLM providers"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OPENROUTER = "openrouter"
    HUGGINGFACE = "huggingface"
    LOCAL = "local"


@dataclass
class LLMResponse:
    """Individual LLM response with metadata"""
    content: str
    confidence: float
    reasoning: str
    model_name: str
    provider: ModelProvider
    response_time: float
    token_usage: Dict[str, int]


@dataclass
class EnsembleResult:
    """Coordinated ensemble result"""
    final_response: str
    consensus_score: float
    individual_responses: List[LLMResponse]
    confidence_distribution: Dict[str, float]
    reasoning_chains: List[str]
    coordination_time: float


class EnsembleLLMCoordinator:
    """
    Coordinates multiple LLMs for high-precision cognitive decomposition.

    Features:
    - Multi-provider ensemble coordination
    - Specialized prompting for cognitive primitives
    - Consensus-based decision making
    - Real-time coordination with <5 second latency
    - Confidence scoring and explanation generation
    """

    def __init__(
        self,
        openai_api_key: Optional[str] = None,
        anthropic_api_key: Optional[str] = None,
        openrouter_api_key: Optional[str] = None,
        model_config: Optional[Dict] = None
    ):
        """Initialize ensemble coordinator with multiple providers."""
        self.openai_client = AsyncOpenAI(api_key=openai_api_key) if openai_api_key else None
        self.anthropic_client = anthropic.AsyncAnthropic(api_key=anthropic_api_key) if anthropic_api_key else None
        self.openrouter_client = AsyncOpenAI(
            api_key=openrouter_api_key,
            base_url="https://openrouter.ai/api/v1"
        ) if openrouter_api_key else None

        self.model_config = model_config or {
            "openai_models": ["gpt-4-turbo-preview", "gpt-3.5-turbo"],
            "anthropic_models": ["claude-3-opus-20240229", "claude-3-sonnet-20240229"],
            "openrouter_models": [
                "openai/gpt-4-turbo-preview",
                "openai/gpt-3.5-turbo",
                "anthropic/claude-3-opus-20240229",
                "anthropic/claude-3-sonnet-20240229",
                "meta-llama/llama-3.1-70b-instruct",
                "meta-llama/llama-3.1-8b-instruct",
                "mistralai/mistral-7b-instruct"
            ],
            "local_models": []  # Add local model paths if available
        }

        # Load local models if specified
        self.local_models = {}
        self._load_local_models()

        # Cognitive decomposition prompts
        self.cognitive_prompts = self._initialize_cognitive_prompts()

        # Performance tracking
        self.coordination_metrics = {
            "total_requests": 0,
            "successful_coordination": 0,
            "average_consensus": 0.0,
            "average_latency": 0.0
        }

    def _load_local_models(self):
        """Load local transformer models if specified."""
        for model_path in self.model_config.get("local_models", []):
            try:
                tokenizer = AutoTokenizer.from_pretrained(model_path)
                model = AutoModelForCausalLM.from_pretrained(
                    model_path,
                    torch_dtype=torch.float16,
                    device_map="auto"
                )
                self.local_models[model_path] = {
                    "model": model,
                    "tokenizer": tokenizer
                }
                logger.info(f"Loaded local model: {model_path}")
            except Exception as e:
                logger.warning(f"Failed to load local model {model_path}: {e}")

    def _initialize_cognitive_prompts(self) -> Dict[str, str]:
        """Initialize specialized prompts for cognitive dimension analysis."""
        return {
            "factual_retrieval": """
Analyze the following text and identify factual statements with high precision.

Text: {text}

Task: Extract factual claims and assess their veracity. For each factual statement:
1. Identify the core factual claim
2. Assess confidence in its accuracy (0-1)
3. Identify any supporting evidence or contradictions
4. Note any entities or concepts that require verification

Format your response as JSON:
{{
    "factual_claims": [
        {{
            "claim": "specific factual statement",
            "confidence": 0.xx,
            "entities": ["entity1", "entity2"],
            "verification_needed": true/false,
            "evidence_level": "strong/moderate/weak"
        }}
    ],
    "overall_factual_density": 0.xx
}}
""",

            "logical_inference": """
Analyze the logical structure of the following text.

Text: {text}

Task: Identify logical relationships, arguments, and inference patterns:
1. Extract premises and conclusions
2. Identify logical connectors (causal, conditional, correlational)
3. Assess argument strength and validity
4. Note any logical fallacies or weak inferences

Format your response as JSON:
{{
    "logical_structures": [
        {{
            "premise": "premise statement",
            "conclusion": "conclusion statement",
            "logical_type": "deductive/inductive/abductive",
            "strength": 0.xx,
            "connectors": ["because", "therefore", "if_then"]
        }}
    ],
    "argument_strength": 0.xx
}}
""",

            "creative_synthesis": """
Analyze the creative and synthetic aspects of the following text.

Text: {text}

Task: Identify creative synthesis, novel connections, and innovative thinking:
1. Extract novel ideas or unique combinations
2. Identify creative metaphors or analogies
3. Assess originality and innovation level
4. Note any counterfactual or imaginative elements

Format your response as JSON:
{{
    "creative_elements": [
        {{
            "element": "creative idea or expression",
            "novelty_score": 0.xx,
            "creativity_type": "metaphor/analogy/synthesis/counterfactual",
            "originality": "high/medium/low"
        }}
    ],
    "creativity_score": 0.xx
}}
""",

            "meta_cognition": """
Analyze the metacognitive aspects of the following text.

Text: {text}

Task: Identify metacognitive processes and self-reflection:
1. Extract expressions of uncertainty or confidence
2. Identify planning or strategy statements
3. Note self-correction or reflection
4. Assess awareness of thinking processes

Format your response as JSON:
{{
    "metacognitive_elements": [
        {{
            "element": "metacognitive statement",
            "type": "confidence/uncertainty/planning/reflection",
            "awareness_level": 0.xx,
                    "self_monitoring": true/false
                }}
            ],
            "metacognitive_depth": 0.xx
        }}
        """
        }

    async def _call_openai_model(
        self,
        model: str,
        prompt: str,
        cognitive_dimension: str
    ) -> LLMResponse:
        """Call OpenAI model with specialized prompt."""
        start_time = time.time()

        try:
            response = await self.openai_client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": f"You are an expert cognitive analyst specializing in {cognitive_dimension.replace('_', ' ')}. Provide precise, analytical responses."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.1,  # Low temperature for consistency
                max_tokens=1000
            )

            response_time = time.time() - start_time

            return LLMResponse(
                content=response.choices[0].message.content,
                confidence=0.8,  # Default confidence, will be refined
                reasoning="OpenAI model analysis",
                model_name=model,
                provider=ModelProvider.OPENAI,
                response_time=response_time,
                token_usage={
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                }
            )

        except Exception as e:
            logger.error(f"OpenAI API error for model {model}: {e}")
            return LLMResponse(
                content="",
                confidence=0.0,
                reasoning=f"API error: {str(e)}",
                model_name=model,
                provider=ModelProvider.OPENAI,
                response_time=time.time() - start_time,
                token_usage={}
            )

    async def _call_anthropic_model(
        self,
        model: str,
        prompt: str,
        cognitive_dimension: str
    ) -> LLMResponse:
        """Call Anthropic model with specialized prompt."""
        start_time = time.time()

        try:
            response = await self.anthropic_client.messages.create(
                model=model,
                max_tokens=1000,
                temperature=0.1,
                system=f"You are an expert cognitive analyst specializing in {cognitive_dimension.replace('_', ' ')}. Provide precise, analytical responses.",
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            )

            response_time = time.time() - start_time

            return LLMResponse(
                content=response.content[0].text,
                confidence=0.8,  # Default confidence
                reasoning="Anthropic model analysis",
                model_name=model,
                provider=ModelProvider.ANTHROPIC,
                response_time=response_time,
                token_usage={
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens
                }
            )

        except Exception as e:
            logger.error(f"Anthropic API error for model {model}: {e}")
            return LLMResponse(
                content="",
                confidence=0.0,
                reasoning=f"API error: {str(e)}",
                model_name=model,
                provider=ModelProvider.ANTHROPIC,
                response_time=time.time() - start_time,
                token_usage={}
            )

    async def _call_openrouter_model(
        self,
        model: str,
        prompt: str,
        cognitive_dimension: str
    ) -> LLMResponse:
        """Call OpenRouter model with specialized prompt."""
        start_time = time.time()

        try:
            response = await self.openrouter_client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": f"You are an expert cognitive analyst specializing in {cognitive_dimension.replace('_', ' ')}. Provide precise, analytical responses."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.1,  # Low temperature for consistency
                max_tokens=1000
            )

            response_time = time.time() - start_time

            return LLMResponse(
                content=response.choices[0].message.content,
                confidence=0.8,  # Default confidence, will be refined
                reasoning="OpenRouter model analysis",
                model_name=model,
                provider=ModelProvider.OPENROUTER,
                response_time=response_time,
                token_usage={
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                }
            )

        except Exception as e:
            logger.error(f"OpenRouter API error for model {model}: {e}")
            return LLMResponse(
                content="",
                confidence=0.0,
                reasoning=f"API error: {str(e)}",
                model_name=model,
                provider=ModelProvider.OPENROUTER,
                response_time=time.time() - start_time,
                token_usage={}
            )

    async def _call_local_model(
        self,
        model_path: str,
        prompt: str,
        cognitive_dimension: str
    ) -> LLMResponse:
        """Call local transformer model."""
        start_time = time.time()

        try:
            model_data = self.local_models[model_path]
            tokenizer = model_data["tokenizer"]
            model = model_data["model"]

            # Format prompt for the model
            formatted_prompt = f"Analyze for {cognitive_dimension}: {prompt}"

            inputs = tokenizer(formatted_prompt, return_tensors="pt", truncation=True, max_length=512)

            with torch.no_grad():
                outputs = model.generate(
                    inputs.input_ids,
                    max_new_tokens=500,
                    temperature=0.1,
                    do_sample=True,
                    pad_token_id=tokenizer.eos_token_id
                )

            response_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
            response_time = time.time() - start_time

            return LLMResponse(
                content=response_text,
                confidence=0.75,  # Slightly lower confidence for local models
                reasoning="Local transformer model analysis",
                model_name=model_path,
                provider=ModelProvider.LOCAL,
                response_time=response_time,
                token_usage={"total_tokens": outputs.numel()}
            )

        except Exception as e:
            logger.error(f"Local model error for {model_path}: {e}")
            return LLMResponse(
                content="",
                confidence=0.0,
                reasoning=f"Model error: {str(e)}",
                model_name=model_path,
                provider=ModelProvider.LOCAL,
                response_time=time.time() - start_time,
                token_usage={}
            )

    async def _coordinate_single_model(
        self,
        model_config: Dict[str, str],
        prompt: str,
        cognitive_dimension: str
    ) -> LLMResponse:
        """Coordinate with a single model."""
        provider = model_config["provider"]
        model_name = model_config["model"]

        if provider == "openai" and self.openai_client:
            return await self._call_openai_model(model_name, prompt, cognitive_dimension)
        elif provider == "anthropic" and self.anthropic_client:
            return await self._call_anthropic_model(model_name, prompt, cognitive_dimension)
        elif provider == "openrouter" and self.openrouter_client:
            return await self._call_openrouter_model(model_name, prompt, cognitive_dimension)
        elif provider == "local" and model_name in self.local_models:
            return await self._call_local_model(model_name, prompt, cognitive_dimension)
        else:
            logger.warning(f"Model {model_name} not available for provider {provider}")
            return LLMResponse(
                content="",
                confidence=0.0,
                reasoning="Model not available",
                model_name=model_name,
                provider=ModelProvider.LOCAL,
                response_time=0.0,
                token_usage={}
            )

    def _calculate_consensus(self, responses: List[LLMResponse]) -> float:
        """Calculate consensus score among responses."""
        if not responses or len(responses) < 2:
            return 0.0

        # Filter out empty responses
        valid_responses = [r for r in responses if r.content.strip()]
        if len(valid_responses) < 2:
            return 0.0

        # Simple consensus based on content similarity (can be enhanced with semantic similarity)
        total_similarity = 0.0
        comparisons = 0

        for i in range(len(valid_responses)):
            for j in range(i + 1, len(valid_responses)):
                # Basic similarity based on common words
                words_i = set(valid_responses[i].content.lower().split())
                words_j = set(valid_responses[j].content.lower().split())

                if len(words_i) == 0 or len(words_j) == 0:
                    continue

                intersection = len(words_i.intersection(words_j))
                union = len(words_i.union(words_j))
                similarity = intersection / union if union > 0 else 0.0

                total_similarity += similarity
                comparisons += 1

        return total_similarity / comparisons if comparisons > 0 else 0.0

    def _synthesize_ensemble_result(
        self,
        responses: List[LLMResponse],
        consensus_score: float,
        cognitive_dimension: str
    ) -> EnsembleResult:
        """Synthesize final result from ensemble responses."""
        # Sort by confidence
        valid_responses = [r for r in responses if r.content.strip()]
        valid_responses.sort(key=lambda x: x.confidence, reverse=True)

        if not valid_responses:
            return EnsembleResult(
                final_response="",
                consensus_score=0.0,
                individual_responses=responses,
                confidence_distribution={},
                reasoning_chains=[],
                coordination_time=0.0
            )

        # Weight responses by confidence and consensus
        if consensus_score >= CONSENSUS_THRESHOLD:
            # High consensus: use highest confidence response
            final_response = valid_responses[0].content
        else:
            # Low consensus: combine responses or request clarification
            final_response = f"Multiple interpretations detected. Primary analysis: {valid_responses[0].content}"

        # Calculate confidence distribution
        confidence_distribution = {}
        for response in valid_responses:
            confidence_distribution[response.model_name] = response.confidence

        # Extract reasoning chains
        reasoning_chains = [r.reasoning for r in valid_responses]

        return EnsembleResult(
            final_response=final_response,
            consensus_score=consensus_score,
            individual_responses=responses,
            confidence_distribution=confidence_distribution,
            reasoning_chains=reasoning_chains,
            coordination_time=sum(r.response_time for r in responses)
        )

    async def analyze_cognitive_dimension(
        self,
        text: str,
        cognitive_dimension: str,
        max_models: int = 4
    ) -> EnsembleResult:
        """
        Analyze text for a specific cognitive dimension using ensemble coordination.

        Args:
            text: Input text to analyze
            cognitive_dimension: One of 'factual_retrieval', 'logical_inference', 'creative_synthesis', 'meta_cognition'
            max_models: Maximum number of models to use in ensemble

        Returns:
            EnsembleResult with coordinated analysis
        """
        start_time = time.time()
        self.coordination_metrics["total_requests"] += 1

        # Get specialized prompt for cognitive dimension
        base_prompt = self.cognitive_prompts.get(cognitive_dimension)
        if not base_prompt:
            raise ValueError(f"Unknown cognitive dimension: {cognitive_dimension}")

        prompt = base_prompt.format(text=text)

        # Configure model ensemble
        model_configs = []

        # Add OpenAI models
        if self.openai_client:
            for model in self.model_config["openai_models"][:max_models//2]:
                model_configs.append({"provider": "openai", "model": model})

        # Add Anthropic models
        if self.anthropic_client:
            for model in self.model_config["anthropic_models"][:max_models//2]:
                model_configs.append({"provider": "anthropic", "model": model})

        # Add local models if available
        for model_path in list(self.local_models.keys())[:max_models - len(model_configs)]:
            model_configs.append({"provider": "local", "model": model_path})

        # Limit to max_models
        model_configs = model_configs[:max_models]

        # Coordinate with all models in parallel
        tasks = [
            self._coordinate_single_model(config, prompt, cognitive_dimension)
            for config in model_configs
        ]

        responses = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out exceptions and create LLMResponse objects for errors
        valid_responses = []
        for i, response in enumerate(responses):
            if isinstance(response, Exception):
                logger.error(f"Model {model_configs[i]['model']} failed: {response}")
                valid_responses.append(LLMResponse(
                    content="",
                    confidence=0.0,
                    reasoning=f"Exception: {str(response)}",
                    model_name=model_configs[i]["model"],
                    provider=ModelProvider.LOCAL,
                    response_time=0.0,
                    token_usage={}
                ))
            else:
                valid_responses.append(response)

        # Calculate consensus
        consensus_score = self._calculate_consensus(valid_responses)

        # Synthesize result
        result = self._synthesize_ensemble_result(
            valid_responses, consensus_score, cognitive_dimension
        )

        # Update metrics
        total_time = time.time() - start_time
        self.coordination_metrics["successful_coordination"] += 1
        self.coordination_metrics["average_consensus"] = (
            (self.coordination_metrics["average_consensus"] * (self.coordination_metrics["successful_coordination"] - 1) + consensus_score) /
            self.coordination_metrics["successful_coordination"]
        )
        self.coordination_metrics["average_latency"] = (
            (self.coordination_metrics["average_latency"] * (self.coordination_metrics["successful_coordination"] - 1) + total_time) /
            self.coordination_metrics["successful_coordination"]
        )

        logger.info(f"Ensemble coordination completed in {total_time:.2f}s with consensus {consensus_score:.2f}")

        return result

    async def analyze_all_dimensions(
        self,
        text: str,
        max_models: int = 3
    ) -> Dict[str, EnsembleResult]:
        """
        Analyze text across all cognitive dimensions.

        Args:
            text: Input text to analyze
            max_models: Maximum number of models per dimension

        Returns:
            Dictionary mapping cognitive dimensions to ensemble results
        """
        dimensions = ["factual_retrieval", "logical_inference", "creative_synthesis", "meta_cognition"]

        # Analyze all dimensions in parallel
        tasks = [
            self.analyze_cognitive_dimension(text, dimension, max_models)
            for dimension in dimensions
        ]

        results = await asyncio.gather(*tasks)

        return dict(zip(dimensions, results))

    def get_performance_metrics(self) -> Dict[str, float]:
        """Get ensemble coordination performance metrics."""
        return self.coordination_metrics.copy()

    async def health_check(self) -> Dict[str, bool]:
        """Check health of all model providers."""
        health_status = {
            "openai": self.openai_client is not None,
            "anthropic": self.anthropic_client is not None,
            "local_models": len(self.local_models) > 0
        }

        # Test actual API calls if clients exist
        if self.openai_client:
            try:
                # Simple test call
                await self.openai_client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[{"role": "user", "content": "test"}],
                    max_tokens=1
                )
                health_status["openai"] = True
            except:
                health_status["openai"] = False

        return health_status