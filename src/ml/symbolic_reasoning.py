"""
Symbolic Reasoning Engine for Cognitive Fabric Visualizer
Implements transparent rule extraction and symbolic reasoning
Target: High explainability with rule-based confidence scoring
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple, Set, Union
import json
import logging
from dataclasses import dataclass, asdict, field
from enum import Enum
from datetime import datetime
import re
import networkx as nx
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score, recall_score
from sklearn.preprocessing import LabelEncoder
import pickle
import hashlib
from abc import ABC, abstractmethod

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RuleType(Enum):
    """Types of symbolic rules"""
    DECISION_TREE = "decision_tree"
    ASSOCIATION = "association"
    CORRELATION = "correlation"
    CAUSAL = "causal"
    CONSTRAINT = "constraint"
    PATTERN = "pattern"

class LogicalOperator(Enum):
    """Logical operators for rule conditions"""
    AND = "AND"
    OR = "OR"
    NOT = "NOT"
    IMPLIES = "IMPLIES"
    IFF = "IFF"

class ComparisonOperator(Enum):
    """Comparison operators for conditions"""
    EQUALS = "=="
    NOT_EQUALS = "!="
    GREATER_THAN = ">"
    GREATER_EQUAL = ">="
    LESS_THAN = "<"
    LESS_EQUAL = "<="
    CONTAINS = "contains"
    REGEX = "matches"

@dataclass
class Condition:
    """Represents a single condition in a rule"""
    feature: str
    operator: ComparisonOperator
    value: Any
    weight: float = 1.0

    def evaluate(self, features: Dict[str, Any]) -> bool:
        """Evaluate condition against feature values"""
        if self.feature not in features:
            return False

        feature_value = features[self.feature]

        try:
            if self.operator == ComparisonOperator.EQUALS:
                return feature_value == self.value
            elif self.operator == ComparisonOperator.NOT_EQUALS:
                return feature_value != self.value
            elif self.operator == ComparisonOperator.GREATER_THAN:
                return float(feature_value) > float(self.value)
            elif self.operator == ComparisonOperator.GREATER_EQUAL:
                return float(feature_value) >= float(self.value)
            elif self.operator == ComparisonOperator.LESS_THAN:
                return float(feature_value) < float(self.value)
            elif self.operator == ComparisonOperator.LESS_EQUAL:
                return float(feature_value) <= float(self.value)
            elif self.operator == ComparisonOperator.CONTAINS:
                return str(self.value) in str(feature_value)
            elif self.operator == ComparisonOperator.REGEX:
                return bool(re.search(str(self.value), str(feature_value)))
            else:
                return False
        except (ValueError, TypeError):
            return False

    def to_string(self) -> str:
        """Convert condition to human-readable string"""
        return f"{self.feature} {self.operator.value} {self.value}"

@dataclass
class Rule:
    """Represents a symbolic rule"""
    rule_id: str
    rule_type: RuleType
    conditions: List[Condition]
    conclusion: str
    confidence: float
    support: float
    lift: float = 1.0
    created_at: datetime = field(default_factory=datetime.now)
    examples_count: int = 0
    correct_predictions: int = 0
    logical_operator: LogicalOperator = LogicalOperator.AND

    def evaluate(self, features: Dict[str, Any]) -> bool:
        """Evaluate rule conditions against features"""
        if not self.conditions:
            return False

        if self.logical_operator == LogicalOperator.AND:
            return all(condition.evaluate(features) for condition in self.conditions)
        elif self.logical_operator == LogicalOperator.OR:
            return any(condition.evaluate(features) for condition in self.conditions)
        elif self.logical_operator == LogicalOperator.NOT:
            return not all(condition.evaluate(features) for condition in self.conditions)
        else:
            # Default to AND for complex operators
            return all(condition.evaluate(features) for condition in self.conditions)

    def get_accuracy(self) -> float:
        """Calculate rule accuracy"""
        if self.examples_count == 0:
            return 0.0
        return self.correct_predictions / self.examples_count

    def to_string(self) -> str:
        """Convert rule to human-readable string"""
        if not self.conditions:
            return f"IF True THEN {self.conclusion} (confidence: {self.confidence:.3f})"

        condition_strs = [cond.to_string() for cond in self.conditions]
        conditions_text = f" {self.logical_operator.value} ".join(condition_strs)

        return (f"IF {conditions_text} THEN {self.conclusion} "
                f"(confidence: {self.confidence:.3f}, support: {self.support:.3f})")

    def to_dict(self) -> Dict[str, Any]:
        """Convert rule to dictionary"""
        return {
            'rule_id': self.rule_id,
            'rule_type': self.rule_type.value,
            'conditions': [asdict(cond) for cond in self.conditions],
            'conclusion': self.conclusion,
            'confidence': self.confidence,
            'support': self.support,
            'lift': self.lift,
            'created_at': self.created_at.isoformat(),
            'examples_count': self.examples_count,
            'correct_predictions': self.correct_predictions,
            'accuracy': self.get_accuracy(),
            'logical_operator': self.logical_operator.value
        }

@dataclass
class ReasoningPath:
    """Represents a reasoning path through multiple rules"""
    path_id: str
    rules: List[Rule]
    final_conclusion: str
    path_confidence: float
    reasoning_steps: List[str]

class RuleExtractor(ABC):
    """Abstract base class for rule extraction methods"""

    @abstractmethod
    def extract_rules(self, data: pd.DataFrame, target_column: str) -> List[Rule]:
        """Extract rules from data"""
        pass

class DecisionTreeExtractor(RuleExtractor):
    """Extract rules from decision trees"""

    def __init__(self, max_depth: int = 5, min_samples_split: int = 10):
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.tree = None
        self.feature_names = None

    def extract_rules(self, data: pd.DataFrame, target_column: str) -> List[Rule]:
        """Extract rules from a decision tree"""
        try:
            # Prepare data
            X = data.drop(columns=[target_column])
            y = data[target_column]

            self.feature_names = X.columns.tolist()

            # Train decision tree
            self.tree = DecisionTreeClassifier(
                max_depth=self.max_depth,
                min_samples_split=self.min_samples_split,
                random_state=42
            )
            self.tree.fit(X, y)

            # Extract rules from tree paths
            rules = self._extract_rules_from_tree(X, y)

            logger.info(f"Extracted {len(rules)} rules from decision tree")
            return rules

        except Exception as e:
            logger.error(f"Error extracting rules from decision tree: {e}")
            return []

    def _extract_rules_from_tree(self, X: pd.DataFrame, y: pd.Series) -> List[Rule]:
        """Extract rules from tree structure"""
        rules = []

        # Get tree structure
        tree_ = self.tree.tree_
        feature_names = self.feature_names

        def traverse(node_id: int, current_conditions: List[Condition]):
            """Recursively traverse tree to extract rules"""
            if tree_.feature[node_id] != -2:  # Not a leaf node
                # Get split information
                feature_idx = tree_.feature[node_id]
                threshold = tree_.threshold[node_id]
                feature_name = feature_names[feature_idx]

                # Left child (feature <= threshold)
                left_condition = Condition(
                    feature=feature_name,
                    operator=ComparisonOperator.LESS_EQUAL,
                    value=threshold
                )
                traverse(tree_.children_left[node_id], current_conditions + [left_condition])

                # Right child (feature > threshold)
                right_condition = Condition(
                    feature=feature_name,
                    operator=ComparisonOperator.GREATER_THAN,
                    value=threshold
                )
                traverse(tree_.children_right[node_id], current_conditions + [right_condition])

            else:  # Leaf node
                if current_conditions:
                    # Get majority class at leaf
                    values = tree_.value[node_id][0]
                    class_idx = np.argmax(values)
                    majority_class = self.tree.classes_[class_idx]
                    confidence = values[class_idx] / np.sum(values)

                    # Count support
                    support = np.sum(values)

                    # Create rule
                    rule = Rule(
                        rule_id=f"dt_rule_{len(rules)}",
                        rule_type=RuleType.DECISION_TREE,
                        conditions=current_conditions.copy(),
                        conclusion=str(majority_class),
                        confidence=float(confidence),
                        support=float(support / len(X)),
                        examples_count=int(np.sum(values))
                    )
                    rules.append(rule)

        traverse(0, [])
        return rules

class AssociationRuleExtractor(RuleExtractor):
    """Extract association rules using market basket analysis approach"""

    def __init__(self, min_support: float = 0.1, min_confidence: float = 0.7):
        self.min_support = min_support
        self.min_confidence = min_confidence

    def extract_rules(self, data: pd.DataFrame, target_column: str) -> List[Rule]:
        """Extract association rules"""
        try:
            # Discretize numeric columns
            discretized_data = self._discretize_data(data.drop(columns=[target_column]))

            # Find frequent itemsets
            frequent_itemsets = self._find_frequent_itemsets(discretized_data, target_column)

            # Generate rules from frequent itemsets
            rules = self._generate_association_rules(frequent_itemsets, data, target_column)

            logger.info(f"Extracted {len(rules)} association rules")
            return rules

        except Exception as e:
            logger.error(f"Error extracting association rules: {e}")
            return []

    def _discretize_data(self, data: pd.DataFrame) -> pd.DataFrame:
        """Discretize numeric data for association rule mining"""
        discretized = data.copy()

        for column in discretized.columns:
            if discretized[column].dtype in ['int64', 'float64']:
                # Create bins for numeric data
                try:
                    discretized[column] = pd.cut(
                        discretized[column],
                        bins=3,
                        labels=['low', 'medium', 'high']
                    ).astype(str)
                except Exception:
                    discretized[column] = discretized[column].astype(str)

        return discretized

    def _find_frequent_itemsets(self, data: pd.DataFrame, target_column: str) -> Dict[frozenset, int]:
        """Find frequent itemsets using simplified Apriori algorithm"""
        # Get target values from original data
        target_values = data[target_column].unique() if target_column in data.columns else []

        frequent_itemsets = {}

        # Find 1-itemsets
        for column in data.columns:
            for value in data[column].unique():
                itemset = frozenset([(column, value)])
                count = self._count_itemset_support(itemset, data)
                if count >= self.min_support * len(data):
                    frequent_itemsets[itemset] = count

        # Generate larger itemsets (simplified - only 2-itemsets)
        current_itemsets = list(frequent_itemsets.keys())

        for i, itemset1 in enumerate(current_itemsets):
            for j, itemset2 in enumerate(current_itemsets[i+1:], i+1):
                combined = itemset1.union(itemset2)
                if len(combined) == 2:  # Only 2-itemsets
                    count = self._count_itemset_support(combined, data)
                    if count >= self.min_support * len(data):
                        frequent_itemsets[combined] = count

        return frequent_itemsets

    def _count_itemset_support(self, itemset: frozenset, data: pd.DataFrame) -> int:
        """Count support for an itemset"""
        count = 0
        for _, row in data.iterrows():
            matches = True
            for column, value in itemset:
                if row[column] != value:
                    matches = False
                    break
            if matches:
                count += 1
        return count

    def _generate_association_rules(self, frequent_itemsets: Dict[frozenset, int],
                                 original_data: pd.DataFrame, target_column: str) -> List[Rule]:
        """Generate association rules from frequent itemsets"""
        rules = []
        total_transactions = len(original_data)

        for itemset, support_count in frequent_itemsets.items():
            if len(itemset) < 2:
                continue

            # Try each item as consequent
            for item in itemset:
                antecedent = itemset - {item}
                if not antecedent:
                    continue

                # Calculate confidence
                antecedent_support = self._count_itemset_support(antecedent,
                    self._discretize_data(original_data.drop(columns=[target_column])))
                if antecedent_support == 0:
                    continue

                confidence = support_count / antecedent_support

                if confidence >= self.min_confidence:
                    # Create conditions
                    conditions = []
                    for column, value in antecedent:
                        conditions.append(Condition(
                            feature=column,
                            operator=ComparisonOperator.EQUALS,
                            value=value
                        ))

                    # Calculate lift
                    consequent_support = self._count_itemset_support(frozenset([item]),
                        self._discretize_data(original_data.drop(columns=[target_column])))
                    lift = confidence / (consequent_support / total_transactions) if consequent_support > 0 else 1.0

                    rule = Rule(
                        rule_id=f"assoc_rule_{len(rules)}",
                        rule_type=RuleType.ASSOCIATION,
                        conditions=conditions,
                        conclusion=f"{item[0]} = {item[1]}",
                        confidence=confidence,
                        support=support_count / total_transactions,
                        lift=lift,
                        examples_count=support_count
                    )
                    rules.append(rule)

        return rules

class SymbolicReasoningEngine:
    """
    Main symbolic reasoning engine for transparent rule extraction
    Provides explainable reasoning paths and confidence scoring
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize symbolic reasoning engine

        Args:
            config: Configuration dictionary
        """
        self.config = config or self._default_config()
        self.rules: List[Rule] = []
        self.reasoning_paths: List[ReasoningPath] = []
        self.rule_extractors: Dict[RuleType, RuleExtractor] = {}
        self.performance_metrics = {
            'total_rules': 0,
            'rule_types': {},
            'average_confidence': 0.0,
            'average_support': 0.0,
            'reasoning_success_rate': 0.0,
            'rule_accuracy': 0.0
        }

        # Initialize rule extractors
        self._initialize_extractors()

    def _default_config(self) -> Dict[str, Any]:
        """Default configuration"""
        return {
            'max_rules_per_type': 100,
            'min_confidence_threshold': 0.5,
            'min_support_threshold': 0.05,
            'enable_rule_pruning': True,
            'max_reasoning_depth': 10,
            'enable_rule_learning': True,
            'rule_cache_size': 1000
        }

    def _initialize_extractors(self):
        """Initialize rule extraction methods"""
        self.rule_extractors = {
            RuleType.DECISION_TREE: DecisionTreeExtractor(
                max_depth=5,
                min_samples_split=10
            ),
            RuleType.ASSOCIATION: AssociationRuleExtractor(
                min_support=0.1,
                min_confidence=0.7
            )
        }

    def extract_rules_from_data(self, data: pd.DataFrame, target_column: str,
                              rule_types: Optional[List[RuleType]] = None) -> List[Rule]:
        """
        Extract symbolic rules from data

        Args:
            data: Training data
            target_column: Target variable column
            rule_types: Types of rules to extract

        Returns:
            List of extracted rules
        """
        if rule_types is None:
            rule_types = [RuleType.DECISION_TREE, RuleType.ASSOCIATION]

        all_rules = []

        for rule_type in rule_types:
            if rule_type in self.rule_extractors:
                try:
                    extractor = self.rule_extractors[rule_type]
                    rules = extractor.extract_rules(data, target_column)

                    # Filter rules by thresholds
                    filtered_rules = [
                        rule for rule in rules
                        if rule.confidence >= self.config['min_confidence_threshold'] and
                           rule.support >= self.config['min_support_threshold']
                    ]

                    # Limit rules per type
                    if len(filtered_rules) > self.config['max_rules_per_type']:
                        # Sort by confidence and keep top rules
                        filtered_rules.sort(key=lambda r: r.confidence, reverse=True)
                        filtered_rules = filtered_rules[:self.config['max_rules_per_type']]

                    all_rules.extend(filtered_rules)
                    logger.info(f"Extracted {len(filtered_rules)} {rule_type.value} rules")

                except Exception as e:
                    logger.error(f"Error extracting {rule_type.value} rules: {e}")

        # Update rules
        self.rules.extend(all_rules)

        # Prune redundant rules if enabled
        if self.config['enable_rule_pruning']:
            all_rules = self._prune_rules(all_rules)

        # Update metrics
        self._update_performance_metrics()

        return all_rules

    def _prune_rules(self, rules: List[Rule]) -> List[Rule]:
        """Prune redundant or low-quality rules"""
        if not rules:
            return rules

        # Sort by confidence
        rules.sort(key=lambda r: r.confidence, reverse=True)

        pruned_rules = []
        rule_signatures = set()

        for rule in rules:
            # Create rule signature for redundancy checking
            signature = self._create_rule_signature(rule)

            # Skip if redundant
            if signature in rule_signatures:
                continue

            rule_signatures.add(signature)

            # Additional pruning based on rule quality
            if rule.confidence >= self.config['min_confidence_threshold']:
                pruned_rules.append(rule)

        return pruned_rules

    def _create_rule_signature(self, rule: Rule) -> str:
        """Create signature for rule redundancy detection"""
        conditions_str = sorted([f"{c.feature}_{c.operator.value}_{c.value}"
                                for c in rule.conditions])
        return f"{rule.conclusion}_{'_'.join(conditions_str)}"

    def reason_about_case(self, features: Dict[str, Any],
                         max_depth: Optional[int] = None) -> Optional[ReasoningPath]:
        """
        Reason about a specific case using symbolic rules

        Args:
            features: Feature values for the case
            max_depth: Maximum reasoning depth

        Returns:
            Reasoning path with applied rules
        """
        if max_depth is None:
            max_depth = self.config['max_reasoning_depth']

        try:
            reasoning_path = self._find_reasoning_path(features, max_depth)

            if reasoning_path:
                self.reasoning_paths.append(reasoning_path)
                return reasoning_path
            else:
                logger.warning(f"No reasoning path found for case with features: {list(features.keys())}")
                return None

        except Exception as e:
            logger.error(f"Error reasoning about case: {e}")
            return None

    def _find_reasoning_path(self, features: Dict[str, Any], max_depth: int) -> Optional[ReasoningPath]:
        """Find reasoning path through rule applications"""
        applied_rules = []
        reasoning_steps = []
        current_features = features.copy()
        path_confidence = 1.0

        for depth in range(max_depth):
            applicable_rules = [
                rule for rule in self.rules
                if rule.evaluate(current_features) and rule not in applied_rules
            ]

            if not applicable_rules:
                break

            # Select best rule (highest confidence)
            best_rule = max(applicable_rules, key=lambda r: r.confidence)
            applied_rules.append(best_rule)

            # Update confidence
            path_confidence *= best_rule.confidence

            # Add reasoning step
            reasoning_steps.append(
                f"Applied rule: {best_rule.to_string()}"
            )

            # Update features based on conclusion (simplified)
            # In a more complex system, this would properly update feature states
            current_features[f"inferred_{best_rule.rule_id}"] = best_rule.conclusion

            # Early stopping if confidence is high
            if path_confidence >= 0.9:
                break

        if applied_rules:
            # Determine final conclusion from applied rules
            final_conclusion = self._determine_final_conclusion(applied_rules, current_features)

            reasoning_path = ReasoningPath(
                path_id=f"path_{len(self.reasoning_paths)}",
                rules=applied_rules,
                final_conclusion=final_conclusion,
                path_confidence=path_confidence,
                reasoning_steps=reasoning_steps
            )

            return reasoning_path
        else:
            return None

    def _determine_final_conclusion(self, applied_rules: List[Rule],
                                  features: Dict[str, Any]) -> str:
        """Determine final conclusion from applied rules"""
        if not applied_rules:
            return "No conclusion reached"

        # Weighted voting based on rule confidence
        conclusions = {}
        total_weight = 0.0

        for rule in applied_rules:
            weight = rule.confidence * rule.support
            conclusions[rule.conclusion] = conclusions.get(rule.conclusion, 0) + weight
            total_weight += weight

        if total_weight > 0:
            # Return conclusion with highest weighted vote
            return max(conclusions.items(), key=lambda x: x[1])[0]
        else:
            # Fallback to highest confidence rule
            return max(applied_rules, key=lambda r: r.confidence).conclusion

    def explain_prediction(self, features: Dict[str, Any],
                          prediction: Any) -> Dict[str, Any]:
        """
        Explain a prediction using symbolic reasoning

        Args:
            features: Input features
            prediction: Model prediction

        Returns:
            Explanation with symbolic reasoning
        """
        try:
            # Find reasoning path
            reasoning_path = self.reason_about_case(features)

            if reasoning_path:
                explanation = {
                    'prediction': str(prediction),
                    'reasoning_path': {
                        'path_id': reasoning_path.path_id,
                        'applied_rules': [rule.to_dict() for rule in reasoning_path.rules],
                        'final_conclusion': reasoning_path.final_conclusion,
                        'path_confidence': reasoning_path.path_confidence,
                        'reasoning_steps': reasoning_path.reasoning_steps
                    },
                    'explanation_type': 'symbolic_reasoning',
                    'rule_count': len(reasoning_path.rules),
                    'overall_confidence': reasoning_path.path_confidence
                }
            else:
                # Find applicable rules for partial explanation
                applicable_rules = [
                    rule for rule in self.rules if rule.evaluate(features)
                ]

                explanation = {
                    'prediction': str(prediction),
                    'applicable_rules': [rule.to_dict() for rule in applicable_rules[:5]],
                    'explanation_type': 'rule_matching',
                    'rule_count': len(applicable_rules),
                    'note': 'No complete reasoning path found, showing applicable rules'
                }

            return explanation

        except Exception as e:
            logger.error(f"Error explaining prediction: {e}")
            return {
                'error': str(e),
                'explanation_type': 'error'
            }

    def learn_from_feedback(self, features: Dict[str, Any], prediction: Any,
                          actual_value: Any, feedback: Dict[str, Any]) -> None:
        """
        Learn from feedback to improve symbolic rules

        Args:
            features: Input features
            prediction: Model prediction
            actual_value: Actual correct value
            feedback: User feedback
        """
        try:
            if not self.config['enable_rule_learning']:
                return

            # Update rule statistics
            self._update_rule_statistics(features, prediction, actual_value)

            # Generate new rules from feedback if needed
            feedback_score = feedback.get('validation_score', 0)
            if feedback_score < 0.7:  # Low validation score
                self._generate_correction_rules(features, prediction, actual_value)

            logger.info("Learned from feedback to improve symbolic rules")

        except Exception as e:
            logger.error(f"Error learning from feedback: {e}")

    def _update_rule_statistics(self, features: Dict[str, Any],
                              prediction: Any, actual_value: Any):
        """Update rule statistics based on feedback"""
        prediction_correct = str(prediction) == str(actual_value)

        for rule in self.rules:
            if rule.evaluate(features):
                rule.examples_count += 1
                if prediction_correct:
                    rule.correct_predictions += 1

    def _generate_correction_rules(self, features: Dict[str, Any],
                                 prediction: Any, actual_value: Any):
        """Generate new rules from corrections"""
        # Simple rule generation from feedback
        # In practice, this would be more sophisticated

        new_conditions = []
        for feature_name, feature_value in features.items():
            if isinstance(feature_value, (int, float)):
                # Create threshold-based condition
                conditions = [
                    Condition(feature_name, ComparisonOperator.GREATER_THAN, feature_value),
                    Condition(feature_name, ComparisonOperator.LESS_EQUAL, feature_value)
                ]
                new_conditions.extend(conditions)
            else:
                # Create equality condition
                condition = Condition(
                    feature_name,
                    ComparisonOperator.EQUALS,
                    feature_value
                )
                new_conditions.append(condition)

        # Create a new rule for correction
        if new_conditions:
            new_rule = Rule(
                rule_id=f"feedback_rule_{len(self.rules)}",
                rule_type=RuleType.PATTERN,
                conditions=new_conditions[:3],  # Limit to 3 conditions
                conclusion=str(actual_value),
                confidence=0.8,  # High confidence for user corrections
                support=0.1,     # Initial low support
                examples_count=1,
                correct_predictions=1
            )
            self.rules.append(new_rule)

    def get_rule_statistics(self) -> Dict[str, Any]:
        """Get comprehensive rule statistics"""
        if not self.rules:
            return {'total_rules': 0}

        stats = {
            'total_rules': len(self.rules),
            'rule_types': {},
            'confidence_distribution': {},
            'support_distribution': {},
            'average_confidence': 0.0,
            'average_support': 0.0,
            'average_accuracy': 0.0,
            'top_rules': []
        }

        # Calculate statistics
        confidences = []
        supports = []
        accuracies = []

        for rule in self.rules:
            # Rule type statistics
            rule_type = rule.rule_type.value
            stats['rule_types'][rule_type] = stats['rule_types'].get(rule_type, 0) + 1

            # Collect metrics
            confidences.append(rule.confidence)
            supports.append(rule.support)
            accuracies.append(rule.get_accuracy())

        # Calculate averages
        if confidences:
            stats['average_confidence'] = np.mean(confidences)
            stats['average_support'] = np.mean(supports)
            stats['average_accuracy'] = np.mean(accuracies)

        # Get top rules
        top_rules = sorted(self.rules, key=lambda r: r.confidence, reverse=True)[:10]
        stats['top_rules'] = [rule.to_dict() for rule in top_rules]

        # Confidence distribution
        confidence_bins = [0, 0.5, 0.7, 0.9, 1.0]
        for i in range(len(confidence_bins) - 1):
            bin_start = confidence_bins[i]
            bin_end = confidence_bins[i + 1]
            count = sum(1 for c in confidences if bin_start <= c < bin_end)
            stats['confidence_distribution'][f"{bin_start:.1f}-{bin_end:.1f}"] = count

        return stats

    def _update_performance_metrics(self):
        """Update internal performance metrics"""
        if not self.rules:
            return

        self.performance_metrics['total_rules'] = len(self.rules)

        # Rule type distribution
        type_counts = {}
        for rule in self.rules:
            rule_type = rule.rule_type.value
            type_counts[rule_type] = type_counts.get(rule_type, 0) + 1
        self.performance_metrics['rule_types'] = type_counts

        # Average confidence and support
        confidences = [rule.confidence for rule in self.rules]
        supports = [rule.support for rule in self.rules]

        if confidences:
            self.performance_metrics['average_confidence'] = np.mean(confidences)
            self.performance_metrics['average_support'] = np.mean(supports)

        # Rule accuracy
        accuracies = [rule.get_accuracy() for rule in self.rules if rule.examples_count > 0]
        if accuracies:
            self.performance_metrics['rule_accuracy'] = np.mean(accuracies)

        # Reasoning success rate
        if self.reasoning_paths:
            successful_paths = sum(1 for path in self.reasoning_paths
                                 if path.path_confidence > 0.5)
            self.performance_metrics['reasoning_success_rate'] = (
                successful_paths / len(self.reasoning_paths)
            )

    def export_rules(self, format_type: str = 'json') -> Dict[str, Any]:
        """
        Export rules in specified format

        Args:
            format_type: Export format ('json', 'text', 'detailed')

        Returns:
            Exported rules data
        """
        try:
            if format_type == 'json':
                return {
                    'rules': [rule.to_dict() for rule in self.rules],
                    'statistics': self.get_rule_statistics(),
                    'performance_metrics': self.performance_metrics,
                    'export_metadata': {
                        'timestamp': datetime.now().isoformat(),
                        'total_rules': len(self.rules),
                        'format': 'json'
                    }
                }

            elif format_type == 'text':
                text_rules = [rule.to_string() for rule in self.rules]
                return {
                    'text_rules': text_rules,
                    'statistics': self.get_rule_statistics(),
                    'export_metadata': {
                        'timestamp': datetime.now().isoformat(),
                        'total_rules': len(self.rules),
                        'format': 'text'
                    }
                }

            elif format_type == 'detailed':
                return {
                    'rules': [rule.to_dict() for rule in self.rules],
                    'reasoning_paths': [
                        {
                            'path_id': path.path_id,
                            'final_conclusion': path.final_conclusion,
                            'path_confidence': path.path_confidence,
                            'applied_rules': [rule.to_dict() for rule in path.rules],
                            'reasoning_steps': path.reasoning_steps
                        }
                        for path in self.reasoning_paths
                    ],
                    'statistics': self.get_rule_statistics(),
                    'performance_metrics': self.performance_metrics,
                    'configuration': self.config,
                    'export_metadata': {
                        'timestamp': datetime.now().isoformat(),
                        'total_rules': len(self.rules),
                        'total_reasoning_paths': len(self.reasoning_paths),
                        'format': 'detailed'
                    }
                }

            else:
                return {'error': f'Unsupported format: {format_type}'}

        except Exception as e:
            logger.error(f"Error exporting rules: {e}")
            return {'error': str(e)}

    def load_rules(self, rules_data: List[Dict[str, Any]]) -> int:
        """
        Load rules from data

        Args:
            rules_data: List of rule dictionaries

        Returns:
            Number of rules loaded
        """
        loaded_count = 0

        for rule_dict in rules_data:
            try:
                # Reconstruct conditions
                conditions = []
                for cond_dict in rule_dict.get('conditions', []):
                    condition = Condition(
                        feature=cond_dict['feature'],
                        operator=ComparisonOperator(cond_dict['operator']),
                        value=cond_dict['value'],
                        weight=cond_dict.get('weight', 1.0)
                    )
                    conditions.append(condition)

                # Reconstruct rule
                rule = Rule(
                    rule_id=rule_dict['rule_id'],
                    rule_type=RuleType(rule_dict['rule_type']),
                    conditions=conditions,
                    conclusion=rule_dict['conclusion'],
                    confidence=rule_dict['confidence'],
                    support=rule_dict['support'],
                    lift=rule_dict.get('lift', 1.0),
                    created_at=datetime.fromisoformat(rule_dict['created_at']),
                    examples_count=rule_dict.get('examples_count', 0),
                    correct_predictions=rule_dict.get('correct_predictions', 0),
                    logical_operator=LogicalOperator(rule_dict.get('logical_operator', 'AND'))
                )

                self.rules.append(rule)
                loaded_count += 1

            except Exception as e:
                logger.error(f"Error loading rule {rule_dict.get('rule_id', 'unknown')}: {e}")

        self._update_performance_metrics()
        logger.info(f"Loaded {loaded_count} rules successfully")

        return loaded_count

# Utility functions
def create_synthetic_reasoning_data(n_samples: int = 1000) -> pd.DataFrame:
    """Create synthetic data for testing symbolic reasoning"""
    np.random.seed(42)

    data = {
        'feature_1': np.random.normal(0, 1, n_samples),
        'feature_2': np.random.normal(0, 1, n_samples),
        'feature_3': np.random.choice(['A', 'B', 'C'], n_samples),
        'feature_4': np.random.uniform(0, 10, n_samples),
        'target': []
    }

    # Create target with some rule-based logic
    for i in range(n_samples):
        f1, f2, f3, f4 = data['feature_1'][i], data['feature_2'][i], data['feature_3'][i], data['feature_4'][i]

        # Rule 1: If feature_3 == 'A' and feature_4 > 5, then target = 'Class1'
        if f3 == 'A' and f4 > 5:
            target = 'Class1'
        # Rule 2: If feature_1 > 0 and feature_2 > 0, then target = 'Class2'
        elif f1 > 0 and f2 > 0:
            target = 'Class2'
        # Rule 3: If feature_3 == 'C' and feature_4 < 3, then target = 'Class3'
        elif f3 == 'C' and f4 < 3:
            target = 'Class3'
        else:
            target = 'Class0'

        data['target'].append(target)

    return pd.DataFrame(data)

if __name__ == "__main__":
    # Example usage
    # Create synthetic data
    data = create_synthetic_reasoning_data(500)

    # Initialize reasoning engine
    engine = SymbolicReasoningEngine()

    # Extract rules
    rules = engine.extract_rules_from_data(data, 'target')
    print(f"Extracted {len(rules)} symbolic rules")

    # Test reasoning on a sample case
    test_case = {
        'feature_1': 1.5,
        'feature_2': 0.8,
        'feature_3': 'A',
        'feature_4': 6.2
    }

    reasoning_path = engine.reason_about_case(test_case)
    if reasoning_path:
        print(f"Reasoning path confidence: {reasoning_path.path_confidence:.3f}")
        print(f"Final conclusion: {reasoning_path.final_conclusion}")
        print(f"Applied rules: {len(reasoning_path.rules)}")

    # Get rule statistics
    stats = engine.get_rule_statistics()
    print(f"Average rule confidence: {stats['average_confidence']:.3f}")
    print(f"Rule type distribution: {stats['rule_types']}")

    # Export rules
    exported = engine.export_rules('json')
    print(f"Exported {len(exported['rules'])} rules in JSON format")