/**
 * Performance Monitoring Services Index
 * Central export point for all monitoring services
 */

import { metricsCollector, MetricsCollector } from './MetricsCollector.js';
import { performanceAnalyzer, PerformanceAnalyzer } from './PerformanceAnalyzer.js';
import { executionTimer, ExecutionTimer, timing } from './ExecutionTimer.js';
import { resourceMonitor, ResourceMonitor } from './ResourceMonitor.js';
import { networkMonitor, NetworkMonitor } from './NetworkMonitor.js';
import { databaseMonitor, DatabaseMonitor } from './DatabaseMonitor.js';
import { apiMonitor, APIMonitor } from './APIMonitor.js';
import { agentCoordinationMonitor, AgentCoordinationMonitor } from './AgentCoordinationMonitor.js';
import { alertingSystem, AlertingSystem } from './AlertingSystem.js';
import { DEFAULT_MONITORING_CONFIG } from '../../../config/monitoring.js';

export { metricsCollector, MetricsCollector };
export type { Metric, MetricSnapshot, SystemInfo } from './MetricsCollector.js';
export { performanceAnalyzer, PerformanceAnalyzer };
export type { Anomaly, Bottleneck, PerformanceReport } from './PerformanceAnalyzer.js';
export { executionTimer, ExecutionTimer, timing };
export type { ExecutionTiming } from './ExecutionTimer.js';
export { resourceMonitor, ResourceMonitor };
export type { ResourceMetrics, CPUMetrics, MemoryMetrics, DiskMetrics, NetworkMetrics } from './ResourceMonitor.js';
export { networkMonitor, NetworkMonitor };
export type { NetworkPerformanceMetrics, NetworkTest } from './NetworkMonitor.js';
export { databaseMonitor, DatabaseMonitor };
export type { DatabaseMetrics, QueryTrace, ConnectionPool } from './DatabaseMonitor.js';
export { apiMonitor, APIMonitor };
export type { APIMetrics, APIRequest } from './APIMonitor.js';
export { agentCoordinationMonitor, AgentCoordinationMonitor };
export type { AgentMetrics, AgentInfo, CoordinationEvent, TaskTrace } from './AgentCoordinationMonitor.js';
export { alertingSystem, AlertingSystem };
export type { Alert, AlertRule, AlertCondition, NotificationChannel, AlertStatistics } from './AlertingSystem.js';

// Configuration exports
export { DEFAULT_MONITORING_CONFIG };
export type { MonitoringConfig, PerformanceThresholds, AlertConfig, MONITORING_CATEGORIES, METRIC_TYPES } from '../../../config/monitoring.js';

// Utility functions for easy integration
export const initializeMonitoring = (_config?: Partial<typeof DEFAULT_MONITORING_CONFIG>) => {
  // Monitoring services are initialized with their defaults
  // Configuration can be extended as needed
};

export const shutdownMonitoring = async () => {
  // Cleanup monitoring services
  // Services use their internal cleanup mechanisms
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