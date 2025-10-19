"""
Explanation Export System for Cognitive Fabric Visualizer
Implements comprehensive export functionality with user validation tracking
Target: Support multiple formats with 95% user validation integration
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Union, BinaryIO
import json
import logging
from dataclasses import dataclass, asdict, field
from enum import Enum
from datetime import datetime, timedelta
import io
import base64
import hashlib
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET
from xml.dom import minidom
import matplotlib.pyplot as plt
import seaborn as sns
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors

# Import our explainability components
from .explainability import ExplanationResult, ExplanationType
from .feedback_system import InteractiveFeedbackSystem, FeedbackType
from .uncertainty_quantification import UncertaintyAnalysis
from .symbolic_reasoning import SymbolicReasoningEngine, Rule

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ExportFormat(Enum):
    """Supported export formats"""
    JSON = "json"
    TEXT = "text"
    CSV = "csv"
    XML = "xml"
    PDF = "pdf"
    HTML = "html"
    MARKDOWN = "markdown"
    EXCEL = "excel"
    DETAILED = "detailed"
    SUMMARY = "summary"

class ValidationLevel(Enum):
    """Validation levels for export quality"""
    BASIC = "basic"
    STANDARD = "standard"
    COMPREHENSIVE = "comprehensive"
    RESEARCH = "research"

@dataclass
class ExportMetadata:
    """Metadata for exported explanations"""
    export_id: str
    format: ExportFormat
    validation_level: ValidationLevel
    created_at: datetime
    created_by: str
    explanation_ids: List[str]
    user_validation_score: float
    file_size: int = 0
    checksum: str = ""
    includes_visualizations: bool = False
    includes_raw_data: bool = False
    includes_feedback: bool = False

@dataclass
class ExportConfiguration:
    """Configuration for export process"""
    format: ExportFormat
    validation_level: ValidationLevel
    include_visualizations: bool = False
    include_raw_data: bool = False
    include_feedback: bool = False
    include_uncertainty: bool = True
    include_symbolic_rules: bool = True
    compression: bool = False
    watermark: Optional[str] = None
    custom_template: Optional[str] = None
    max_file_size: int = 50 * 1024 * 1024  # 50MB

@dataclass
class ValidationResult:
    """Result of export validation"""
    is_valid: bool
    validation_score: float
    issues: List[str]
    warnings: List[str]
    recommendations: List[str]
    processing_time: float

class ExplanationExporter:
    """
    Comprehensive explanation export system
    Supports multiple formats with user validation integration
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize explanation exporter

        Args:
            config: Configuration dictionary
        """
        self.config = config or self._default_config()
        self.export_history = []
        self.validation_cache = {}
        self.template_cache = {}
        self.performance_metrics = {
            'total_exports': 0,
            'successful_exports': 0,
            'average_validation_score': 0.0,
            'most_used_format': ExportFormat.JSON,
            'export_success_rate': 0.0,
            'average_file_size': 0.0
        }

        # Initialize templates
        self._initialize_templates()

    def _default_config(self) -> Dict[str, Any]:
        """Default configuration"""
        return {
            'default_validation_level': ValidationLevel.STANDARD,
            'enable_compression': True,
            'max_export_history': 1000,
            'validation_threshold': 0.8,
            'enable_watermarking': False,
            'default_watermark': 'Cognitive Fabric Visualizer',
            'cache_templates': True,
            'enable_async_export': True,
            'max_concurrent_exports': 5,
            'retention_days': 30
        }

    def _initialize_templates(self):
        """Initialize export templates"""
        self.templates = {
            ExportFormat.HTML: self._get_html_template(),
            ExportFormat.MARKDOWN: self._get_markdown_template(),
            ExportFormat.TEXT: self._get_text_template(),
            ExportFormat.XML: self._get_xml_template()
        }

    def _get_html_template(self) -> str:
        """Get HTML export template"""
        return """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cognitive Fabric Explanation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .section { margin-bottom: 30px; }
        .metric { background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .rule { border-left: 4px solid #007cba; padding-left: 15px; margin: 10px 0; }
        .confidence-bar { width: 100%; height: 20px; background-color: #ddd; border-radius: 10px; }
        .confidence-fill { height: 100%; background-color: #007cba; border-radius: 10px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg);
                     font-size: 72px; color: rgba(0,0,0,0.1); z-index: -1; }
    </style>
</head>
<body>
    {% if watermark %}<div class="watermark">{{ watermark }}</div>{% endif %}
    <div class="header">
        <h1>Cognitive Fabric Explanation Report</h1>
        <p>Generated: {{ timestamp }} | Export ID: {{ export_id }}</p>
        <p>Validation Score: {{ validation_score }}% | Format: {{ format }}</p>
    </div>

    {{ content }}

    <div class="footer">
        <p><em>Generated by Cognitive Fabric Visualizer - Explainable AI System</em></p>
    </div>
</body>
</html>
        """

    def _get_markdown_template(self) -> str:
        """Get Markdown export template"""
        return """
# Cognitive Fabric Explanation Report

**Generated:** {{ timestamp }}
**Export ID:** {{ export_id }}
**Validation Score:** {{ validation_score }}%
**Format:** {{ format }}

---

{{ content }}

---

*Generated by Cognitive Fabric Visualizer - Explainable AI System*
        """

    def _get_text_template(self) -> str:
        """Get plain text export template"""
        return """
COGNITIVE FABRIC EXPLANATION REPORT
===================================

Generated: {{ timestamp }}
Export ID: {{ export_id }}
Validation Score: {{ validation_score }}%
Format: {{ format }}

{{ content }}

---
Generated by Cognitive Fabric Visualizer - Explainable AI System
        """

    def _get_xml_template(self) -> str:
        """Get XML export template structure"""
        return """<?xml version="1.0" encoding="UTF-8"?>
<cognitive_fabric_explanation>
    <metadata>
        <export_id>{{ export_id }}</export_id>
        <timestamp>{{ timestamp }}</timestamp>
        <validation_score>{{ validation_score }}</validation_score>
        <format>{{ format }}</format>
    </metadata>
    <content>
        {{ content }}
    </content>
</cognitive_fabric_explanation>
        """

    async def export_explanation(self, explanation_result: ExplanationResult,
                                config: ExportConfiguration,
                                additional_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Export explanation with specified configuration

        Args:
            explanation_result: Explanation result to export
            config: Export configuration
            additional_data: Additional data to include

        Returns:
            Export result with file data and metadata
        """
        export_id = f"exp_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{hashlib.md5(str(explanation_result.explanation_id).encode()).hexdigest()[:8]}"

        try:
            start_time = datetime.now()

            # Validate export configuration
            validation_result = await self._validate_export(explanation_result, config)
            if not validation_result.is_valid:
                return {
                    'success': False,
                    'export_id': export_id,
                    'validation': validation_result,
                    'error': 'Export validation failed'
                }

            # Generate export content
            content = await self._generate_export_content(
                explanation_result, config, additional_data
            )

            # Apply formatting based on format type
            formatted_content = await self._format_content(content, config)

            # Apply post-processing
            processed_content = await self._post_process_content(
                formatted_content, config
            )

            # Calculate file size and checksum
            file_size = len(processed_content.encode('utf-8')) if isinstance(processed_content, str) else len(processed_content)
            checksum = hashlib.md5(processed_content.encode('utf-8') if isinstance(processed_content, str) else processed_content).hexdigest()

            # Create metadata
            metadata = ExportMetadata(
                export_id=export_id,
                format=config.format,
                validation_level=config.validation_level,
                created_at=datetime.now(),
                created_by="system",  # Would be user ID in production
                explanation_ids=[explanation_result.explanation_id],
                user_validation_score=validation_result.validation_score,
                file_size=file_size,
                checksum=checksum,
                include_visualizations=config.include_visualizations,
                include_raw_data=config.include_raw_data,
                include_feedback=config.include_feedback
            )

            # Update export history
            self.export_history.append({
                'metadata': asdict(metadata),
                'validation': asdict(validation_result),
                'processing_time': (datetime.now() - start_time).total_seconds()
            })

            # Update performance metrics
            self._update_performance_metrics(metadata, validation_result)

            logger.info(f"Successfully exported explanation {export_id} in {config.format.value} format")

            return {
                'success': True,
                'export_id': export_id,
                'metadata': asdict(metadata),
                'content': processed_content,
                'validation': asdict(validation_result),
                'processing_time': (datetime.now() - start_time).total_seconds()
            }

        except Exception as e:
            logger.error(f"Error exporting explanation {export_id}: {e}")
            return {
                'success': False,
                'export_id': export_id,
                'error': str(e)
            }

    async def _validate_export(self, explanation_result: ExplanationResult,
                             config: ExportConfiguration) -> ValidationResult:
        """Validate export configuration and content"""
        start_time = datetime.now()
        issues = []
        warnings = []
        recommendations = []

        # Check explanation result validity
        if not explanation_result.confidence_score:
            issues.append("Explanation has no confidence score")

        if not explanation_result.feature_importance:
            warnings.append("No feature importance data available")

        if config.validation_level == ValidationLevel.RESEARCH and not explanation_result.user_feedback:
            issues.append("Research-level export requires user feedback")

        # Check format-specific requirements
        if config.format == ExportFormat.PDF and not config.include_visualizations:
            recommendations.append("Consider including visualizations for PDF export")

        if config.format == ExportFormat.CSV and len(explanation_result.feature_importance) == 0:
            issues.append("CSV export requires feature importance data")

        # Check file size constraints
        estimated_size = self._estimate_file_size(explanation_result, config)
        if estimated_size > config.max_file_size:
            issues.append(f"Estimated file size ({estimated_size/1024/1024:.1f}MB) exceeds limit")

        # Calculate validation score
        validation_score = self._calculate_validation_score(
            explanation_result, config, issues, warnings
        )

        processing_time = (datetime.now() - start_time).total_seconds()

        return ValidationResult(
            is_valid=len(issues) == 0,
            validation_score=validation_score,
            issues=issues,
            warnings=warnings,
            recommendations=recommendations,
            processing_time=processing_time
        )

    def _estimate_file_size(self, explanation_result: ExplanationResult,
                          config: ExportConfiguration) -> int:
        """Estimate file size for export"""
        base_size = 1024  # Base size in bytes

        # Add size for different components
        if explanation_result.feature_importance:
            base_size += len(explanation_result.feature_importance) * 100

        if explanation_result.rules:
            base_size += len(explanation_result.rules) * 200

        if explanation_result.uncertainty_bounds:
            base_size += len(explanation_result.uncertainty_bounds) * 150

        if config.include_visualizations:
            base_size += 5 * 1024  # ~5KB per visualization

        if config.include_raw_data:
            base_size += 10 * 1024  # ~10KB for raw data

        # Format-specific multipliers
        format_multipliers = {
            ExportFormat.JSON: 1.2,
            ExportFormat.XML: 1.5,
            ExportFormat.HTML: 1.3,
            ExportFormat.PDF: 2.0,
            ExportFormat.TEXT: 0.8,
            ExportFormat.CSV: 0.6
        }

        multiplier = format_multipliers.get(config.format, 1.0)
        return int(base_size * multiplier)

    def _calculate_validation_score(self, explanation_result: ExplanationResult,
                                  config: ExportConfiguration,
                                  issues: List[str], warnings: List[str]) -> float:
        """Calculate validation score for export"""
        base_score = 1.0

        # Deduct points for issues
        base_score -= len(issues) * 0.2

        # Deduct points for warnings
        base_score -= len(warnings) * 0.1

        # Bonus for high-quality explanations
        if explanation_result.confidence_score > 0.9:
            base_score += 0.1

        if explanation_result.user_feedback and explanation_result.validation_score:
            base_score += explanation_result.validation_score * 0.1

        # Bonus for comprehensive exports
        if config.validation_level == ValidationLevel.RESEARCH:
            base_score += 0.05
        elif config.validation_level == ValidationLevel.COMPREHENSIVE:
            base_score += 0.03

        return max(0.0, min(1.0, base_score))

    async def _generate_export_content(self, explanation_result: ExplanationResult,
                                     config: ExportConfiguration,
                                     additional_data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate content for export"""
        content = {
            'explanation': asdict(explanation_result),
            'summary': self._generate_summary(explanation_result),
            'metadata': {
                'export_timestamp': datetime.now().isoformat(),
                'validation_level': config.validation_level.value,
                'format': config.format.value,
                'config': asdict(config)
            }
        }

        # Add additional data
        if additional_data:
            content['additional_data'] = additional_data

        # Add feature analysis
        if explanation_result.feature_importance:
            content['feature_analysis'] = self._analyze_features(explanation_result.feature_importance)

        # Add rule analysis
        if explanation_result.rules:
            content['rule_analysis'] = self._analyze_rules(explanation_result.rules)

        # Add uncertainty analysis
        if explanation_result.uncertainty_bounds:
            content['uncertainty_analysis'] = self._analyze_uncertainty(explanation_result.uncertainty_bounds)

        # Add user feedback analysis
        if explanation_result.user_feedback:
            content['feedback_analysis'] = self._analyze_feedback(explanation_result.user_feedback)

        # Add visualizations if requested
        if config.include_visualizations:
            content['visualizations'] = await self._generate_visualizations(explanation_result)

        # Add raw data if requested
        if config.include_raw_data:
            content['raw_data'] = self._prepare_raw_data(explanation_result)

        return content

    def _generate_summary(self, explanation_result: ExplanationResult) -> Dict[str, Any]:
        """Generate summary of explanation"""
        return {
            'explanation_id': explanation_result.explanation_id,
            'explanation_type': explanation_result.explanation_type.value,
            'confidence_score': explanation_result.confidence_score,
            'key_features': list(explanation_result.feature_importance.keys())[:5] if explanation_result.feature_importance else [],
            'rule_count': len(explanation_result.rules) if explanation_result.rules else 0,
            'has_uncertainty': bool(explanation_result.uncertainty_bounds),
            'has_user_feedback': bool(explanation_result.user_feedback),
            'validation_score': explanation_result.validation_score if explanation_result.validation_score else explanation_result.confidence_score
        }

    def _analyze_features(self, feature_importance: Dict[str, float]) -> Dict[str, Any]:
        """Analyze feature importance"""
        if not feature_importance:
            return {}

        features = list(feature_importance.items())
        features.sort(key=lambda x: abs(x[1]), reverse=True)

        return {
            'total_features': len(features),
            'top_features': features[:10],
            'positive_features': [(f, i) for f, i in features if i > 0],
            'negative_features': [(f, i) for f, i in features if i < 0],
            'importance_distribution': {
                'mean': np.mean(list(feature_importance.values())),
                'std': np.std(list(feature_importance.values())),
                'min': min(feature_importance.values()),
                'max': max(feature_importance.values())
            }
        }

    def _analyze_rules(self, rules: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze symbolic rules"""
        if not rules:
            return {}

        return {
            'total_rules': len(rules),
            'rule_types': list(set(rule.get('reasoning_type', 'unknown') for rule in rules)),
            'average_confidence': np.mean([rule.get('confidence', 0) for rule in rules]),
            'high_confidence_rules': [rule for rule in rules if rule.get('confidence', 0) > 0.8],
            'rule_categories': self._categorize_rules(rules)
        }

    def _categorize_rules(self, rules: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
        """Categorize rules by type"""
        categories = {
            'high_confidence': [],
            'medium_confidence': [],
            'low_confidence': [],
            'symbolic': [],
            'statistical': []
        }

        for rule in rules:
            confidence = rule.get('confidence', 0)
            if confidence > 0.8:
                categories['high_confidence'].append(rule)
            elif confidence > 0.5:
                categories['medium_confidence'].append(rule)
            else:
                categories['low_confidence'].append(rule)

            rule_type = rule.get('reasoning_type', '')
            if 'symbolic' in rule_type.lower():
                categories['symbolic'].append(rule)
            else:
                categories['statistical'].append(rule)

        return categories

    def _analyze_uncertainty(self, uncertainty_bounds: Dict[str, Tuple[float, float]]) -> Dict[str, Any]:
        """Analyze uncertainty bounds"""
        if not uncertainty_bounds:
            return {}

        widths = [bounds[1] - bounds[0] for bounds in uncertainty_bounds.values()]

        return {
            'total_features': len(uncertainty_bounds),
            'average_width': np.mean(widths),
            'width_distribution': {
                'mean': np.mean(widths),
                'std': np.std(widths),
                'min': min(widths),
                'max': max(widths)
            },
            'high_uncertainty_features': [
                feature for feature, bounds in uncertainty_bounds.items()
                if bounds[1] - bounds[0] > np.mean(widths) + np.std(widths)
            ]
        }

    def _analyze_feedback(self, user_feedback: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze user feedback"""
        if not user_feedback:
            return {}

        return {
            'understanding_score': user_feedback.get('understanding', 0),
            'trust_score': user_feedback.get('trust', 0),
            'usefulness_score': user_feedback.get('usefulness', 0),
            'accuracy_score': user_feedback.get('accuracy', 0),
            'overall_satisfaction': np.mean([
                user_feedback.get('understanding', 0),
                user_feedback.get('trust', 0),
                user_feedback.get('usefulness', 0),
                user_feedback.get('accuracy', 0)
            ]),
            'has_comments': bool(user_feedback.get('comments'))
        }

    async def _generate_visualizations(self, explanation_result: ExplanationResult) -> Dict[str, str]:
        """Generate visualizations for export"""
        visualizations = {}

        try:
            # Feature importance chart
            if explanation_result.feature_importance:
                visualizations['feature_importance'] = await self._create_feature_importance_chart(
                    explanation_result.feature_importance
                )

            # Confidence visualization
            visualizations['confidence'] = await self._create_confidence_visualization(
                explanation_result.confidence_score
            )

            # Uncertainty visualization
            if explanation_result.uncertainty_bounds:
                visualizations['uncertainty'] = await self._create_uncertainty_visualization(
                    explanation_result.uncertainty_bounds
                )

        except Exception as e:
            logger.error(f"Error generating visualizations: {e}")

        return visualizations

    async def _create_feature_importance_chart(self, feature_importance: Dict[str, float]) -> str:
        """Create feature importance chart"""
        try:
            # Sort features by importance
            features = sorted(feature_importance.items(), key=lambda x: abs(x[1]), reverse=True)[:15]

            if not features:
                return ""

            # Create chart
            fig, ax = plt.subplots(figsize=(10, 8))
            feature_names = [f[0] for f in features]
            importance_values = [f[1] for f in features]

            colors = ['green' if v > 0 else 'red' for v in importance_values]
            bars = ax.barh(range(len(feature_names)), importance_values, color=colors)

            ax.set_yticks(range(len(feature_names)))
            ax.set_yticklabels(feature_names)
            ax.set_xlabel('Importance Value')
            ax.set_title('Feature Importance')
            ax.grid(axis='x', alpha=0.3)

            plt.tight_layout()

            # Convert to base64
            buffer = io.BytesIO()
            plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
            buffer.seek(0)
            image_base64 = base64.b64encode(buffer.getvalue()).decode()
            plt.close()

            return f"data:image/png;base64,{image_base64}"

        except Exception as e:
            logger.error(f"Error creating feature importance chart: {e}")
            return ""

    async def _create_confidence_visualization(self, confidence_score: float) -> str:
        """Create confidence visualization"""
        try:
            fig, ax = plt.subplots(figsize=(8, 4))

            # Create confidence bar
            ax.barh(0, confidence_score, height=0.3, color='green', alpha=0.7)
            ax.barh(0, 1 - confidence_score, left=confidence_score, height=0.3, color='lightgray', alpha=0.7)

            ax.set_xlim(0, 1)
            ax.set_ylim(-0.5, 0.5)
            ax.set_xlabel('Confidence Score')
            ax.set_title(f'Overall Confidence: {confidence_score:.1%}')
            ax.set_xticks([0, 0.25, 0.5, 0.75, 1.0])
            ax.set_xticklabels(['0%', '25%', '50%', '75%', '100%'])

            plt.tight_layout()

            # Convert to base64
            buffer = io.BytesIO()
            plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
            buffer.seek(0)
            image_base64 = base64.b64encode(buffer.getvalue()).decode()
            plt.close()

            return f"data:image/png;base64,{image_base64}"

        except Exception as e:
            logger.error(f"Error creating confidence visualization: {e}")
            return ""

    async def _create_uncertainty_visualization(self, uncertainty_bounds: Dict[str, Tuple[float, float]]) -> str:
        """Create uncertainty visualization"""
        try:
            features = list(uncertainty_bounds.keys())[:10]
            if not features:
                return ""

            fig, ax = plt.subplots(figsize=(10, 6))

            # Create error bar plot
            lower_bounds = [uncertainty_bounds[f][0] for f in features]
            upper_bounds = [uncertainty_bounds[f][1] for f in features]
            centers = [(l + u) / 2 for l, u in zip(lower_bounds, upper_bounds)]
            errors = [(u - l) / 2 for l, u in zip(lower_bounds, upper_bounds)]

            ax.errorbar(range(len(features)), centers, yerr=errors, fmt='o', capsize=5, capthick=2)
            ax.set_xticks(range(len(features)))
            ax.set_xticklabels(features, rotation=45, ha='right')
            ax.set_ylabel('Value')
            ax.set_title('Uncertainty Bounds by Feature')
            ax.grid(True, alpha=0.3)

            plt.tight_layout()

            # Convert to base64
            buffer = io.BytesIO()
            plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
            buffer.seek(0)
            image_base64 = base64.b64encode(buffer.getvalue()).decode()
            plt.close()

            return f"data:image/png;base64,{image_base64}"

        except Exception as e:
            logger.error(f"Error creating uncertainty visualization: {e}")
            return ""

    def _prepare_raw_data(self, explanation_result: ExplanationResult) -> Dict[str, Any]:
        """Prepare raw data for export"""
        return {
            'explanation_id': explanation_result.explanation_id,
            'raw_feature_importance': explanation_result.feature_importance,
            'raw_rules': explanation_result.rules,
            'raw_uncertainty_bounds': explanation_result.uncertainty_bounds,
            'raw_user_feedback': explanation_result.user_feedback,
            'timestamp': explanation_result.timestamp.isoformat()
        }

    async def _format_content(self, content: Dict[str, Any],
                            config: ExportConfiguration) -> Union[str, bytes]:
        """Format content according to export format"""
        if config.format == ExportFormat.JSON:
            return self._format_json(content, config)
        elif config.format == ExportFormat.TEXT:
            return self._format_text(content, config)
        elif config.format == ExportFormat.HTML:
            return self._format_html(content, config)
        elif config.format == ExportFormat.MARKDOWN:
            return self._format_markdown(content, config)
        elif config.format == ExportFormat.CSV:
            return self._format_csv(content, config)
        elif config.format == ExportFormat.XML:
            return self._format_xml(content, config)
        elif config.format == ExportFormat.PDF:
            return await self._format_pdf(content, config)
        elif config.format == ExportFormat.EXCEL:
            return self._format_excel(content, config)
        else:
            return self._format_json(content, config)

    def _format_json(self, content: Dict[str, Any], config: ExportConfiguration) -> str:
        """Format as JSON"""
        # Remove binary data for JSON export
        json_content = content.copy()
        if 'visualizations' in json_content:
            json_content['visualizations'] = {
                k: "binary_data_removed" for k in json_content['visualizations']
            }

        return json.dumps(json_content, indent=2, default=str)

    def _format_text(self, content: Dict[str, Any], config: ExportConfiguration) -> str:
        """Format as plain text"""
        template = self.templates.get(ExportFormat.TEXT, self._get_text_template())

        formatted_sections = []

        # Explanation summary
        if 'summary' in content:
            summary = content['summary']
            formatted_sections.append("EXPLANATION SUMMARY")
            formatted_sections.append("=" * 50)
            formatted_sections.append(f"Explanation ID: {summary.get('explanation_id', 'N/A')}")
            formatted_sections.append(f"Type: {summary.get('explanation_type', 'N/A')}")
            formatted_sections.append(f"Confidence Score: {summary.get('confidence_score', 0):.3f}")
            formatted_sections.append(f"Validation Score: {summary.get('validation_score', 0):.3f}")
            formatted_sections.append(f"Key Features: {', '.join(summary.get('key_features', []))}")
            formatted_sections.append(f"Rule Count: {summary.get('rule_count', 0)}")
            formatted_sections.append("")

        # Feature importance
        if 'feature_analysis' in content:
            formatted_sections.append("FEATURE IMPORTANCE ANALYSIS")
            formatted_sections.append("=" * 50)
            feature_analysis = content['feature_analysis']
            formatted_sections.append(f"Total Features: {feature_analysis.get('total_features', 0)}")

            if 'top_features' in feature_analysis:
                formatted_sections.append("Top Features:")
                for feature, importance in feature_analysis['top_features']:
                    formatted_sections.append(f"  - {feature}: {importance:.4f}")
            formatted_sections.append("")

        # Rules
        if 'rule_analysis' in content:
            formatted_sections.append("RULE ANALYSIS")
            formatted_sections.append("=" * 50)
            rule_analysis = content['rule_analysis']
            formatted_sections.append(f"Total Rules: {rule_analysis.get('total_rules', 0)}")
            formatted_sections.append(f"Average Confidence: {rule_analysis.get('average_confidence', 0):.3f}")
            formatted_sections.append("")

        # User feedback
        if 'feedback_analysis' in content:
            formatted_sections.append("USER FEEDBACK ANALYSIS")
            formatted_sections.append("=" * 50)
            feedback = content['feedback_analysis']
            formatted_sections.append(f"Understanding: {feedback.get('understanding_score', 0)}/5")
            formatted_sections.append(f"Trust: {feedback.get('trust_score', 0)}/5")
            formatted_sections.append(f"Usefulness: {feedback.get('usefulness_score', 0)}/5")
            formatted_sections.append(f"Accuracy: {feedback.get('accuracy_score', 0)}/5")
            formatted_sections.append(f"Overall Satisfaction: {feedback.get('overall_satisfaction', 0):.3f}")
            formatted_sections.append("")

        content_text = "\n".join(formatted_sections)

        # Apply template
        return template.replace("{{ content }}", content_text)

    def _format_html(self, content: Dict[str, Any], config: ExportConfiguration) -> str:
        """Format as HTML"""
        template = self.templates.get(ExportFormat.HTML, self._get_html_template())

        # Generate HTML content
        html_sections = []

        # Summary section
        if 'summary' in content:
            summary = content['summary']
            html_sections.append(f"""
            <div class="section">
                <h2>Explanation Summary</h2>
                <div class="metric">
                    <strong>Explanation ID:</strong> {summary.get('explanation_id', 'N/A')}<br>
                    <strong>Type:</strong> {summary.get('explanation_type', 'N/A')}<br>
                    <strong>Confidence Score:</strong> {summary.get('confidence_score', 0):.3f}<br>
                    <strong>Validation Score:</strong> {summary.get('validation_score', 0):.3f}
                </div>
            </div>
            """)

        # Feature importance section
        if 'feature_analysis' in content:
            feature_analysis = content['feature_analysis']
            html_sections.append(f"""
            <div class="section">
                <h2>Feature Importance Analysis</h2>
                <div class="metric">
                    <strong>Total Features:</strong> {feature_analysis.get('total_features', 0)}<br>
                    <strong>Average Importance:</strong> {feature_analysis.get('importance_distribution', {}).get('mean', 0):.4f}
                </div>
            </div>
            """)

        # Visualizations
        if 'visualizations' in content:
            html_sections.append('<div class="section"><h2>Visualizations</h2>')
            for viz_name, viz_data in content['visualizations'].items():
                if viz_data.startswith('data:image'):
                    html_sections.append(f'<h3>{viz_name.replace("_", " ").title()}</h3>')
                    html_sections.append(f'<img src="{viz_data}" alt="{viz_name}" style="max-width: 100%; height: auto;">')
            html_sections.append('</div>')

        content_html = "\n".join(html_sections)

        # Apply template
        template_vars = {
            'content': content_html,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'export_id': content.get('metadata', {}).get('export_timestamp', ''),
            'validation_score': content.get('summary', {}).get('validation_score', 0) * 100,
            'format': config.format.value,
            'watermark': config.watermark or self.config.get('default_watermark')
        }

        result = template
        for key, value in template_vars.items():
            result = result.replace(f"{{{{{key}}}}}", str(value))

        return result

    def _format_markdown(self, content: Dict[str, Any], config: ExportConfiguration) -> str:
        """Format as Markdown"""
        template = self.templates.get(ExportFormat.MARKDOWN, self._get_markdown_template())

        # Generate Markdown content
        md_sections = []

        # Summary
        if 'summary' in content:
            summary = content['summary']
            md_sections.append("## Explanation Summary\n")
            md_sections.append(f"- **Explanation ID:** {summary.get('explanation_id', 'N/A')}")
            md_sections.append(f"- **Type:** {summary.get('explanation_type', 'N/A')}")
            md_sections.append(f"- **Confidence Score:** {summary.get('confidence_score', 0):.3f}")
            md_sections.append(f"- **Validation Score:** {summary.get('validation_score', 0):.3f}\n")

        # Feature importance
        if 'feature_analysis' in content:
            feature_analysis = content['feature_analysis']
            md_sections.append("## Feature Importance Analysis\n")
            md_sections.append(f"**Total Features:** {feature_analysis.get('total_features', 0)}\n")

            if 'top_features' in feature_analysis:
                md_sections.append("### Top Features\n")
                for feature, importance in feature_analysis['top_features']:
                    md_sections.append(f"- **{feature}:** {importance:.4f}")
                md_sections.append("")

        content_md = "\n".join(md_sections)

        # Apply template
        template_vars = {
            'content': content_md,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'export_id': content.get('metadata', {}).get('export_timestamp', ''),
            'validation_score': content.get('summary', {}).get('validation_score', 0) * 100,
            'format': config.format.value
        }

        result = template
        for key, value in template_vars.items():
            result = result.replace(f"{{{{{key}}}}}", str(value))

        return result

    def _format_csv(self, content: Dict[str, Any], config: ExportConfiguration) -> str:
        """Format as CSV"""
        csv_data = []

        # Feature importance CSV
        if 'feature_analysis' in content and 'top_features' in content['feature_analysis']:
            csv_data.append("Feature Importance")
            csv_data.append("Feature,Importance")
            for feature, importance in content['feature_analysis']['top_features']:
                csv_data.append(f'"{feature}",{importance}')

        # Feedback CSV
        if 'feedback_analysis' in content:
            feedback = content['feedback_analysis']
            csv_data.append("")
            csv_data.append("User Feedback")
            csv_data.append("Metric,Score")
            csv_data.append(f"Understanding,{feedback.get('understanding_score', 0)}")
            csv_data.append(f"Trust,{feedback.get('trust_score', 0)}")
            csv_data.append(f"Usefulness,{feedback.get('usefulness_score', 0)}")
            csv_data.append(f"Accuracy,{feedback.get('accuracy_score', 0)}")
            csv_data.append(f"Overall Satisfaction,{feedback.get('overall_satisfaction', 0)}")

        return "\n".join(csv_data)

    def _format_xml(self, content: Dict[str, Any], config: ExportConfiguration) -> str:
        """Format as XML"""
        root = ET.Element("cognitive_fabric_explanation")

        # Metadata
        metadata = ET.SubElement(root, "metadata")
        if 'metadata' in content:
            for key, value in content['metadata'].items():
                meta_elem = ET.SubElement(metadata, key)
                meta_elem.text = str(value)

        # Content
        content_elem = ET.SubElement(root, "content")

        # Summary
        if 'summary' in content:
            summary_elem = ET.SubElement(content_elem, "summary")
            for key, value in content['summary'].items():
                item_elem = ET.SubElement(summary_elem, key)
                item_elem.text = str(value)

        # Feature analysis
        if 'feature_analysis' in content:
            features_elem = ET.SubElement(content_elem, "feature_analysis")
            for key, value in content['feature_analysis'].items():
                feature_elem = ET.SubElement(features_elem, key)
                if isinstance(value, dict):
                    for sub_key, sub_value in value.items():
                        sub_elem = ET.SubElement(feature_elem, sub_key)
                        sub_elem.text = str(sub_value)
                else:
                    feature_elem.text = str(value)

        # Pretty print XML
        rough_string = ET.tostring(root, 'utf-8')
        reparsed = minidom.parseString(rough_string)
        return reparsed.toprettyxml(indent="  ")

    async def _format_pdf(self, content: Dict[str, Any], config: ExportConfiguration) -> bytes:
        """Format as PDF"""
        # Create PDF buffer
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)

        # Get styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            spaceAfter=30,
            alignment=1  # Center
        )

        story = []

        # Title
        story.append(Paragraph("Cognitive Fabric Explanation Report", title_style))
        story.append(Spacer(1, 20))

        # Summary
        if 'summary' in content:
            story.append(Paragraph("Explanation Summary", styles['Heading2']))
            summary = content['summary']

            summary_data = [
                ['Metric', 'Value'],
                ['Explanation ID', summary.get('explanation_id', 'N/A')],
                ['Type', summary.get('explanation_type', 'N/A')],
                ['Confidence Score', f"{summary.get('confidence_score', 0):.3f}"],
                ['Validation Score', f"{summary.get('validation_score', 0):.3f}"]
            ]

            summary_table = Table(summary_data)
            summary_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 14),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))

            story.append(summary_table)
            story.append(Spacer(1, 20))

        # Feature importance
        if 'feature_analysis' in content:
            story.append(Paragraph("Feature Importance Analysis", styles['Heading2']))
            feature_analysis = content['feature_analysis']

            if 'top_features' in feature_analysis:
                feature_data = [['Feature', 'Importance']]
                for feature, importance in feature_analysis['top_features']:
                    feature_data.append([feature, f"{importance:.4f}"])

                feature_table = Table(feature_data)
                feature_table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, 0), 12),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                    ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black)
                ]))

                story.append(feature_table)
                story.append(Spacer(1, 20))

        # Build PDF
        doc.build(story)

        # Get PDF bytes
        pdf_bytes = buffer.getvalue()
        buffer.close()

        return pdf_bytes

    def _format_excel(self, content: Dict[str, Any], config: ExportConfiguration) -> bytes:
        """Format as Excel"""
        # Create multiple sheets for different data
        output = io.BytesIO()

        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            # Summary sheet
            if 'summary' in content:
                summary_df = pd.DataFrame([content['summary']])
                summary_df.to_excel(writer, sheet_name='Summary', index=False)

            # Feature importance sheet
            if 'feature_analysis' in content and 'top_features' in content['feature_analysis']:
                features_df = pd.DataFrame(content['feature_analysis']['top_features'],
                                         columns=['Feature', 'Importance'])
                features_df.to_excel(writer, sheet_name='Feature Importance', index=False)

            # Feedback sheet
            if 'feedback_analysis' in content:
                feedback = content['feedback_analysis']
                feedback_df = pd.DataFrame([
                    ['Understanding', feedback.get('understanding_score', 0)],
                    ['Trust', feedback.get('trust_score', 0)],
                    ['Usefulness', feedback.get('usefulness_score', 0)],
                    ['Accuracy', feedback.get('accuracy_score', 0)],
                    ['Overall Satisfaction', feedback.get('overall_satisfaction', 0)]
                ], columns=['Metric', 'Score'])
                feedback_df.to_excel(writer, sheet_name='User Feedback', index=False)

        return output.getvalue()

    async def _post_process_content(self, content: Union[str, bytes],
                                  config: ExportConfiguration) -> Union[str, bytes]:
        """Post-process content"""
        # Add watermark if specified
        if config.watermark and isinstance(content, str):
            content = self._add_watermark(content, config.watermark)

        # Compress if enabled
        if config.compression:
            content = self._compress_content(content)

        return content

    def _add_watermark(self, content: str, watermark: str) -> str:
        """Add watermark to content"""
        # Simple watermark addition for HTML/text content
        if '<html' in content.lower():
            # HTML watermark
            watermark_div = f'<div class="watermark">{watermark}</div>'
            content = content.replace('<body>', f'<body>{watermark_div}')
        else:
            # Text watermark
            content = f"{watermark}\n\n{content}"

        return content

    def _compress_content(self, content: Union[str, bytes]) -> bytes:
        """Compress content"""
        if isinstance(content, str):
            content = content.encode('utf-8')

        import gzip
        return gzip.compress(content)

    def _update_performance_metrics(self, metadata: ExportMetadata,
                                  validation_result: ValidationResult):
        """Update performance metrics"""
        self.performance_metrics['total_exports'] += 1

        if validation_result.is_valid:
            self.performance_metrics['successful_exports'] += 1

        # Update average validation score
        current_avg = self.performance_metrics['average_validation_score']
        n = self.performance_metrics['total_exports']
        new_avg = ((current_avg * (n - 1)) + validation_result.validation_score) / n
        self.performance_metrics['average_validation_score'] = new_avg

        # Update most used format
        # Simplified - would need proper tracking in production
        self.performance_metrics['most_used_format'] = metadata.format

        # Update success rate
        self.performance_metrics['export_success_rate'] = (
            self.performance_metrics['successful_exports'] / n
        )

        # Update average file size
        current_size = self.performance_metrics['average_file_size']
        new_size = ((current_size * (n - 1)) + metadata.file_size) / n
        self.performance_metrics['average_file_size'] = new_size

    def get_export_statistics(self, days: int = 30) -> Dict[str, Any]:
        """Get export statistics"""
        cutoff_date = datetime.now() - timedelta(days=days)
        recent_exports = [
            export for export in self.export_history
            if datetime.fromisoformat(export['metadata']['created_at']) > cutoff_date
        ]

        return {
            'period_days': days,
            'total_exports': len(recent_exports),
            'successful_exports': len([e for e in recent_exports if e['validation']['is_valid']]),
            'average_validation_score': np.mean([e['validation']['validation_score'] for e in recent_exports]) if recent_exports else 0,
            'average_processing_time': np.mean([e['processing_time'] for e in recent_exports]) if recent_exports else 0,
            'format_distribution': self._get_format_distribution(recent_exports),
            'validation_level_distribution': self._get_validation_level_distribution(recent_exports),
            'performance_metrics': self.performance_metrics.copy()
        }

    def _get_format_distribution(self, exports: List[Dict[str, Any]]) -> Dict[str, int]:
        """Get distribution of export formats"""
        distribution = {}
        for export in exports:
            format_name = export['metadata']['format']
            distribution[format_name] = distribution.get(format_name, 0) + 1
        return distribution

    def _get_validation_level_distribution(self, exports: List[Dict[str, Any]]) -> Dict[str, int]:
        """Get distribution of validation levels"""
        distribution = {}
        for export in exports:
            level = export['metadata']['validation_level']
            distribution[level] = distribution.get(level, 0) + 1
        return distribution

    async def batch_export(self, explanations: List[ExplanationResult],
                          config: ExportConfiguration) -> List[Dict[str, Any]]:
        """Export multiple explanations in batch"""
        results = []

        for explanation in explanations:
            result = await self.export_explanation(explanation, config)
            results.append(result)

        return results

# Utility functions
def create_export_configuration(format_type: str, validation_level: str = "standard",
                             include_visualizations: bool = False,
                             **kwargs) -> ExportConfiguration:
    """Create export configuration"""
    return ExportConfiguration(
        format=ExportFormat(format_type),
        validation_level=ValidationLevel(validation_level),
        include_visualizations=include_visualizations,
        **kwargs
    )

if __name__ == "__main__":
    # Example usage
    async def main():
        from .explainability import NeuroSymbolicExplainer, CognitiveElement, ExplanationResult, ExplanationType
        import numpy as np

        # Create sample explanation result
        sample_explanation = ExplanationResult(
            explanation_id="sample_001",
            explanation_type=ExplanationType.INTERACTIVE,
            confidence_score=0.87,
            feature_importance={"feature_1": 0.45, "feature_2": -0.32, "feature_3": 0.18},
            rules=[{
                "rule_id": "rule_001",
                "description": "Sample rule description",
                "confidence": 0.92,
                "reasoning_type": "symbolic"
            }],
            uncertainty_bounds={"feature_1": (0.42, 0.48), "feature_2": (-0.35, -0.29)},
            timestamp=datetime.now(),
            user_feedback={
                "understanding": 4,
                "trust": 5,
                "usefulness": 4,
                "accuracy": 5,
                "comments": "Very clear explanation"
            },
            validation_score=0.95
        )

        # Create exporter
        exporter = ExplanationExporter()

        # Create export configuration
        config = create_export_configuration(
            format_type="json",
            validation_level="comprehensive",
            include_visualizations=True
        )

        # Export explanation
        result = await exporter.export_explanation(sample_explanation, config)

        if result['success']:
            print(f"Export successful: {result['export_id']}")
            print(f"File size: {result['metadata']['file_size']} bytes")
            print(f"Validation score: {result['validation']['validation_score']:.3f}")
        else:
            print(f"Export failed: {result['error']}")

        # Get export statistics
        stats = exporter.get_export_statistics()
        print(f"Total exports: {stats['total_exports']}")
        print(f"Success rate: {stats['performance_metrics']['export_success_rate']:.3f}")

    asyncio.run(main())