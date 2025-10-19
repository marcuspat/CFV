"""
Basic usage example for Cognitive Fabric Visualizer ML Engine

Demonstrates core functionality and API usage patterns.
"""

import asyncio
import sys
import os

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from ml.cognitive_decomposer import CognitiveDecomposer
from ml.confidence_scorer import ConfidenceScorer
import json


async def basic_analysis_example():
    """Basic cognitive analysis example."""
    print("=== Basic Cognitive Analysis Example ===")

    # Sample text for analysis
    text = """
    According to recent climate research, global temperatures have risen by 1.1°C since pre-industrial levels.
    Scientists warn that if we don't reduce carbon emissions by 45% by 2030, we will face irreversible climate damage.
    This innovative approach combines renewable energy with carbon capture technology.
    I think this represents our best hope, but we must act quickly and decisively.
    """

    # Initialize components (with mock APIs for demo)
    decomposer = CognitiveDecomposer(
        openai_api_key=None,  # Set your API key
        anthropic_api_key=None,  # Set your API key
        neo4j_uri="bolt://localhost:7687"
    )

    scorer = ConfidenceScorer()

    try:
        # Perform cognitive decomposition
        print("Starting cognitive analysis...")
        result = await decomposer.decompose_cognition(
            text=text,
            use_ensemble=False,  # Disabled for demo without API keys
            use_specialized_analyzers=True
        )

        print(f"Analysis completed in {result.processing_time:.2f} seconds")
        print(f"Overall confidence: {result.overall_confidence:.2f}")
        print(f"Primitives found: {len(result.primitives)}")

        # Display primitives by dimension
        from collections import defaultdict
        primitives_by_dimension = defaultdict(list)
        for primitive in result.primitives:
            primitives_by_dimension[primitive.cognitive_dimension].append(primitive)

        print("\n=== Cognitive Dimensions Analysis ===")
        for dimension, primitives in primitives_by_dimension.items():
            print(f"\n{dimension.replace('_', ' ').title()}: {len(primitives)} elements")
            for primitive in primitives[:3]:  # Show first 3
                print(f"  - {primitive.text[:100]}... (confidence: {primitive.confidence:.2f})")

        # Calculate confidence scoring
        primitive_confidence = [p.confidence for p in result.primitives]
        ensemble_consensus = {
            dim: res.consensus_score for dim, res in result.ensemble_results.items()
        } if result.ensemble_results else {}
        evidence_strength = {
            "factual_retrieval": result.factual_analysis.get("overall_metrics", {}).get("average_confidence", 0.5),
            "logical_inference": result.logical_analysis.get("overall_metrics", {}).get("argument_strength", 0.5),
            "creative_synthesis": result.creative_analysis.get("overall_metrics", {}).get("creativity_score", 0.5),
            "meta_cognition": result.metacognitive_analysis.get("overall_metrics", {}).get("confidence_score", 0.5)
        }

        confidence_breakdown = scorer.calculate_overall_confidence(
            primitive_confidence, ensemble_consensus, evidence_strength
        )

        print(f"\n=== Confidence Analysis ===")
        print(f"Overall confidence: {confidence_breakdown.overall_confidence:.2f}")
        print(f"Confidence level: {confidence_breakdown.confidence_level.value}")

        print("\nDimension confidence:")
        for dimension, confidence in confidence_breakdown.dimension_confidence.items():
            print(f"  - {dimension.replace('_', ' ')}: {confidence:.2f}")

        print("\nFactor contributions:")
        for factor, contribution in confidence_breakdown.factor_contributions.items():
            print(f"  - {factor}: {contribution:.2f}")

        # Generate explanation
        analysis_dict = {
            "primitives": [
                {
                    "text": p.text,
                    "cognitive_dimension": p.cognitive_dimension,
                    "confidence": p.confidence
                }
                for p in result.primitives
            ],
            "factual_analysis": result.factual_analysis,
            "logical_analysis": result.logical_analysis,
            "creative_analysis": result.creative_analysis,
            "metacognitive_analysis": result.metacognitive_analysis
        }

        explanation = scorer.generate_explanation(analysis_dict, confidence_breakdown)

        print(f"\n=== Analysis Summary ===")
        print(explanation.summary)

        print(f"\n=== Actionable Insights ===")
        for insight in explanation.actionable_insights:
            print(f"• {insight}")

        print(f"\n=== Limitations ===")
        for limitation in explanation.limitations:
            print(f"• {limitation}")

        # Performance metrics
        print(f"\n=== Performance Metrics ===")
        metrics = decomposer.get_performance_metrics()
        print(f"Total decompositions: {metrics['total_decompositions']}")
        print(f"Average processing time: {metrics['average_processing_time']:.2f}s")
        print(f"Precision score: {metrics['precision_score']:.2f}")

        # Validate performance targets
        validation = decomposer.validate_performance_targets()
        print(f"\n=== Performance Target Validation ===")
        for target, met in validation.items():
            status = "✅ MET" if met else "❌ NOT MET"
            print(f"{target}: {status}")

    except Exception as e:
        print(f"Analysis failed: {e}")
        import traceback
        traceback.print_exc()

    finally:
        # Cleanup
        decomposer.close()


async def individual_analyzer_examples():
    """Demonstrate individual cognitive analyzers."""
    print("\n\n=== Individual Analyzer Examples ===")

    from ml.factual_retrieval import FactualRetrievalDetector
    from ml.logical_inference import LogicalInferenceMapper
    from ml.creative_synthesis import CreativeSynthesisIdentifier
    from ml.meta_cognition import MetaCognitionAnalyzer

    # Sample texts for different analyses
    factual_text = "The Earth orbits around the Sun at a distance of approximately 93 million miles."
    logical_text = "Because the climate is changing, we must reduce carbon emissions. Therefore, investing in renewable energy is essential."
    creative_text = "The algorithm weaves through data like a digital spider, creating patterns that dance with insight."
    metacog_text = "I'm not entirely confident about this approach, but I believe we should reconsider our strategy."

    try:
        # Factual retrieval
        print("\n--- Factual Retrieval Analysis ---")
        factual_detector = FactualRetrievalDetector()
        factual_result = factual_detector.analyze_text(factual_text)

        print(f"Factual claims: {len(factual_result['factual_claims'])}")
        for claim in factual_result['factual_claims']:
            print(f"  - Claim: {claim['claim']}")
            print(f"    Confidence: {claim['confidence']:.2f}")
            print(f"    Evidence level: {claim['evidence_level']}")

        # Logical inference
        print("\n--- Logical Inference Analysis ---")
        logical_mapper = LogicalInferenceMapper()
        logical_result = logical_mapper.analyze_logical_structure(logical_text)

        print(f"Arguments: {len(logical_result['arguments'])}")
        for arg in logical_result['arguments']:
            print(f"  - Type: {arg['argument_type']}")
            print(f"    Strength: {arg['strength']:.2f}")
            print(f"    Premises: {arg['premises']}")
            print(f"    Conclusion: {arg['conclusion']}")

        # Creative synthesis
        print("\n--- Creative Synthesis Analysis ---")
        # Note: This might require GPU/ML models that aren't loaded in demo
        try:
            creative_identifier = CreativeSynthesisIdentifier()
            creative_result = creative_identifier.analyze_creative_synthesis(creative_text)

            print(f"Creative elements: {len(creative_result['creative_elements'])}")
            for element in creative_result['creative_elements'][:3]:
                print(f"  - Element: {element['element']}")
                print(f"    Type: {element['creativity_type']}")
                print(f"    Novelty: {element['novelty_score']:.2f}")
        except Exception as e:
            print(f"Creative synthesis analysis skipped (requires ML models): {e}")

        # Metacognition
        print("\n--- Metacognitive Analysis ---")
        metacog_analyzer = MetaCognitionAnalyzer()
        metacog_result = metacog_analyzer.analyze_metacognition(metacog_text)

        print(f"Metacognitive elements: {len(metacog_result['metacognitive_elements'])}")
        for element in metacog_result['metacognitive_elements']:
            print(f"  - Element: {element['element']}")
            print(f"    Type: {element['metacognitive_type']}")
            print(f"    Awareness: {element['awareness_level']:.2f}")

    except Exception as e:
        print(f"Individual analyzer analysis failed: {e}")
        import traceback
        traceback.print_exc()


async def streaming_analysis_example():
    """Demonstrate streaming analysis for long texts."""
    print("\n\n=== Streaming Analysis Example ===")

    # Create a long text by concatenating multiple examples
    long_text = """
    Climate change represents one of the most significant challenges of our time. According to the Intergovernmental Panel on Climate Change, global temperatures have already risen by 1.1°C above pre-industrial levels.

    The scientific consensus is clear: human activities, particularly the burning of fossil fuels, are the primary driver of this warming. This causes greenhouse gases to accumulate in the atmosphere, trapping heat and altering weather patterns worldwide.

    Innovative solutions are emerging from various sectors. Renewable energy technologies, particularly solar and wind power, have become increasingly cost-effective. Carbon capture and storage systems offer promising ways to remove existing CO2 from the atmosphere.

    I believe we need a multifaceted approach that combines technological innovation with policy changes and behavioral modifications. While the challenge is daunting, the consequences of inaction are far more severe. We must act decisively and quickly.

    If we implement these solutions at scale, we might still avoid the worst impacts of climate change. However, this requires unprecedented global cooperation and investment.
    """ * 3  # Repeat to make it longer

    decomposer = CognitiveDecomposer(
        openai_api_key=None,
        anthropic_api_key=None
    )

    try:
        print("Starting streaming analysis...")
        print(f"Text length: {len(long_text)} characters")

        start_time = asyncio.get_event_loop().time()
        results = await decomposer.decompose_streaming(long_text, chunk_size=500)
        total_time = asyncio.get_event_loop().time() - start_time

        print(f"Streaming analysis completed in {total_time:.2f} seconds")
        print(f"Processed {len(results)} chunks")

        total_primitives = sum(len(result.primitives) for result in results)
        print(f"Total primitives found: {total_primitives}")

        for i, result in enumerate(results):
            print(f"Chunk {i+1}: {len(result.primitives)} primitives, confidence: {result.overall_confidence:.2f}")

    except Exception as e:
        print(f"Streaming analysis failed: {e}")
        import traceback
        traceback.print_exc()

    finally:
        decomposer.close()


async def confidence_scoring_example():
    """Demonstrate confidence scoring and explanation generation."""
    print("\n\n=== Confidence Scoring Example ===")

    scorer = ConfidenceScorer()

    # Mock analysis data
    primitive_confidence = [0.85, 0.92, 0.78, 0.88, 0.91]
    ensemble_consensus = {
        "factual_retrieval": 0.88,
        "logical_inference": 0.82,
        "creative_synthesis": 0.75,
        "meta_cognition": 0.90
    }
    evidence_strength = {
        "factual_retrieval": 0.90,
        "logical_inference": 0.85,
        "creative_synthesis": 0.70,
        "meta_cognition": 0.88
    }

    # Calculate confidence breakdown
    breakdown = scorer.calculate_overall_confidence(
        primitive_confidence, ensemble_consensus, evidence_strength
    )

    print("=== Confidence Breakdown ===")
    print(f"Overall confidence: {breakdown.overall_confidence:.2f}")
    print(f"Confidence level: {breakdown.confidence_level.value}")

    print("\nDimension confidence:")
    for dimension, confidence in breakdown.dimension_confidence.items():
        print(f"  {dimension}: {confidence:.2f}")

    print("\nFactor contributions:")
    for factor, contribution in breakdown.factor_contributions.items():
        print(f"  {factor}: {contribution:.2f}")

    if breakdown.uncertainty_sources:
        print(f"\nUncertainty sources:")
        for source in breakdown.uncertainty_sources:
            print(f"  - {source}")

    # Export reports
    mock_analysis = {
        "primitives": [
            {"cognitive_dimension": "factual_retrieval", "confidence": 0.85},
            {"cognitive_dimension": "logical_inference", "confidence": 0.82}
        ],
        "overall_metrics": {"average_confidence": 0.84}
    }

    explanation = scorer.generate_explanation(mock_analysis, breakdown)

    print(f"\n=== Generated Explanation ===")
    print(f"Summary: {explanation.summary}")

    print(f"\nActionable Insights:")
    for insight in explanation.actionable_insights:
        print(f"• {insight}")

    # Export to different formats
    print(f"\n=== Export Examples ===")

    json_report = scorer.export_confidence_report(explanation, "json")
    print(f"JSON report length: {len(json_report)} characters")

    text_report = scorer.export_confidence_report(explanation, "text")
    print(f"Text report length: {len(text_report)} characters")
    print("First 200 characters:")
    print(text_report[:200] + "...")

    markdown_report = scorer.export_confidence_report(explanation, "markdown")
    print(f"Markdown report length: {len(markdown_report)} characters")


async def main():
    """Run all examples."""
    print("Cognitive Fabric Visualizer - Basic Usage Examples")
    print("=" * 60)

    await basic_analysis_example()
    await individual_analyzer_examples()
    await streaming_analysis_example()
    await confidence_scoring_example()

    print("\n" + "=" * 60)
    print("Examples completed! 🎉")
    print("\nTo run with real API keys:")
    print("1. Set OPENAI_API_KEY and ANTHROPIC_API_KEY environment variables")
    print("2. Ensure Neo4j is running and accessible")
    print("3. Run: python basic_usage.py")


if __name__ == "__main__":
    asyncio.run(main())