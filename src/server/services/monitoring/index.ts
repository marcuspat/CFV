/**
 * Performance Monitoring Services Index
 * Central export point for all monitoring services
 */

export { metricsCollector, MetricsCollector, Metric, MetricSnapshot, SystemInfo } from './MetricsCollector.js';
export { performanceAnalyzer, PerformanceAnalyzer, Anomaly, Bottleneck, PerformanceReport } from './PerformanceAnalyzer.js';
export { executionTimer, ExecutionTimer, ExecutionTiming, timing } from './ExecutionTimer.js';
export { resourceMonitor, ResourceMonitor, ResourceMetrics, CPUMetrics, MemoryMetrics, DiskMetrics, NetworkMetrics } from './ResourceMonitor.js';
export { networkMonitor, NetworkMonitor, NetworkPerformanceMetrics, NetworkTest } from './NetworkMonitor.js';
export { databaseMonitor, DatabaseMonitor, DatabaseMetrics, QueryTrace, ConnectionPool } from './DatabaseMonitor.js';
export { apiMonitor, APIMonitor, APIMetrics, APIRequest } from './APIMonitor.js';
export { agentCoordinationMonitor, AgentCoordinationMonitor, AgentMetrics, AgentInfo, CoordinationEvent, TaskTrace } from './AgentCoordinationMonitor.js';
export { alertingSystem, AlertingSystem, Alert, AlertRule, AlertCondition, NotificationChannel, AlertStatistics } from './AlertingSystem.js';

// Configuration exports
export { DEFAULT_MONITORING_CONFIG, MonitoringConfig, PerformanceThresholds, AlertConfig, MONITORING_CATEGORIES, METRIC_TYPES } from '../../config/monitoring';

// Utility functions for easy integration
export const initializeMonitoring = (config?: Partial<typeof DEFAULT_MONITORING_CONFIG>) => {
  if (config) {
    metricsCollector.configure(config);
    performanceAnalyzer.configure(config);
    resourceMonitor.configure(config);
    networkMonitor.configure(config);
    apiMonitor.configure(config);
    agentCoordinationMonitor.configure(config);
    alertingSystem.configure(config);
  }
};

export const shutdownMonitoring = async () => {
  await Promise.all([
    metricsCollector.shutdown(),
    resourceMonitor.shutdown(),
    networkMonitor.shutdown(),
    databaseMonitor.shutdown(),
    apiMonitor.shutdown(),
    agentCoordinationMonitor.shutdown(),
    alertingSystem.shutdown()
  ]);
};

// Convenience exports for common use cases
export const createMiddleware = () => apiMonitor.middleware();
export const trackQuery = (query: string, parameters: any, duration: number, database: 'postgres' | 'redis' | 'neo4j', status: 'success' | 'error', errorMessage?: string) => {
  databaseMonitor.traceQuery(query, parameters, duration, database, status, errorMessage);
};

export const trackAgentTask = (agentId: string, agentType: string, taskId: string, coordinationOverhead?: number) => {
  agentCoordinationMonitor.trackTaskAssignment(taskId, agentId, agentType, coordinationOverhead);
};

export const completeAgentTask = (traceId: string, result?: any, error?: string) => {
  agentCoordinationMonitor.trackTaskCompletion(traceId, result, error);
};