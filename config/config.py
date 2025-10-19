"""
Configuration settings for Cognitive Fabric Visualizer ML Engine
"""

import os
from typing import Optional, Dict, Any
from pydantic import BaseSettings, Field


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    # API Configuration
    api_title: str = "Cognitive Fabric Visualizer API"
    api_description: str = "Real-time cognitive decomposition and analysis API"
    api_version: str = "1.0.0"
    api_host: str = Field(default="0.0.0.0", env="API_HOST")
    api_port: int = Field(default=8000, env="API_PORT")
    debug: bool = Field(default=False, env="DEBUG")

    # Performance Targets
    max_processing_time: float = Field(default=5.0, env="MAX_PROCESSING_TIME")
    cache_ttl: int = Field(default=3600, env="CACHE_TTL")
    max_text_length: int = Field(default=10000, env="MAX_TEXT_LENGTH")
    min_text_length: int = Field(default=10, env="MIN_TEXT_LENGTH")

    # LLM API Configuration
    openai_api_key: Optional[str] = Field(default=None, env="OPENAI_API_KEY")
    anthropic_api_key: Optional[str] = Field(default=None, env="ANTHROPIC_API_KEY")
    openai_max_retries: int = Field(default=3, env="OPENAI_MAX_RETRIES")
    anthropic_max_retries: int = Field(default=3, env="ANTHROPIC_MAX_RETRIES")

    # Neo4j Configuration
    neo4j_uri: str = Field(default="bolt://localhost:7687", env="NEO4J_URI")
    neo4j_user: str = Field(default="neo4j", env="NEO4J_USER")
    neo4j_password: str = Field(default="password", env="NEO4J_PASSWORD")
    neo4j_max_connection_lifetime: int = Field(default=3600, env="NEO4J_MAX_CONNECTION_LIFETIME")
    neo4j_max_connection_pool_size: int = Field(default=50, env="NEO4J_MAX_CONNECTION_POOL_SIZE")

    # Redis Configuration
    redis_host: str = Field(default="localhost", env="REDIS_HOST")
    redis_port: int = Field(default=6379, env="REDIS_PORT")
    redis_password: Optional[str] = Field(default=None, env="REDIS_PASSWORD")
    redis_db: int = Field(default=0, env="REDIS_DB")
    redis_socket_timeout: int = Field(default=5, env="REDIS_SOCKET_TIMEOUT")
    redis_socket_connect_timeout: int = Field(default=5, env="REDIS_SOCKET_CONNECT_TIMEOUT")

    # ML Model Configuration
    spacy_model: str = Field(default="en_core_web_lg", env="SPACY_MODEL")
    sentence_transformer_model: str = Field(default="all-MiniLM-L6-v2", env="SENTENCE_TRANSFORMER_MODEL")
    generative_model: str = Field(default="facebook/bart-large-cnn", env="GENERATIVE_MODEL")
    gpt_model: str = Field(default="gpt2", env="GPT_MODEL")

    # Performance Targets
    factual_accuracy_target: float = Field(default=0.92, env="FACTUAL_ACCURACY_TARGET")
    logical_precision_target: float = Field(default=0.85, env="LOGICAL_PRECISION_TARGET")
    creative_rouge_l_target: float = Field(default=0.60, env="CREATIVE_ROUGE_L_TARGET")
    metacognitive_f1_target: float = Field(default=0.96, env="METACOGNITIVE_F1_TARGET")
    overall_precision_target: float = Field(default=0.95, env="OVERALL_PRECISION_TARGET")

    # Logging Configuration
    log_level: str = Field(default="INFO", env="LOG_LEVEL")
    log_file: Optional[str] = Field(default=None, env="LOG_FILE")
    log_rotation: str = Field(default="1 day", env="LOG_ROTATION")
    log_retention: str = Field(default="1 month", env="LOG_RETENTION")

    # Security Configuration
    cors_origins: str = Field(default="*", env="CORS_ORIGINS")
    cors_allow_credentials: bool = Field(default=True, env="CORS_ALLOW_CREDENTIALS")
    cors_allow_methods: str = Field(default="*", env="CORS_ALLOW_METHODS")
    cors_allow_headers: str = Field(default="*", env="CORS_ALLOW_HEADERS")

    # Monitoring Configuration
    enable_metrics: bool = Field(default=True, env="ENABLE_METRICS")
    metrics_port: int = Field(default=9090, env="METRICS_PORT")
    enable_tracing: bool = Field(default=False, env="ENABLE_TRACING")
    tracing_endpoint: Optional[str] = Field(default=None, env="TRACING_ENDPOINT")

    # Development Configuration
    enable_reload: bool = Field(default=True, env="ENABLE_RELOAD")
    enable_profiling: bool = Field(default=False, env="ENABLE_PROFILING")
    mock_external_apis: bool = Field(default=False, env="MOCK_EXTERNAL_APIS")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get application settings."""
    return settings


def get_model_config() -> Dict[str, Any]:
    """Get ML model configuration."""
    return {
        "spacy_model": settings.spacy_model,
        "sentence_transformer_model": settings.sentence_transformer_model,
        "generative_model": settings.generative_model,
        "gpt_model": settings.gpt_model,
        "performance_targets": {
            "factual_accuracy": settings.factual_accuracy_target,
            "logical_precision": settings.logical_precision_target,
            "creative_rouge_l": settings.creative_rouge_l_target,
            "metacognitive_f1": settings.metacognitive_f1_target,
            "overall_precision": settings.overall_precision_target
        }
    }


def get_database_config() -> Dict[str, Any]:
    """Get database configuration."""
    return {
        "neo4j": {
            "uri": settings.neo4j_uri,
            "user": settings.neo4j_user,
            "password": settings.neo4j_password,
            "max_connection_lifetime": settings.neo4j_max_connection_lifetime,
            "max_connection_pool_size": settings.neo4j_max_connection_pool_size
        },
        "redis": {
            "host": settings.redis_host,
            "port": settings.redis_port,
            "password": settings.redis_password,
            "db": settings.redis_db,
            "socket_timeout": settings.redis_socket_timeout,
            "socket_connect_timeout": settings.redis_socket_connect_timeout
        }
    }


def get_api_config() -> Dict[str, Any]:
    """Get API configuration."""
    return {
        "title": settings.api_title,
        "description": settings.api_description,
        "version": settings.api_version,
        "host": settings.api_host,
        "port": settings.api_port,
        "debug": settings.debug,
        "max_processing_time": settings.max_processing_time,
        "cache_ttl": settings.cache_ttl,
        "max_text_length": settings.max_text_length,
        "min_text_length": settings.min_text_length
    }


def get_llm_config() -> Dict[str, Any]:
    """Get LLM API configuration."""
    return {
        "openai": {
            "api_key": settings.openai_api_key,
            "max_retries": settings.openai_max_retries
        },
        "anthropic": {
            "api_key": settings.anthropic_api_key,
            "max_retries": settings.anthropic_max_retries
        }
    }