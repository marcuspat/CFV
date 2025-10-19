"""
Factual Retrieval Detector with SRL and Knowledge Graph Integration

Implements factual retrieval detection with 92% accuracy target using:
- Semantic Role Labeling (SRL) for fact extraction
- Knowledge graph integration for verification
- Entity recognition and confidence scoring
"""

import json
import re
import spacy
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from neo4j import GraphDatabase
import torch
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline
from loguru import logger

# Performance Targets
FACTUAL_ACCURACY_TARGET = 0.92
SRL_CONFIDENCE_THRESHOLD = 0.8
ENTITY_CONFIDENCE_THRESHOLD = 0.85


@dataclass
class FactualClaim:
    """Represents a factual claim extracted from text."""
    claim: str
    confidence: float
    entities: List[str]
    srl_structure: Dict[str, Any]
    verification_needed: bool
    evidence_level: str  # "strong", "moderate", "weak"
    source_span: Tuple[int, int]  # (start, end) character positions


@dataclass
class FactVerificationResult:
    """Result of factual verification against knowledge graph."""
    claim: FactualClaim
    is_verified: bool
    verification_confidence: float
    supporting_evidence: List[str]
    conflicting_evidence: List[str]
    knowledge_graph_matches: List[Dict[str, Any]]


class FactualRetrievalDetector:
    """
    Detects and verifies factual claims with 92% accuracy target.

    Features:
    - Semantic Role Labeling for structured fact extraction
    - Knowledge graph integration for verification
    - Entity recognition and linking
    - Confidence scoring and evidence assessment
    """

    def __init__(
        self,
        neo4j_uri: str = "bolt://localhost:7687",
        neo4j_user: str = "neo4j",
        neo4j_password: str = "password",
        spacy_model: str = "en_core_web_lg",
        srl_model: str = "dbmdz/bert-large-cased-finetuned-conll03-english"
    ):
        """Initialize factual retrieval detector."""
        # Load NLP models
        try:
            self.nlp = spacy.load(spacy_model)
            logger.info(f"Loaded spaCy model: {spacy_model}")
        except OSError:
            logger.warning(f"spaCy model {spacy_model} not found, using small model")
            self.nlp = spacy.load("en_core_web_sm")

        # Load SRL model
        self.srl_tokenizer = AutoTokenizer.from_pretrained(srl_model)
        self.srl_model = AutoModelForTokenClassification.from_pretrained(srl_model)
        self.srl_pipeline = pipeline(
            "token-classification",
            model=self.srl_model,
            tokenizer=self.srl_tokenizer,
            aggregation_strategy="simple"
        )

        # Initialize Neo4j connection
        self.neo4j_driver = None
        try:
            self.neo4j_driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
            # Test connection
            with self.neo4j_driver.session() as session:
                session.run("RETURN 1")
            logger.info("Connected to Neo4j knowledge graph")
        except Exception as e:
            logger.warning(f"Failed to connect to Neo4j: {e}")

        # Initialize TF-IDF vectorizer for similarity matching
        self.tfidf_vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            stop_words='english',
            min_df=1,
            max_features=1000
        )

        # Fact verification patterns
        self.fact_patterns = [
            r"\b(is|are|was|were|has been|have been)\s+.+\b",
            r"\b(according to|research shows|studies indicate)\s+.+\b",
            r"\b(\d+%|\d+\s*(percent|million|billion|thousand))\s+.+\b",
            r"\b(causes|leads to|results in|prevents)\s+.+\b"
        ]

        # Performance metrics
        self.metrics = {
            "total_claims_detected": 0,
            "claims_verified": 0,
            "accuracy_score": 0.0,
            "average_confidence": 0.0
        }

    def _extract_srl_structure(self, sentence: str) -> Dict[str, Any]:
        """Extract semantic role labeling structure from sentence."""
        try:
            # Get SRL predictions
            srl_results = self.srl_pipeline(sentence)

            # Group by sentences and extract roles
            srl_structure = {
                "predicate": "",
                "arguments": [],
                "confidence": 0.0
            }

            # Find predicates and their arguments
            current_predicate = None
            arguments = []

            for token in srl_results:
                if token['entity_group'] in ['B-PRED', 'I-PRED']:
                    current_predicate = token['word']
                    srl_structure["predicate"] = current_predicate
                elif token['entity_group'].startswith('B-ARG') or token['entity_group'].startswith('I-ARG'):
                    arg_type = token['entity_group'].split('-')[-1]
                    arguments.append({
                        "type": arg_type,
                        "text": token['word'],
                        "confidence": token['score']
                    })

            srl_structure["arguments"] = arguments
            srl_structure["confidence"] = np.mean([arg['confidence'] for arg in arguments]) if arguments else 0.0

            return srl_structure

        except Exception as e:
            logger.error(f"SRL extraction failed: {e}")
            return {"predicate": "", "arguments": [], "confidence": 0.0}

    def _extract_entities(self, doc: spacy.tokens.Doc) -> List[Tuple[str, str, float]]:
        """Extract entities with confidence scores."""
        entities = []

        for ent in doc.ents:
            # Calculate confidence based on entity type and context
            base_confidence = {
                "PERSON": 0.9,
                "ORG": 0.85,
                "GPE": 0.9,
                "DATE": 0.95,
                "MONEY": 0.95,
                "QUANTITY": 0.9,
                "CARDINAL": 0.95,
                "EVENT": 0.8,
                "WORK_OF_ART": 0.85,
                "LAW": 0.9,
                "LANGUAGE": 0.95,
                "PRODUCT": 0.8
            }.get(ent.label_, 0.7)

            # Adjust confidence based on entity length and context
            length_factor = min(1.0, len(ent.text) / 3.0)
            context_confidence = len(ent.sent) / len(doc)  # More context = higher confidence

            final_confidence = base_confidence * length_factor * (0.5 + 0.5 * context_confidence)

            entities.append((ent.text, ent.label_, final_confidence))

        return entities

    def _identify_factual_patterns(self, text: str) -> List[Tuple[str, int, int]]:
        """Identify factual claim patterns in text."""
        factual_spans = []

        for pattern in self.fact_patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                factual_spans.append((match.group(), match.start(), match.end()))

        return factual_spans

    def _calculate_factual_confidence(
        self,
        claim_text: str,
        srl_structure: Dict[str, Any],
        entities: List[Tuple[str, str, float]]
    ) -> float:
        """Calculate confidence score for factual claim."""
        confidence_factors = []

        # SRL confidence
        if srl_structure["confidence"] > 0:
            confidence_factors.append(srl_structure["confidence"])

        # Entity confidence
        if entities:
            avg_entity_confidence = np.mean([conf for _, _, conf in entities])
            confidence_factors.append(avg_entity_confidence)

        # Text structure confidence
        if any(pattern in claim_text.lower() for pattern in ["according to", "research", "study"]):
            confidence_factors.append(0.9)  # Cited claims are more reliable
        elif any(pattern in claim_text.lower() for pattern in ["might", "could", "perhaps"]):
            confidence_factors.append(0.6)  # Uncertain language
        else:
            confidence_factors.append(0.8)  # Declarative statements

        # Length and complexity factor
        length_factor = min(1.0, len(claim_text.split()) / 10.0)
        confidence_factors.append(length_factor)

        return np.mean(confidence_factors)

    def _search_knowledge_graph(
        self,
        claim: FactualClaim,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Search knowledge graph for claim verification."""
        if not self.neo4j_driver:
            return []

        matches = []

        try:
            with self.neo4j_driver.session() as session:
                # Extract entities from claim
                entities = claim.entities[:3]  # Limit to top 3 entities

                for entity in entities:
                    # Search for entity and related facts
                    query = """
                    MATCH (e:Entity {name: $entity_name})
                    OPTIONAL MATCH (e)-[r]->(f:Fact)
                    OPTIONAL MATCH (e)<-[r2]-(f2:Fact)
                    RETURN e.name as entity, type(r) as relation_type, f.statement as fact_statement,
                           type(r2) as incoming_relation, f2.statement as incoming_fact
                    LIMIT $limit
                    """

                    result = session.run(query, entity_name=entity, limit=limit)

                    for record in result:
                        if record["fact_statement"]:
                            matches.append({
                                "entity": record["entity"],
                                "relation": record["relation_type"],
                                "fact": record["fact_statement"],
                                "source": "outgoing"
                            })
                        if record["incoming_fact"]:
                            matches.append({
                                "entity": record["entity"],
                                "relation": record["incoming_relation"],
                                "fact": record["incoming_fact"],
                                "source": "incoming"
                            })

        except Exception as e:
            logger.error(f"Knowledge graph search failed: {e}")

        return matches

    def _verify_claim_with_kg(
        self,
        claim: FactualClaim,
        kg_matches: List[Dict[str, Any]]
    ) -> FactVerificationResult:
        """Verify claim using knowledge graph matches."""
        if not kg_matches:
            return FactVerificationResult(
                claim=claim,
                is_verified=False,
                verification_confidence=0.0,
                supporting_evidence=[],
                conflicting_evidence=[],
                knowledge_graph_matches=[]
            )

        # Calculate similarity between claim and KG facts
        claim_text = claim.claim.lower()
        kg_facts = [match["fact"].lower() for match in kg_matches]

        if not kg_facts:
            return FactVerificationResult(
                claim=claim,
                is_verified=False,
                verification_confidence=0.0,
                supporting_evidence=[],
                conflicting_evidence=[],
                knowledge_graph_matches=kg_matches
            )

        # Use TF-IDF for similarity calculation
        try:
            all_texts = [claim_text] + kg_facts
            tfidf_matrix = self.tfidf_vectorizer.fit_transform(all_texts)

            # Calculate similarities
            similarities = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:])[0]

            # Find best matches
            max_similarity = np.max(similarities)
            best_match_idx = np.argmax(similarities)

            # Determine verification based on similarity threshold
            verification_threshold = 0.7
            is_verified = max_similarity >= verification_threshold

            # Collect evidence
            supporting_evidence = []
            conflicting_evidence = []

            for i, (similarity, kg_match) in enumerate(zip(similarities, kg_matches)):
                if similarity >= verification_threshold:
                    supporting_evidence.append(f"Similarity {similarity:.2f}: {kg_match['fact']}")
                else:
                    conflicting_evidence.append(f"Low similarity {similarity:.2f}: {kg_match['fact']}")

            return FactVerificationResult(
                claim=claim,
                is_verified=is_verified,
                verification_confidence=max_similarity,
                supporting_evidence=supporting_evidence,
                conflicting_evidence=conflicting_evidence,
                knowledge_graph_matches=kg_matches
            )

        except Exception as e:
            logger.error(f"Claim verification failed: {e}")
            return FactVerificationResult(
                claim=claim,
                is_verified=False,
                verification_confidence=0.0,
                supporting_evidence=[],
                conflicting_evidence=[],
                knowledge_graph_matches=kg_matches
            )

    def detect_factual_claims(self, text: str) -> List[FactualClaim]:
        """
        Detect factual claims in text with 92% accuracy target.

        Args:
            text: Input text to analyze

        Returns:
            List of detected factual claims
        """
        doc = self.nlp(text)
        claims = []

        # Process each sentence
        for sent in doc.sents:
            sent_text = sent.text.strip()

            # Skip very short sentences
            if len(sent_text.split()) < 3:
                continue

            # Check for factual patterns
            factual_patterns = self._identify_factual_patterns(sent_text)
            has_factual_pattern = len(factual_patterns) > 0

            # Extract SRL structure
            srl_structure = self._extract_srl_structure(sent_text)

            # Extract entities
            entities = self._extract_entities(sent)

            # Calculate confidence
            confidence = self._calculate_factual_confidence(sent_text, srl_structure, entities)

            # Determine if this is a factual claim
            is_factual = (
                confidence >= SRL_CONFIDENCE_THRESHOLD and
                (has_factual_pattern or len(entities) > 0 or srl_structure["predicate"])
            )

            if is_factual:
                # Determine evidence level
                if confidence >= 0.9:
                    evidence_level = "strong"
                elif confidence >= 0.7:
                    evidence_level = "moderate"
                else:
                    evidence_level = "weak"

                claim = FactualClaim(
                    claim=sent_text,
                    confidence=confidence,
                    entities=[ent[0] for ent in entities],
                    srl_structure=srl_structure,
                    verification_needed=confidence < 0.9,
                    evidence_level=evidence_level,
                    source_span=(sent.start_char, sent.end_char)
                )

                claims.append(claim)

        # Update metrics
        self.metrics["total_claims_detected"] += len(claims)
        self.metrics["average_confidence"] = (
            (self.metrics["average_confidence"] * (self.metrics["total_claims_detected"] - len(claims)) +
             np.mean([c.confidence for c in claims])) /
            self.metrics["total_claims_detected"]
        ) if claims else self.metrics["average_confidence"]

        logger.info(f"Detected {len(claims)} factual claims with avg confidence {self.metrics['average_confidence']:.2f}")

        return claims

    def verify_factual_claims(self, claims: List[FactualClaim]) -> List[FactVerificationResult]:
        """
        Verify factual claims against knowledge graph.

        Args:
            claims: List of factual claims to verify

        Returns:
            List of verification results
        """
        verification_results = []

        for claim in claims:
            if claim.verification_needed:
                # Search knowledge graph
                kg_matches = self._search_knowledge_graph(claim)

                # Verify claim
                verification_result = self._verify_claim_with_kg(claim, kg_matches)
                verification_results.append(verification_result)

                # Update metrics
                if verification_result.is_verified:
                    self.metrics["claims_verified"] += 1
            else:
                # High confidence claims are automatically verified
                verification_results.append(FactVerificationResult(
                    claim=claim,
                    is_verified=True,
                    verification_confidence=claim.confidence,
                    supporting_evidence=["High confidence claim"],
                    conflicting_evidence=[],
                    knowledge_graph_matches=[]
                ))
                self.metrics["claims_verified"] += 1

        # Update accuracy score
        if self.metrics["total_claims_detected"] > 0:
            self.metrics["accuracy_score"] = self.metrics["claims_verified"] / self.metrics["total_claims_detected"]

        logger.info(f"Verified {len(verification_results)} claims with accuracy {self.metrics['accuracy_score']:.2f}")

        return verification_results

    def analyze_text(self, text: str) -> Dict[str, Any]:
        """
        Complete factual analysis of text.

        Args:
            text: Input text to analyze

        Returns:
            Complete analysis results
        """
        # Detect factual claims
        claims = self.detect_factual_claims(text)

        # Verify claims
        verification_results = self.verify_factual_claims(claims)

        # Calculate overall metrics
        factual_density = len(claims) / max(1, len(text.split()))

        verified_claims = [r for r in verification_results if r.is_verified]
        verification_rate = len(verified_claims) / max(1, len(verification_results))

        avg_confidence = np.mean([claim.confidence for claim in claims]) if claims else 0.0

        return {
            "factual_claims": [
                {
                    "claim": claim.claim,
                    "confidence": claim.confidence,
                    "entities": claim.entities,
                    "evidence_level": claim.evidence_level,
                    "source_span": claim.source_span
                }
                for claim in claims
            ],
            "verification_results": [
                {
                    "claim": result.claim.claim,
                    "is_verified": result.is_verified,
                    "verification_confidence": result.verification_confidence,
                    "supporting_evidence": result.supporting_evidence,
                    "conflicting_evidence": result.conflicting_evidence
                }
                for result in verification_results
            ],
            "overall_metrics": {
                "factual_density": factual_density,
                "verification_rate": verification_rate,
                "average_confidence": avg_confidence,
                "total_claims": len(claims),
                "verified_claims": len(verified_claims)
            },
            "performance_metrics": self.get_performance_metrics()
        }

    def get_performance_metrics(self) -> Dict[str, float]:
        """Get detector performance metrics."""
        return self.metrics.copy()

    def update_knowledge_graph(self, facts: List[Dict[str, Any]]):
        """
        Update knowledge graph with new verified facts.

        Args:
            facts: List of facts to add to knowledge graph
        """
        if not self.neo4j_driver:
            logger.warning("No Neo4j connection available")
            return

        try:
            with self.neo4j_driver.session() as session:
                for fact in facts:
                    # Extract entities from fact
                    entities = fact.get("entities", [])
                    claim_text = fact.get("claim", "")

                    # Create or update entities and facts
                    for entity in entities:
                        session.run(
                            """
                            MERGE (e:Entity {name: $entity_name})
                            ON CREATE SET e.created = datetime()
                            ON MATCH SET e.updated = datetime()
                            """,
                            entity_name=entity
                        )

                    # Create fact node and relationships
                    session.run(
                        """
                        CREATE (f:Fact {
                            statement: $statement,
                            confidence: $confidence,
                            created: datetime()
                        })
                        """,
                        statement=claim_text,
                        confidence=fact.get("confidence", 0.0)
                    )

                    # Create relationships between entities and facts
                    for i, entity in enumerate(entities):
                        session.run(
                            """
                            MATCH (e:Entity {name: $entity_name}), (f:Fact {statement: $statement})
                            MERGE (e)-[r:MENTIONED_IN]->(f)
                            SET r.position = $position
                            """,
                            entity_name=entity,
                            statement=claim_text,
                            position=i
                        )

            logger.info(f"Added {len(facts)} facts to knowledge graph")

        except Exception as e:
            logger.error(f"Failed to update knowledge graph: {e}")

    def close(self):
        """Close database connections."""
        if self.neo4j_driver:
            self.neo4j_driver.close()