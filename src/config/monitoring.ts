/**
 * Performance Monitoring Configuration
 * Central configuration for all performance monitoring and metrics collection
 */

export interface MonitoringConfig {
  enabled: boolean;
  interval: number; // ms
  retention: {
    metrics: number; // days
    logs: number; // days
    alerts: number; // days
  };
  thresholds: PerformanceThresholds;
  alerts: AlertConfig;
  endpoints: MonitoringEndpoints;
}

export interface PerformanceThresholds {
  responseTime: {
    warning: number; // ms
    critical: number; // ms
  };
  cpu: {
    warning: number; // percentage
    critical: number; // percentage
  };
  memory: {
    warning: number; // percentage
    critical: number; // percentage
  };
  diskIO: {
    readWarning: number; // MB/s
    readCritical: number; // MB/s
    writeWarning: number; // MB/s
    writeCritical: number; // MB/s
  };
  network: {
    latencyWarning: number; // ms
    latencyCritical: number; // ms
    throughputWarning: number; // Mbps
    throughputCritical: number; // Mbps
  };
  database: {
    queryTimeWarning: number; // ms
    queryTimeCritical: number; // ms
    connectionWarning: number; // percentage
    connectionCritical: number; // percentage
  };
  agentCoordination: {
    overheadWarning: number; // ms
    overheadCritical: number; // ms
    throughputWarning: number; // ops/sec
    throughputCritical: number; // ops/sec
  };
}

export interface AlertConfig {
  enabled: boolean;
  channels: AlertChannel[];
  cooldown: number; // minutes
  escalation: EscalationConfig;
}

export interface AlertChannel {
  type: 'email' | 'slack' | 'webhook' | 'console';
  enabled: boolean;
  config: Record<string, any>;
}

export interface EscalationConfig {
  enabled: boolean;
  levels: EscalationLevel[];
}

export interface EscalationLevel {
  threshold: number; // minutes
  channels: string[];
}

export interface MonitoringEndpoints {
  metrics: string;
  health: string;
  alerts: string;
  dashboard: string;
  webhook: string;
}

export const DEFAULT_MONITORING_CONFIG: MonitoringConfig = {
  enabled: true,
  interval: 5000, // 5 seconds
  retention: {
    metrics: 30, // 30 days
    logs: 7, // 7 days
    alerts: 30 // 30 days
  },
  thresholds: {
    responseTime: {
      warning: 500, // 500ms
      critical: 2000 // 2s
    },
    cpu: {
      warning: 70, // 70%
      critical: 90 // 90%
    },
    memory: {
      warning: 75, // 75%
      critical: 90 // 90%
    },
    diskIO: {
      readWarning: 50, // 50 MB/s
      readCritical: 100, // 100 MB/s
      writeWarning: 30, // 30 MB/s
      writeCritical: 60 // 60 MB/s
    },
    network: {
      latencyWarning: 100, // 100ms
      latencyCritical: 500, // 500ms
      throughputWarning: 100, // 100 Mbps
      throughputCritical: 50 // 50 Mbps (drop)
    },
    database: {
      queryTimeWarning: 200, // 200ms
      queryTimeCritical: 1000, // 1s
      connectionWarning: 80, // 80%
      connectionCritical: 95 // 95%
    },
    agentCoordination: {
      overheadWarning: 50, // 50ms
      overheadCritical: 200, // 200ms
      throughputWarning: 100, // 100 ops/sec
      throughputCritical: 50 // 50 ops/sec
    }
  },
  alerts: {
    enabled: true,
    channels: [
      {
        type: 'console',
        enabled: true,
        config: {}
      }
    ],
    cooldown: 5, // 5 minutes
    escalation: {
      enabled: false,
      levels: []
    }
  },
  endpoints: {
    metrics: '/api/monitoring/metrics',
    health: '/api/monitoring/health',
    alerts: '/api/monitoring/alerts',
    dashboard: '/monitoring',
    webhook: '/api/monitoring/webhook'
  }
};

export const MONITORING_CATEGORIES = {
  SYSTEM: 'system',
  APPLICATION: 'application',
  DATABASE: 'database',
  NETWORK: 'network',
  AGENTS: 'agents',
  API: 'api',
  PERFORMANCE: 'performance',
  ERRORS: 'errors'
} as const;

export const METRIC_TYPES = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  TIMER: 'timer'
} as const;