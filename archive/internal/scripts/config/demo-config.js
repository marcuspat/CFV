/**
 * Demo Configuration for Cognitive Fabric Visualizer
 *
 * This configuration defines all parameters, thresholds, and settings
 * for the comprehensive demo system.
 */

export const DEMO_CONFIG = {
  // Performance thresholds based on project specifications
  performanceThresholds: {
    maxProcessingTime: 5000,        // ms - cognitive decomposition target
    minRenderingFPS: 120,           // FPS for 3D visualization
    maxApiResponseTime: 100,        // ms for API calls
    maxMemoryUsage: '2GB',          // Maximum memory usage
    maxCpuUsage: 80,                // Maximum CPU usage percentage
    minCognitiveAccuracy: 0.90      // Minimum overall cognitive accuracy
  },

  // Cognitive accuracy targets from project specification
  cognitiveTargets: {
    factualAccuracy: 0.92,          // ≥92% accuracy for factual retrieval
    logicalPrecision: 0.85,         // ≥85% precision for logical inference
    creativeRougeL: 0.60,           // ≥0.60 ROUGE-L for creative synthesis
    metacognitiveF1: 0.96,          // ≥0.96 F1-score for meta-cognition
    overallAccuracy: 0.90           // Overall system accuracy target
  },

  // API endpoint configuration
  apiEndpoints: {
    base: process.env.API_BASE_URL || 'http://localhost:3000',
    conversations: '/api/conversations',
    analysis: '/api/analysis',
    visualizations: '/api/visualizations',
    exports: '/api/exports',
    health: '/health',
    ws: 'ws://localhost:3000'
  },

  // Demo execution parameters
  demoParameters: {
    maxConversations: 10,           // Maximum conversations to process
    conversationLength: {
      min: 5,                       // Minimum messages per conversation
      max: 50                       // Maximum messages per conversation
    },
    cognitiveComplexity: {
      low: 0.3,                     // 30% low complexity
      medium: 0.5,                  // 50% medium complexity
      high: 0.2                     // 20% high complexity
    },
    parallelProcessing: true,       // Enable parallel processing where possible
    retryAttempts: 3,               // Number of retry attempts for failed operations
    timeoutMs: 30000                // Default timeout for API operations
  },

  // Sample data generation parameters
  dataGeneration: {
    seed: null,                     // Random seed for reproducible generation
    topics: [
      'climate change',
      'artificial intelligence',
      'education systems',
      'healthcare innovation',
      'space exploration',
      'renewable energy',
      'quantum computing',
      'biodiversity conservation',
      'digital privacy',
      'sustainable development'
    ],
    participants: {
      min: 2,
      max: 4
    },
    messageLength: {
      minWords: 10,
      maxWords: 200,
      avgWords: 75
    }
  },

  // Validation configuration
  validation: {
    strictMode: true,               // Enable strict validation
    thresholds: {
      minimumSuccessRate: 0.80,     // 80% minimum success rate for demo
      minimumAccuracyScore: 0.85,  // 85% minimum cognitive accuracy
      maximumErrorRate: 0.10        // 10% maximum error rate
    },
    checks: {
      performance: true,            // Validate performance thresholds
      accuracy: true,               // Validate cognitive accuracy
      outputs: true,                // Validate output files
      integration: true             // Validate end-to-end integration
    }
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: 'scripts/logs/demo.log',
    console: true,
    maxSize: '10MB',
    maxFiles: 5,
    format: 'json',
    timestamps: true,
    colors: true
  },

  // Metrics collection configuration
  metrics: {
    enabled: true,
    collectionInterval: 100,        // ms - metrics collection interval
    memoryMonitoring: true,
    cpuMonitoring: true,
    networkMonitoring: true,
    performanceTracking: true,
    exportFormat: 'json',
    retentionPeriod: '24h'
  },

  // Report generation configuration
  reporting: {
    formats: ['json', 'markdown'],
    includeDetailedLogs: true,
    includePerformanceGraphs: false,    // Future enhancement
    includeCognitiveAnalysis: true,
    includeValidationResults: true,
    compressionEnabled: false,
    retentionPeriod: '7d'
  },

  // Export configuration
  export: {
    defaultFormats: ['json', 'csv', 'png'],
    quality: {
      images: 'high',
      data: 'full'
    },
    compression: {
      enabled: false,
      level: 6
    },
    encryption: {
      enabled: false
    }
  },

  // WebSocket configuration for real-time monitoring
  websocket: {
    enabled: true,
    reconnectAttempts: 3,
    reconnectDelay: 1000,          // ms
    heartbeatInterval: 30000,      // ms
    maxConnections: 10
  },

  // Error handling configuration
  errorHandling: {
    retryEnabled: true,
    maxRetries: 3,
    retryDelay: 1000,              // ms
    exponentialBackoff: true,
    continueOnError: true,          // Continue demo on non-critical errors
    errorReporting: true
  },

  // Environment-specific overrides
  environments: {
    development: {
      logging: { level: 'debug' },
      validation: { strictMode: false },
      performanceThresholds: {
        maxProcessingTime: 10000,   // More lenient for development
        maxApiResponseTime: 500
      }
    },
    production: {
      logging: { level: 'warn' },
      validation: { strictMode: true },
      performanceThresholds: {
        maxProcessingTime: 3000,    // Stricter for production
        maxApiResponseTime: 50
      }
    },
    testing: {
      logging: { level: 'error' },
      validation: { strictMode: true },
      demoParameters: {
        maxConversations: 1,
        retryAttempts: 1
      }
    }
  }
};

// Apply environment-specific overrides
function applyEnvironmentOverrides(config) {
  const env = process.env.NODE_ENV || 'development';
  const overrides = config.environments[env];

  if (overrides) {
    // Deep merge overrides
    function mergeDeep(target, source) {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          target[key] = target[key] || {};
          mergeDeep(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }

    mergeDeep(config, overrides);
  }

  return config;
}

// Export configuration with environment overrides applied
export const CONFIG = applyEnvironmentOverrides({ ...DEMO_CONFIG });

export default CONFIG;