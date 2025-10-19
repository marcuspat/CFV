"""
Configuration Management for Multi-modal Cognitive Fabric Visualizer

Centralized configuration for all multi-modal processing components,
performance settings, and system parameters.
"""

import os
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass, field
from pathlib import Path
import json
from loguru import logger


@dataclass
class AudioProcessingConfig:
    """Configuration for audio processing components."""
    whisper_model_size: str = "base"  # tiny, base, small, medium, large
    sample_rate: int = 16000
    chunk_length_s: int = 30
    enable_gpu: bool = True
    prosody_analysis: bool = True
    speaker_diarization: bool = True
    confidence_threshold: float = 0.7
    max_audio_length: int = 600  # seconds

@dataclass
class VisualProcessingConfig:
    """Configuration for visual processing components."""
    clip_model_name: str = "openai/clip-vit-base-patch32"
    blip_model_name: str = "Salesforce/blip-image-captioning-base"
    enable_gpu: bool = True
    max_frames: int = 30
    frame_resolution: tuple = (224, 224)
    object_detection: bool = True
    gesture_recognition: bool = True
    whiteboard_extraction: bool = True
    attention_map_generation: bool = True

@dataclass
class TextProcessingConfig:
    """Configuration for text processing components."""
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    max_text_length: int = 2048
    semantic_analysis: bool = True
    linguistic_features: bool = True
    contextual_enrichment: bool = True

@dataclass
class FusionConfig:
    """Configuration for cross-modal fusion."""
    hidden_dimension: int = 512
    attention_heads: int = 8
    fusion_layers: int = 2
    dropout_rate: float = 0.1
    temporal_fusion: bool = True
    adaptive_weighting: bool = True
    feature_alignment: bool = True

@dataclass
class ConversationConfig:
    """Configuration for conversation analysis."""
    max_speakers: int = 10
    min_speakers: int = 1
    speaker_embedding_dim: int = 256
    turn_detection_threshold: float = 0.3
    enable_real_time_analysis: bool = True
    conversation_segment_length: float = 60.0  # seconds

@dataclass
class PerformanceConfig:
    """Configuration for performance optimization."""
    enable_gpu_acceleration: bool = True
    enable_batch_processing: bool = True
    batch_size: int = 8
    max_workers: int = None  # Auto-detect if None
    memory_limit_gb: float = 8.0
    gpu_memory_fraction: float = 0.8
    enable_model_caching: bool = True
    cache_size: int = 1000
    real_time_processing_target: float = 0.5  # seconds

@dataclass
class APIConfig:
    """Configuration for API integrations."""
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password"
    request_timeout: float = 30.0
    max_retries: int = 3
    retry_delay: float = 1.0

@dataclass
class LoggingConfig:
    """Configuration for logging."""
    level: str = "INFO"
    file_path: Optional[str] = "logs/multimodal_processing.log"
    max_file_size: str = "10 MB"
    backup_count: int = 5
    enable_console: bool = True
    format_string: str = "{time:YYYY-MM-DD HH:mm:ss} | {level} | {name}:{function}:{line} | {message}"

@dataclass
class MultiModalConfig:
    """Main configuration class for multi-modal processing."""
    # Component configurations
    audio: AudioProcessingConfig = field(default_factory=AudioProcessingConfig)
    visual: VisualProcessingConfig = field(default_factory=VisualProcessingConfig)
    text: TextProcessingConfig = field(default_factory=TextProcessingConfig)
    fusion: FusionConfig = field(default_factory=FusionConfig)
    conversation: ConversationConfig = field(default_factory=ConversationConfig)
    performance: PerformanceConfig = field(default_factory=PerformanceConfig)
    api: APIConfig = field(default_factory=APIConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)

    # System settings
    system_name: str = "Cognitive Fabric Multi-modal Processor"
    version: str = "1.0.0"
    debug_mode: bool = False
    data_dir: str = "data/multimodal"
    temp_dir: str = "temp/multimodal"

    # Performance targets
    contextual_improvement_target: float = 0.25
    processing_latency_target: float = 3.0
    confidence_threshold: float = 0.7
    accuracy_targets: Dict[str, float] = field(default_factory=lambda: {
        'factual_retrieval': 0.92,
        'logical_inference': 0.85,
        'creative_synthesis': 0.60,
        'meta_cognition': 0.96
    })

    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary."""
        result = {}
        for key, value in self.__dict__.items():
            if hasattr(value, 'to_dict'):
                result[key] = value.to_dict()
            elif isinstance(value, dict):
                result[key] = value
            else:
                result[key] = str(value)
        return result

    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]) -> 'MultiModalConfig':
        """Create configuration from dictionary."""
        config = cls()

        for key, value in config_dict.items():
            if hasattr(config, key):
                if key in ['audio', 'visual', 'text', 'fusion', 'conversation', 'performance', 'api', 'logging']:
                    # Update nested configuration
                    nested_config = getattr(config, key)
                    for nested_key, nested_value in value.items():
                        if hasattr(nested_config, nested_key):
                            setattr(nested_config, nested_key, nested_value)
                else:
                    setattr(config, key, value)

        return config

    def save_to_file(self, file_path: str):
        """Save configuration to JSON file."""
        try:
            Path(file_path).parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, 'w') as f:
                json.dump(self.to_dict(), f, indent=2, default=str)
            logger.info(f"Configuration saved to {file_path}")
        except Exception as e:
            logger.error(f"Failed to save configuration: {e}")
            raise

    @classmethod
    def load_from_file(cls, file_path: str) -> 'MultiModalConfig':
        """Load configuration from JSON file."""
        try:
            with open(file_path, 'r') as f:
                config_dict = json.load(f)
            config = cls.from_dict(config_dict)
            logger.info(f"Configuration loaded from {file_path}")
            return config
        except Exception as e:
            logger.error(f"Failed to load configuration: {e}")
            return cls()  # Return default configuration

    def update_from_env(self):
        """Update configuration from environment variables."""
        # API Keys
        if os.getenv('OPENAI_API_KEY'):
            self.api.openai_api_key = os.getenv('OPENAI_API_KEY')
        if os.getenv('ANTHROPIC_API_KEY'):
            self.api.anthropic_api_key = os.getenv('ANTHROPIC_API_KEY')

        # Database
        if os.getenv('NEO4J_URI'):
            self.api.neo4j_uri = os.getenv('NEO4J_URI')
        if os.getenv('NEO4J_USER'):
            self.api.neo4j_user = os.getenv('NEO4J_USER')
        if os.getenv('NEO4J_PASSWORD'):
            self.api.neo4j_password = os.getenv('NEO4J_PASSWORD')

        # Performance
        if os.getenv('ENABLE_GPU'):
            self.performance.enable_gpu_acceleration = os.getenv('ENABLE_GPU').lower() == 'true'
        if os.getenv('BATCH_SIZE'):
            self.performance.batch_size = int(os.getenv('BATCH_SIZE'))
        if os.getenv('MEMORY_LIMIT'):
            self.performance.memory_limit_gb = float(os.getenv('MEMORY_LIMIT'))

        # Debug mode
        if os.getenv('DEBUG'):
            self.debug_mode = os.getenv('DEBUG').lower() == 'true'

        # Logging
        if os.getenv('LOG_LEVEL'):
            self.logging.level = os.getenv('LOG_LEVEL')

        logger.info("Configuration updated from environment variables")

    def validate(self) -> List[str]:
        """Validate configuration and return list of issues."""
        issues = []

        # Validate API keys
        if not self.api.openai_api_key:
            issues.append("OpenAI API key not configured")
        if not self.api.anthropic_api_key:
            issues.append("Anthropic API key not configured")

        # Validate paths
        if not Path(self.data_dir).exists():
            try:
                Path(self.data_dir).mkdir(parents=True, exist_ok=True)
            except Exception:
                issues.append(f"Cannot create data directory: {self.data_dir}")

        if not Path(self.temp_dir).exists():
            try:
                Path(self.temp_dir).mkdir(parents=True, exist_ok=True)
            except Exception:
                issues.append(f"Cannot create temp directory: {self.temp_dir}")

        # Validate performance settings
        if self.performance.batch_size <= 0:
            issues.append("Batch size must be positive")
        if self.performance.memory_limit_gb <= 0:
            issues.append("Memory limit must be positive")
        if not 0.0 <= self.performance.gpu_memory_fraction <= 1.0:
            issues.append("GPU memory fraction must be between 0 and 1")

        # Validate accuracy targets
        for key, value in self.accuracy_targets.items():
            if not 0.0 <= value <= 1.0:
                issues.append(f"Accuracy target for {key} must be between 0 and 1")

        # Validate fusion config
        if self.fusion.hidden_dimension <= 0:
            issues.append("Fusion hidden dimension must be positive")
        if self.fusion.attention_heads <= 0:
            issues.append("Fusion attention heads must be positive")

        return issues

    def setup_logging(self):
        """Setup logging based on configuration."""
        try:
            import sys
            from loguru import logger

            # Remove default handler
            logger.remove()

            # Add console handler if enabled
            if self.logging.enable_console:
                logger.add(
                    sys.stderr,
                    level=self.logging.level,
                    format=self.logging.format_string
                )

            # Add file handler if configured
            if self.logging.file_path:
                Path(self.logging.file_path).parent.mkdir(parents=True, exist_ok=True)
                logger.add(
                    self.logging.file_path,
                    level=self.logging.level,
                    format=self.logging.format_string,
                    rotation=self.logging.max_file_size,
                    backup_count=self.logging.backup_count
                )

            logger.info(f"Logging configured at level: {self.logging.level}")

        except Exception as e:
            print(f"Failed to setup logging: {e}")

    def print_summary(self):
        """Print configuration summary."""
        print(f"\n=== {self.system_name} v{self.version} ===")
        print(f"Contextual Improvement Target: {self.contextual_improvement_target:.1%}")
        print(f"Processing Latency Target: {self.processing_latency_target}s")
        print(f"GPU Acceleration: {'Enabled' if self.performance.enable_gpu_acceleration else 'Disabled'}")
        print(f"Batch Processing: {'Enabled' if self.performance.enable_batch_processing else 'Disabled'}")
        print(f"Debug Mode: {'Enabled' if self.debug_mode else 'Disabled'}")
        print(f"Data Directory: {self.data_dir}")
        print(f"API Keys Configured: {bool(self.api.openai_api_key and self.api.anthropic_api_key)}")
        print("=" * 50)


# Global configuration instance
_config: Optional[MultiModalConfig] = None


def get_config() -> MultiModalConfig:
    """Get global configuration instance."""
    global _config
    if _config is None:
        _config = MultiModalConfig()
        _config.update_from_env()
        _config.setup_logging()
    return _config


def set_config(config: MultiModalConfig):
    """Set global configuration instance."""
    global _config
    _config = config
    _config.setup_logging()


def load_config_from_file(file_path: str) -> MultiModalConfig:
    """Load configuration from file and set as global."""
    config = MultiModalConfig.load_from_file(file_path)
    config.update_from_env()
    config.setup_logging()
    set_config(config)
    return config


def create_default_config_file(file_path: str = "config/multimodal_config.json"):
    """Create default configuration file."""
    config = MultiModalConfig()
    config.save_to_file(file_path)
    print(f"Default configuration created at: {file_path}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Multi-modal Configuration Manager")
    parser.add_argument("--create-default", action="store_true", help="Create default configuration file")
    parser.add_argument("--config-file", default="config/multimodal_config.json", help="Configuration file path")
    parser.add_argument("--validate", action="store_true", help="Validate configuration")
    parser.add_argument("--summary", action="store_true", help="Print configuration summary")

    args = parser.parse_args()

    if args.create_default:
        create_default_config_file(args.config_file)

    config = load_config_from_file(args.config_file)

    if args.validate:
        issues = config.validate()
        if issues:
            print("Configuration issues found:")
            for issue in issues:
                print(f"  - {issue}")
        else:
            print("Configuration is valid")

    if args.summary:
        config.print_summary()