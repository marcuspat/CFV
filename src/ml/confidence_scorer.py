"""
Confidence Scoring and Explanation Generation System

Provides confidence scoring and explanations for cognitive decomposition results.
"""

import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum
import json
from loguru import logger


class ConfidenceLevel(Enum):
    """Confidence levels for cognitive analysis."""
    VERY_HIGH = "very_high"      # 0.9 - 1.0
    HIGH = "high"                # 0.75 - 0.9
    MEDIUM = "medium"            # 0.6 - 0.75
    LOW = "low"                  # 0.4 - 0.6
    VERY_LOW = "very_low"        # 0.0 - 0.4


@dataclass
class ConfidenceBreakdown:
    """Detailed breakdown of confidence factors."""
    overall_confidence: float
    dimension_confidence: Dict[str, float]
    factor_contributions: Dict[str, float]
    uncertainty_sources: List[str]
    confidence_level: ConfidenceLevel


@dataclass
class ExplanationComponent:
    """Component of a generated explanation."""
    component_type: str  # "reasoning", "evidence", "uncertainty", "confidence"
    content: str
    supporting_data: Dict[str, Any]
    confidence: float


@dataclass
class CognitiveExplanation:
    """Complete explanation for cognitive analysis."""
    summary: str
    detailed_reasoning: List[ExplanationComponent]
    confidence_breakdown: ConfidenceBreakdown
    actionable_insights: List[str]
    limitations: List[str]
    verification_suggestions: List[str]


class ConfidenceScorer:
    """
    Provides confidence scoring and explanation generation for cognitive analysis.

    Features:
    - Multi-dimensional confidence scoring
    - Uncertainty source identification
    - Explainable reasoning generation
    - Actionable insight extraction
    """

    def __init__(self):
        """Initialize confidence scorer."""
        # Confidence weighting factors
        self.dimension_weights = {
            "factual_retrieval": 0.25,
            "logical_inference": 0.25,
            "creative_synthesis": 0.25,
            "meta_cognition": 0.25
        }

        # Confidence calculation factors
        self.confidence_factors = {
            "ensemble_consensus": 0.3,
            "primitive_confidence": 0.25,
            "cross_validation": 0.2,
            "evidence_strength": 0.15,
            "coherence": 0.1
        }

        # Performance metrics
        self.metrics = {
            "total_scores_generated": 0,
            "average_confidence": 0.0,
            "high_confidence_ratio": 0.0
        }

    def calculate_overall_confidence(
        self,
        primitive_confidence: List[float],
        ensemble_consensus: Dict[str, float],
        evidence_strength: Dict[str, float],
        coherence_score: float = 0.8
    ) -> ConfidenceBreakdown:
        """
        Calculate overall confidence with detailed breakdown.

        Args:
            primitive_confidence: List of primitive confidence scores
            ensemble_consensus: Ensemble consensus scores by dimension
            evidence_strength: Evidence strength scores by dimension
            coherence_score: Overall coherence score

        Returns:
            Detailed confidence breakdown
        """
        # Calculate factor contributions
        factor_contributions = {}

        # Ensemble consensus contribution
        avg_consensus = np.mean(list(ensemble_consensus.values())) if ensemble_consensus else 0.0
        factor_contributions["ensemble_consensus"] = avg_consensus * self.confidence_factors["ensemble_consensus"]

        # Primitive confidence contribution
        avg_primitive_confidence = np.mean(primitive_confidence) if primitive_confidence else 0.0
        factor_contributions["primitive_confidence"] = avg_primitive_confidence * self.confidence_factors["primitive_confidence"]

        # Cross-validation contribution (agreement between dimensions)
        cross_validation_score = self._calculate_cross_validation(ensemble_consensus, evidence_strength)
        factor_contributions["cross_validation"] = cross_validation_score * self.confidence_factors["cross_validation"]

        # Evidence strength contribution
        avg_evidence_strength = np.mean(list(evidence_strength.values())) if evidence_strength else 0.0
        factor_contributions["evidence_strength"] = avg_evidence_strength * self.confidence_factors["evidence_strength"]

        # Coherence contribution
        factor_contributions["coherence"] = coherence_score * self.confidence_factors["coherence"]

        # Calculate overall confidence
        overall_confidence = sum(factor_contributions.values())

        # Determine confidence level
        confidence_level = self._determine_confidence_level(overall_confidence)

        # Identify uncertainty sources
        uncertainty_sources = self._identify_uncertainty_sources(
            primitive_confidence, ensemble_consensus, evidence_strength
        )

        # Dimension-specific confidence
        dimension_confidence = self._calculate_dimension_confidence(
            ensemble_consensus, evidence_strength
        )

        breakdown = ConfidenceBreakdown(
            overall_confidence=overall_confidence,
            dimension_confidence=dimension_confidence,
            factor_contributions=factor_contributions,
            uncertainty_sources=uncertainty_sources,
            confidence_level=confidence_level
        )

        # Update metrics
        self.metrics["total_scores_generated"] += 1
        self.metrics["average_confidence"] = (
            (self.metrics["average_confidence"] * (self.metrics["total_scores_generated"] - 1) + overall_confidence) /
            self.metrics["total_scores_generated"]
        )
        if overall_confidence >= 0.75:
            high_confidence_count = self.metrics.get("high_confidence_count", 0)
            self.metrics["high_confidence_count"] = high_confidence_count + 1
            self.metrics["high_confidence_ratio"] = self.metrics["high_confidence_count"] / self.metrics["total_scores_generated"]

        return breakdown

    def _calculate_cross_validation(
        self,
        ensemble_consensus: Dict[str, float],
        evidence_strength: Dict[str, float]
    ) -> float:
        """Calculate cross-validation score between ensemble and evidence."""
        if not ensemble_consensus or not evidence_strength:
            return 0.0

        # Align dimensions
        common_dimensions = set(ensemble_consensus.keys()) & set(evidence_strength.keys())
        if not common_dimensions:
            return 0.0

        # Calculate correlation
        consensus_values = [ensemble_consensus[dim] for dim in common_dimensions]
        evidence_values = [evidence_strength[dim] for dim in common_dimensions]

        # Simple correlation coefficient
        if len(consensus_values) < 2:
            return 0.5

        correlation = np.corrcoef(consensus_values, evidence_values)[0, 1]
        return max(0.0, correlation) if not np.isnan(correlation) else 0.0

    def _determine_confidence_level(self, confidence: float) -> ConfidenceLevel:
        """Determine confidence level from numeric score."""
        if confidence >= 0.9:
            return ConfidenceLevel.VERY_HIGH
        elif confidence >= 0.75:
            return ConfidenceLevel.HIGH
        elif confidence >= 0.6:
            return ConfidenceLevel.MEDIUM
        elif confidence >= 0.4:
            return ConfidenceLevel.LOW
        else:
            return ConfidenceLevel.VERY_LOW

    def _identify_uncertainty_sources(
        self,
        primitive_confidence: List[float],
        ensemble_consensus: Dict[str, float],
        evidence_strength: Dict[str, float]
    ) -> List[str]:
        """Identify sources of uncertainty in the analysis."""
        uncertainty_sources = []

        # Check primitive confidence variance
        if primitive_confidence:
            confidence_std = np.std(primitive_confidence)
            if confidence_std > 0.3:
                uncertainty_sources.append("high_variance_in_primitive_confidence")

        # Check ensemble consensus
        if ensemble_consensus:
            min_consensus = min(ensemble_consensus.values())
            if min_consensus < 0.6:
                low_consensus_dims = [dim for dim, score in ensemble_consensus.items() if score < 0.6]
                uncertainty_sources.append(f"low_ensemble_consensus_in_{low_consensus_dims}")

        # Check evidence strength
        if evidence_strength:
            min_evidence = min(evidence_strength.values())
            if min_evidence < 0.5:
                weak_evidence_dims = [dim for dim, score in evidence_strength.items() if score < 0.5]
                uncertainty_sources.append(f"weak_evidence_in_{weak_evidence_dims}")

        # General uncertainty indicators
        if not uncertainty_sources:
            if any(conf < 0.7 for conf in primitive_confidence):
                uncertainty_sources.append("generally_low_primitive_confidence")
            elif any(score < 0.7 for score in ensemble_consensus.values()):
                uncertainty_sources.append("generally_low_ensemble_consensus")

        return uncertainty_sources

    def _calculate_dimension_confidence(
        self,
        ensemble_consensus: Dict[str, float],
        evidence_strength: Dict[str, float]
    ) -> Dict[str, float]:
        """Calculate confidence scores for each cognitive dimension."""
        dimension_confidence = {}

        all_dimensions = set(self.dimension_weights.keys())

        for dimension in all_dimensions:
            ensemble_score = ensemble_consensus.get(dimension, 0.5)
            evidence_score = evidence_strength.get(dimension, 0.5)

            # Weighted combination
            dimension_confidence[dimension] = (ensemble_score * 0.6 + evidence_score * 0.4)

        return dimension_confidence

    def generate_explanation(
        self,
        analysis_result: Dict[str, Any],
        confidence_breakdown: ConfidenceBreakdown
    ) -> CognitiveExplanation:
        """
        Generate comprehensive explanation for cognitive analysis.

        Args:
            analysis_result: Complete cognitive analysis result
            confidence_breakdown: Confidence breakdown from scorer

        Returns:
            Comprehensive explanation
        """
        # Generate summary
        summary = self._generate_summary(analysis_result, confidence_breakdown)

        # Generate detailed reasoning components
        detailed_reasoning = self._generate_detailed_reasoning(analysis_result, confidence_breakdown)

        # Generate actionable insights
        actionable_insights = self._generate_actionable_insights(analysis_result, confidence_breakdown)

        # Generate limitations
        limitations = self._generate_limitations(confidence_breakdown)

        # Generate verification suggestions
        verification_suggestions = self._generate_verification_suggestions(analysis_result, confidence_breakdown)

        explanation = CognitiveExplanation(
            summary=summary,
            detailed_reasoning=detailed_reasoning,
            confidence_breakdown=confidence_breakdown,
            actionable_insights=actionable_insights,
            limitations=limitations,
            verification_suggestions=verification_suggestions
        )

        return explanation

    def _generate_summary(
        self,
        analysis_result: Dict[str, Any],
        confidence_breakdown: ConfidenceBreakdown
    ) -> str:
        """Generate concise summary of analysis."""
        overall_confidence = confidence_breakdown.overall_confidence
        confidence_level = confidence_breakdown.confidence_level.value

        # Count primitives by dimension
        primitive_counts = {}
        if "primitives" in analysis_result:
            for primitive in analysis_result["primitives"]:
                dimension = primitive.cognitive_dimension if hasattr(primitive, 'cognitive_dimension') else "unknown"
                primitive_counts[dimension] = primitive_counts.get(dimension, 0) + 1

        summary_parts = [
            f"Cognitive analysis completed with {confidence_level} confidence ({overall_confidence:.2f})."
        ]

        if primitive_counts:
            summary_parts.append("Analysis identified:")
            for dimension, count in primitive_counts.items():
                dimension_confidence = confidence_breakdown.dimension_confidence.get(dimension, 0.0)
                summary_parts.append(f"  - {count} {dimension.replace('_', ' ')} elements (confidence: {dimension_confidence:.2f})")

        if confidence_breakdown.uncertainty_sources:
            summary_parts.append(f"Main uncertainty sources: {', '.join(confidence_breakdown.uncertainty_sources)}")

        return " ".join(summary_parts)

    def _generate_detailed_reasoning(
        self,
        analysis_result: Dict[str, Any],
        confidence_breakdown: ConfidenceBreakdown
    ) -> List[ExplanationComponent]:
        """Generate detailed reasoning components."""
        components = []

        # Overall reasoning component
        overall_reasoning = ExplanationComponent(
            component_type="reasoning",
            content=f"Overall confidence is {confidence_breakdown.overall_confidence:.2f} based on multiple factors including ensemble consensus ({confidence_breakdown.factor_contributions.get('ensemble_consensus', 0.0):.2f}), primitive confidence ({confidence_breakdown.factor_contributions.get('primitive_confidence', 0.0):.2f}), and evidence strength ({confidence_breakdown.factor_contributions.get('evidence_strength', 0.0):.2f}).",
            supporting_data=confidence_breakdown.factor_contributions,
            confidence=confidence_breakdown.overall_confidence
        )
        components.append(overall_reasoning)

        # Dimension-specific reasoning
        for dimension, confidence in confidence_breakdown.dimension_confidence.items():
            dimension_reasoning = ExplanationComponent(
                component_type="reasoning",
                content=f"{dimension.replace('_', ' ').title()} analysis achieved {confidence:.2f} confidence, indicating {'strong' if confidence >= 0.8 else 'moderate' if confidence >= 0.6 else 'weak'} performance in this cognitive dimension.",
                supporting_data={"dimension": dimension, "confidence": confidence},
                confidence=confidence
            )
            components.append(dimension_reasoning)

        # Evidence component
        if "factual_analysis" in analysis_result:
            factual_claims = analysis_result["factual_analysis"].get("factual_claims", [])
            if factual_claims:
                evidence_reasoning = ExplanationComponent(
                    component_type="evidence",
                    content=f"Found {len(factual_claims)} factual claims with average confidence {np.mean([claim.get('confidence', 0.0) for claim in factual_claims]):.2f}.",
                    supporting_data={"claim_count": len(factual_claims), "claims": factual_claims[:3]},  # First 3 claims
                    confidence=np.mean([claim.get('confidence', 0.0) for claim in factual_claims])
                )
                components.append(evidence_reasoning)

        # Uncertainty component
        if confidence_breakdown.uncertainty_sources:
            uncertainty_reasoning = ExplanationComponent(
                component_type="uncertainty",
                content=f"Uncertainty primarily stems from: {', '.join(confidence_breakdown.uncertainty_sources)}. These factors should be addressed through additional evidence or validation.",
                supporting_data={"uncertainty_sources": confidence_breakdown.uncertainty_sources},
                confidence=1.0 - confidence_breakdown.overall_confidence
            )
            components.append(uncertainty_reasoning)

        return components

    def _generate_actionable_insights(
        self,
        analysis_result: Dict[str, Any],
        confidence_breakdown: ConfidenceBreakdown
    ) -> List[str]:
        """Generate actionable insights from analysis."""
        insights = []

        # Confidence-based insights
        if confidence_breakdown.overall_confidence >= 0.8:
            insights.append("High confidence analysis results can be trusted for decision-making purposes.")
        elif confidence_breakdown.overall_confidence < 0.6:
            insights.append("Low confidence suggests need for additional verification before acting on results.")

        # Dimension-specific insights
        for dimension, confidence in confidence_breakdown.dimension_confidence.items():
            if confidence >= 0.8:
                insights.append(f"Strong {dimension.replace('_', ' ')} capabilities detected - consider leveraging this strength.")
            elif confidence < 0.6:
                insights.append(f"Consider additional support for {dimension.replace('_', ' ')} development.")

        # Evidence-based insights
        if "factual_analysis" in analysis_result:
            verified_claims = analysis_result["factual_analysis"].get("verification_results", [])
            if verified_claims:
                verified_count = sum(1 for result in verified_claims if result.get("is_verified", False))
                if verified_count > 0:
                    insights.append(f"{verified_count} factual claims were verified, providing solid foundation for analysis.")

        # Performance insights
        if "processing_time" in analysis_result:
            processing_time = analysis_result["processing_time"]
            if processing_time > 5.0:
                insights.append("Processing time exceeded target - consider optimization for real-time applications.")

        return insights

    def _generate_limitations(self, confidence_breakdown: ConfidenceBreakdown) -> List[str]:
        """Generate limitations based on confidence analysis."""
        limitations = []

        # Confidence-based limitations
        if confidence_breakdown.overall_confidence < 0.8:
            limitations.append("Analysis confidence is below optimal threshold - results should be interpreted with caution.")

        # Uncertainty-based limitations
        if "low_ensemble_consensus" in str(confidence_breakdown.uncertainty_sources):
            limitations.append("Limited consensus between analytical models reduces reliability of results.")

        if "weak_evidence" in str(confidence_breakdown.uncertainty_sources):
            limitations.append("Insufficient supporting evidence for some analytical conclusions.")

        # General limitations
        limitations.append("Analysis is based on textual input only - multimodal data could improve accuracy.")
        limitations.append("Cognitive models may not capture all nuances of human thought processes.")
        limitations.append("Results are dependent on quality and completeness of input data.")

        return limitations

    def _generate_verification_suggestions(
        self,
        analysis_result: Dict[str, Any],
        confidence_breakdown: ConfidenceBreakdown
    ) -> List[str]:
        """Generate suggestions for verification and improvement."""
        suggestions = []

        # Low confidence suggestions
        if confidence_breakdown.overall_confidence < 0.7:
            suggestions.append("Seek additional data sources to strengthen analysis.")
            suggestions.append("Consider manual review of low-confidence elements.")

        # Dimension-specific suggestions
        for dimension, confidence in confidence_breakdown.dimension_confidence.items():
            if confidence < 0.6:
                suggestions.append(f"Enhance {dimension.replace('_', ' ')} analysis with domain-specific training data.")

        # Evidence verification suggestions
        if "factual_analysis" in analysis_result:
            unverified_claims = analysis_result["factual_analysis"].get("verification_results", [])
            unverified_count = sum(1 for result in unverified_claims if not result.get("is_verified", False))
            if unverified_count > 0:
                suggestions.append(f"Verify {unverified_count} unverified factual claims through additional sources.")

        # General improvement suggestions
        suggestions.append("Consider incorporating multimodal data (audio, video) for enhanced metacognitive analysis.")
        suggestions.append("Implement ensemble diversity to improve consensus and reduce bias.")
        suggestions.append("Add domain-specific knowledge graphs for better factual verification.")

        return suggestions

    def get_performance_metrics(self) -> Dict[str, float]:
        """Get confidence scorer performance metrics."""
        return self.metrics.copy()

    def export_confidence_report(
        self,
        explanation: CognitiveExplanation,
        format_type: str = "json"
    ) -> str:
        """
        Export confidence report in specified format.

        Args:
            explanation: Explanation to export
            format_type: Export format ("json", "text", "markdown")

        Returns:
            Formatted report string
        """
        if format_type == "json":
            return self._export_json(explanation)
        elif format_type == "text":
            return self._export_text(explanation)
        elif format_type == "markdown":
            return self._export_markdown(explanation)
        else:
            raise ValueError(f"Unsupported format type: {format_type}")

    def _export_json(self, explanation: CognitiveExplanation) -> str:
        """Export explanation as JSON."""
        return json.dumps({
            "summary": explanation.summary,
            "overall_confidence": explanation.confidence_breakdown.overall_confidence,
            "confidence_level": explanation.confidence_breakdown.confidence_level.value,
            "dimension_confidence": explanation.confidence_breakdown.dimension_confidence,
            "factor_contributions": explanation.confidence_breakdown.factor_contributions,
            "uncertainty_sources": explanation.confidence_breakdown.uncertainty_sources,
            "actionable_insights": explanation.actionable_insights,
            "limitations": explanation.limitations,
            "verification_suggestions": explanation.verification_suggestions
        }, indent=2)

    def _export_text(self, explanation: CognitiveExplanation) -> str:
        """Export explanation as plain text."""
        lines = [
            "COGNITIVE ANALYSIS CONFIDENCE REPORT",
            "=" * 50,
            "",
            f"Summary: {explanation.summary}",
            "",
            f"Overall Confidence: {explanation.confidence_breakdown.overall_confidence:.2f} ({explanation.confidence_breakdown.confidence_level.value})",
            "",
            "Factor Contributions:",
        ]

        for factor, contribution in explanation.confidence_breakdown.factor_contributions.items():
            lines.append(f"  - {factor}: {contribution:.2f}")

        lines.extend([
            "",
            "Dimension Confidence:",
        ])

        for dimension, confidence in explanation.confidence_breakdown.dimension_confidence.items():
            lines.append(f"  - {dimension}: {confidence:.2f}")

        if explanation.confidence_breakdown.uncertainty_sources:
            lines.extend([
                "",
                "Uncertainty Sources:",
                f"  - {', '.join(explanation.confidence_breakdown.uncertainty_sources)}"
            ])

        lines.extend([
            "",
            "Actionable Insights:",
        ])

        for insight in explanation.actionable_insights:
            lines.append(f"  - {insight}")

        lines.extend([
            "",
            "Limitations:",
        ])

        for limitation in explanation.limitations:
            lines.append(f"  - {limitation}")

        lines.extend([
            "",
            "Verification Suggestions:",
        ])

        for suggestion in explanation.verification_suggestions:
            lines.append(f"  - {suggestion}")

        return "\n".join(lines)

    def _export_markdown(self, explanation: CognitiveExplanation) -> str:
        """Export explanation as Markdown."""
        lines = [
            "# Cognitive Analysis Confidence Report",
            "",
            f"**Summary:** {explanation.summary}",
            "",
            f"**Overall Confidence:** {explanation.confidence_breakdown.overall_confidence:.2f} ({explanation.confidence_breakdown.confidence_level.value})",
            "",
            "## Factor Contributions",
            ""
        ]

        for factor, contribution in explanation.confidence_breakdown.factor_contributions.items():
            lines.append(f"- **{factor}:** {contribution:.2f}")

        lines.extend([
            "",
            "## Dimension Confidence",
            ""
        ])

        for dimension, confidence in explanation.confidence_breakdown.dimension_confidence.items():
            lines.append(f"- **{dimension}:** {confidence:.2f}")

        if explanation.confidence_breakdown.uncertainty_sources:
            lines.extend([
                "",
                "## Uncertainty Sources",
                "",
                f"{', '.join(explanation.confidence_breakdown.uncertainty_sources)}"
            ])

        lines.extend([
            "",
            "## Actionable Insights",
            ""
        ])

        for insight in explanation.actionable_insights:
            lines.append(f"- {insight}")

        lines.extend([
            "",
            "## Limitations",
            ""
        ])

        for limitation in explanation.limitations:
            lines.append(f"- {limitation}")

        lines.extend([
            "",
            "## Verification Suggestions",
            ""
        ])

        for suggestion in explanation.verification_suggestions:
            lines.append(f"- {suggestion}")

        return "\n".join(lines)