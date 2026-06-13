/**
 * API Performance Monitor Service
 * Monitors API response times, error rates, and performance metrics
 */

import { EventEmitter } from 'events';
import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';
import { metricsCollector } from './MetricsCollector.js';
import { executionTimer } from './ExecutionTimer.js';
import { DEFAULT_MONITORING_CONFIG } from '../../../config/monitoring.js';

export interface APIMetrics {
  requests: RequestMetrics;
  responses: ResponseMetrics;
  endpoints: EndpointMetrics[];
  errors: ErrorMetrics;
  timestamp: number;
}

export interface RequestMetrics {
  total: number;
  perSecond: number;
  averageSize: number;
  methods: Record<string, number>;
  headers: Record<string, number>;
  userAgents: Record<string, number>;
  clientIPs: Record<string, number>;
}

export interface ResponseMetrics {
  total: number;
  averageTime: number;
  averageSize: number;
  statusCodes: Record<number, number>;
  timeDistribution: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

export interface EndpointMetrics {
  path: string;
  method: string;
  requests: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  statusCodes: Record<number, number>;
  errorRate: number;
  lastAccess: number;
  timeDistribution: {
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

export interface ErrorMetrics {
  total: number;
  rate: number;
  byType: Record<string, number>;
  byEndpoint: Record<string, number>;
  byStatusCode: Record<number, number>;
  recent: Array<{
    timestamp: number;
    endpoint: string;
    method: string;
    statusCode: number;
    error: string;
    userAgent?: string;
    clientIP?: string;
  }>;
}

export interface APIRequest {
  id: string;
  method: string;
  url: string;
  path: string;
  query: any;
  headers: Record<string, string>;
  userAgent?: string;
  clientIP?: string;
  requestSize: number;
  startTime: number;
  endTime?: number;
  duration?: number;
  statusCode?: number;
  responseSize?: number;
  error?: string;
  tags?: Record<string, string>;
}

export class APIMonitor extends EventEmitter {
  private config = DEFAULT_MONITORING_CONFIG;
  private requests: APIRequest[] = [];
  private maxRequests = 10000;
  private endpointMetrics: Map<string, EndpointMetrics> = new Map();
  private metricsHistory: APIMetrics[] = [];
  private maxHistorySize = 500;
  private requestCounters: Map<string, number> = new Map();
  private errorCounters: Map<string, number> = new Map();

  constructor() {
    super();
    this.setupMetricsCollection();
  }

  /**
   * Express middleware for API monitoring
   */
  middleware(): (req: Request, res: Response, next: NextFunction) => void {
    return (req: Request, res: Response, next: NextFunction) => {
      const requestId = this.generateRequestId();
      const startTime = performance.now();

      // Store request metadata for later use
      (req as any).monitoringId = requestId;
      (req as any).monitoringStartTime = startTime;

      // Create request object
      const request: APIRequest = {
        id: requestId,
        method: req.method,
        url: req.originalUrl || req.url,
        path: req.route?.path || req.path,
        query: req.query,
        headers: this.sanitizeHeaders(req.headers),
        userAgent: req.get('User-Agent'),
        clientIP: this.getClientIP(req),
        requestSize: this.getRequestSize(req),
        startTime
      };

      this.requests.push(request);
      if (this.requests.length > this.maxRequests) {
        this.requests.shift();
      }

      // Intercept response to capture metrics
      const originalWrite = res.write;
      const originalEnd = res.end;
      let responseSize = 0;
      const monitor = this;

      res.write = function (this: Response, chunk: any, encoding?: any) {
        if (chunk) {
          responseSize += Buffer.byteLength(chunk, encoding);
        }
        return originalWrite.call(this, chunk, encoding);
      };

      res.end = function (this: Response, chunk?: any, encoding?: any) {
        if (chunk) {
          responseSize += Buffer.byteLength(chunk, encoding);
        }

        const endTime = performance.now();
        const duration = endTime - startTime;

        // Update request with response data
        request.endTime = endTime;
        request.duration = duration;
        request.statusCode = res.statusCode;
        request.responseSize = responseSize;

        // Update metrics
        monitor.updateMetrics(request);

        // Record metrics in collector
        monitor.recordRequestMetrics(request);

        // Check for slow requests
        if (duration > monitor.config.thresholds.responseTime.warning) {
          monitor.emit('slowRequest', request);
        }

        // Check for errors
        if (res.statusCode >= 400) {
          monitor.emit('errorRequest', request);
        }

        return originalEnd.call(this, chunk, encoding);
      };

      next();
    };
  }

  /**
   * Track a custom API call
   */
  trackAPICall(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    requestSize: number = 0,
    responseSize: number = 0,
    error?: string,
    tags?: Record<string, string>
  ): void {
    const request: APIRequest = {
      id: this.generateRequestId(),
      method,
      url,
      path: new URL(url).pathname,
      query: {},
      headers: {},
      requestSize,
      startTime: Date.now() - duration,
      endTime: Date.now(),
      duration,
      statusCode,
      responseSize,
      error,
      tags
    };

    this.requests.push(request);
    if (this.requests.length > this.maxRequests) {
      this.requests.shift();
    }

    this.updateMetrics(request);
    this.recordRequestMetrics(request);
  }

  /**
   * Get current API metrics
   */
  getCurrentMetrics(): APIMetrics {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Recent requests for rate calculations
    const recentRequests = this.requests.filter(r => r.startTime > oneMinuteAgo);

    const requests = this.getRequestMetrics(recentRequests);
    const responses = this.getResponseMetrics(this.requests);
    const endpoints = Array.from(this.endpointMetrics.values());
    const errors = this.getErrorMetrics(this.requests);

    return {
      requests,
      responses,
      endpoints,
      errors,
      timestamp: now
    };
  }

  /**
   * Get request history
   */
  getRequests(limit?: number, filters?: {
    method?: string;
    path?: string;
    statusCode?: number;
    minDuration?: number;
    maxDuration?: number;
    startTime?: number;
    endTime?: number;
  }): APIRequest[] {
    let filtered = [...this.requests];

    if (filters) {
      if (filters.method) {
        filtered = filtered.filter(r => r.method === filters.method);
      }
      if (filters.path) {
        const pathFilter = filters.path;
        filtered = filtered.filter(r => r.path.includes(pathFilter));
      }
      if (filters.statusCode) {
        filtered = filtered.filter(r => r.statusCode === filters.statusCode);
      }
      if (filters.minDuration !== undefined) {
        const minDur = filters.minDuration;
        filtered = filtered.filter(r => r.duration && r.duration >= minDur);
      }
      if (filters.maxDuration !== undefined) {
        const maxDur = filters.maxDuration;
        filtered = filtered.filter(r => r.duration && r.duration <= maxDur);
      }
      if (filters.startTime !== undefined) {
        const start = filters.startTime;
        filtered = filtered.filter(r => r.startTime >= start);
      }
      if (filters.endTime !== undefined) {
        const end = filters.endTime;
        filtered = filtered.filter(r => r.startTime <= end);
      }
    }

    filtered.sort((a, b) => b.startTime - a.startTime);

    return limit ? filtered.slice(0, limit) : filtered;
  }

  /**
   * Get slow requests
   */
  getSlowRequests(threshold?: number, limit?: number): APIRequest[] {
    const msThreshold = threshold || this.config.thresholds.responseTime.warning;
    return this.getRequests(limit, { minDuration: msThreshold });
  }

  /**
   * Get error requests
   */
  getErrorRequests(limit?: number): APIRequest[] {
    return this.getRequests(limit).filter(r => r.statusCode && r.statusCode >= 400);
  }

  /**
   * Get endpoint metrics
   */
  getEndpointMetrics(path?: string): EndpointMetrics[] {
    const endpoints = Array.from(this.endpointMetrics.values());

    if (path) {
      return endpoints.filter(e => e.path.includes(path));
    }

    return endpoints.sort((a, b) => b.requests - a.requests);
  }

  /**
   * Get performance trends
   */
  getPerformanceTrends(hours: number = 1): {
    requestRate: { trend: 'up' | 'down' | 'stable'; change: number };
    responseTime: { trend: 'up' | 'down' | 'stable'; change: number };
    errorRate: { trend: 'up' | 'down' | 'stable'; change: number };
  } {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const relevantHistory = this.metricsHistory.filter(m => m.timestamp > cutoff);

    if (relevantHistory.length < 2) {
      return {
        requestRate: { trend: 'stable', change: 0 },
        responseTime: { trend: 'stable', change: 0 },
        errorRate: { trend: 'stable', change: 0 }
      };
    }

    const oldest = relevantHistory[0];
    const newest = relevantHistory[relevantHistory.length - 1];

    const calculateTrend = (oldValue: number, newValue: number, inverse: boolean = false): { trend: 'up' | 'down' | 'stable'; change: number } => {
      if (oldValue === 0) return { trend: 'stable', change: 0 };
      const change = ((newValue - oldValue) / oldValue) * 100;
      const trend: 'up' | 'down' | 'stable' = Math.abs(change) > 10 ?
        (inverse ? (change < 0 ? 'up' : 'down') : (change > 0 ? 'up' : 'down'))
        : 'stable';
      return { trend, change };
    };

    return {
      requestRate: calculateTrend(oldest.requests.perSecond, newest.requests.perSecond),
      responseTime: calculateTrend(oldest.responses.averageTime, newest.responses.averageTime, true),
      errorRate: calculateTrend(oldest.errors.rate, newest.errors.rate, true)
    };
  }

  /**
   * Get API health score
   */
  getHealthScore(): {
    overall: number; // 0-100
    availability: number;
    performance: number;
    errorRate: number;
    status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  } {
    const metrics = this.getCurrentMetrics();

    // Availability (based on success rate)
    const totalRequests = metrics.requests.total;
    const successRequests = Object.entries(metrics.responses.statusCodes)
      .filter(([code]) => parseInt(code) < 400)
      .reduce((sum, [, count]) => sum + count, 0);
    const availability = totalRequests > 0 ? (successRequests / totalRequests) * 100 : 100;

    // Performance (based on response time)
    const avgResponseTime = metrics.responses.averageTime;
    const warningThreshold = this.config.thresholds.responseTime.warning;
    const criticalThreshold = this.config.thresholds.responseTime.critical;

    let performance = 100;
    if (avgResponseTime > criticalThreshold) {
      performance = Math.max(0, 100 - ((avgResponseTime - criticalThreshold) / criticalThreshold) * 50);
    } else if (avgResponseTime > warningThreshold) {
      performance = 100 - ((avgResponseTime - warningThreshold) / (criticalThreshold - warningThreshold)) * 30;
    }

    // Error rate (inverted for scoring)
    const errorRate = metrics.errors.rate;
    const errorScore = Math.max(0, 100 - errorRate * 10); // 10% penalty per 1% error rate

    // Overall score
    const overall = (availability * 0.4 + performance * 0.4 + errorScore * 0.2);

    let status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    if (overall >= 90) status = 'excellent';
    else if (overall >= 75) status = 'good';
    else if (overall >= 60) status = 'fair';
    else if (overall >= 40) status = 'poor';
    else status = 'critical';

    return {
      overall: Math.round(overall),
      availability: Math.round(availability),
      performance: Math.round(performance),
      errorRate: Math.round(errorScore),
      status
    };
  }

  private getRequestMetrics(recentRequests: APIRequest[]): RequestMetrics {
    const total = recentRequests.length;
    const perSecond = total / 60; // Requests per second (last minute)
    const averageSize = total > 0 ? recentRequests.reduce((sum, r) => sum + r.requestSize, 0) / total : 0;

    const methods: Record<string, number> = {};
    const headers: Record<string, number> = {};
    const userAgents: Record<string, number> = {};
    const clientIPs: Record<string, number> = {};

    for (const request of recentRequests) {
      methods[request.method] = (methods[request.method] || 0) + 1;

      if (request.userAgent) {
        userAgents[request.userAgent] = (userAgents[request.userAgent] || 0) + 1;
      }

      if (request.clientIP) {
        clientIPs[request.clientIP] = (clientIPs[request.clientIP] || 0) + 1;
      }

      // Count headers
      for (const header of Object.keys(request.headers)) {
        headers[header] = (headers[header] || 0) + 1;
      }
    }

    return {
      total,
      perSecond,
      averageSize,
      methods,
      headers,
      userAgents,
      clientIPs
    };
  }

  private getResponseMetrics(requests: APIRequest[]): ResponseMetrics {
    const completedRequests = requests.filter(r => r.statusCode !== undefined);
    const total = completedRequests.length;

    if (total === 0) {
      return {
        total: 0,
        averageTime: 0,
        averageSize: 0,
        statusCodes: {},
        timeDistribution: { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 }
      };
    }

    const durations = completedRequests.map(r => r.duration!).sort((a, b) => a - b);
    const responseSizes = completedRequests.map(r => r.responseSize || 0);

    const statusCodes: Record<number, number> = {};
    for (const request of completedRequests) {
      const code = request.statusCode!;
      statusCodes[code] = (statusCodes[code] || 0) + 1;
    }

    const averageTime = durations.reduce((sum, d) => sum + d, 0) / total;
    const averageSize = responseSizes.reduce((sum, s) => sum + s, 0) / total;

    // Calculate percentiles
    const getPercentile = (sortedArray: number[], percentile: number) => {
      const index = Math.floor(sortedArray.length * (percentile / 100));
      return sortedArray[Math.min(index, sortedArray.length - 1)] || 0;
    };

    const timeDistribution = {
      p50: getPercentile(durations, 50),
      p75: getPercentile(durations, 75),
      p90: getPercentile(durations, 90),
      p95: getPercentile(durations, 95),
      p99: getPercentile(durations, 99)
    };

    return {
      total,
      averageTime,
      averageSize,
      statusCodes,
      timeDistribution
    };
  }

  private getErrorMetrics(requests: APIRequest[]): ErrorMetrics {
    const errorRequests = requests.filter(r => r.statusCode && r.statusCode >= 400);
    const total = errorRequests.length;
    const allRequests = requests.filter(r => r.statusCode !== undefined);
    const rate = allRequests.length > 0 ? (total / allRequests.length) * 100 : 0;

    const byType: Record<string, number> = {};
    const byEndpoint: Record<string, number> = {};
    const byStatusCode: Record<number, number> = {};

    const recent = errorRequests.slice(-50); // Last 50 errors

    for (const request of errorRequests) {
      // Group by status code
      const statusCode = request.statusCode!;
      byStatusCode[statusCode] = (byStatusCode[statusCode] || 0) + 1;

      // Group by endpoint
      const endpoint = `${request.method} ${request.path}`;
      byEndpoint[endpoint] = (byEndpoint[endpoint] || 0) + 1;

      // Group by error type
      const errorType = this.getErrorType(statusCode);
      byType[errorType] = (byType[errorType] || 0) + 1;
    }

    return {
      total,
      rate,
      byType,
      byEndpoint,
      byStatusCode,
      recent: recent.map(r => ({
        timestamp: r.startTime,
        endpoint: `${r.method} ${r.path}`,
        method: r.method,
        statusCode: r.statusCode!,
        error: r.error || this.getStatusText(r.statusCode!),
        userAgent: r.userAgent,
        clientIP: r.clientIP
      }))
    };
  }

  private updateMetrics(request: APIRequest): void {
    const endpointKey = `${request.method} ${request.path}`;
    let endpointMetric = this.endpointMetrics.get(endpointKey);

    if (!endpointMetric) {
      endpointMetric = {
        path: request.path,
        method: request.method,
        requests: 0,
        averageTime: 0,
        minTime: request.duration || 0,
        maxTime: request.duration || 0,
        statusCodes: {},
        errorRate: 0,
        lastAccess: request.startTime,
        timeDistribution: { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 }
      };
      this.endpointMetrics.set(endpointKey, endpointMetric);
    }

    // Update endpoint metrics
    endpointMetric.requests++;
    endpointMetric.lastAccess = request.startTime;

    if (request.duration !== undefined) {
      const totalDuration = endpointMetric.averageTime * (endpointMetric.requests - 1) + request.duration;
      endpointMetric.averageTime = totalDuration / endpointMetric.requests;
      endpointMetric.minTime = Math.min(endpointMetric.minTime, request.duration);
      endpointMetric.maxTime = Math.max(endpointMetric.maxTime, request.duration);
    }

    // Update status codes
    if (request.statusCode !== undefined) {
      endpointMetric.statusCodes[request.statusCode] = (endpointMetric.statusCodes[request.statusCode] || 0) + 1;

      // Calculate error rate
      const errorCount = Object.entries(endpointMetric.statusCodes)
        .filter(([code]) => parseInt(code) >= 400)
        .reduce((sum, [, count]) => sum + count, 0);
      endpointMetric.errorRate = (errorCount / endpointMetric.requests) * 100;
    }
  }

  private recordRequestMetrics(request: APIRequest): void {
    // Record request metrics
    metricsCollector.setGauge(
      `api.request.duration`,
      request.duration || 0,
      'ms',
      {
        method: request.method,
        path: request.path,
        status_code: request.statusCode?.toString() || 'unknown'
      }
    );

    metricsCollector.setGauge(
      `api.request.size`,
      request.requestSize,
      'bytes',
      {
        method: request.method,
        path: request.path
      }
    );

    if (request.responseSize !== undefined) {
      metricsCollector.setGauge(
        `api.response.size`,
        request.responseSize,
        'bytes',
        {
          method: request.method,
          path: request.path,
          status_code: request.statusCode?.toString() || 'unknown'
        }
      );
    }

    // Count requests
    metricsCollector.incrementCounter(
      'api.requests',
      1,
      {
        method: request.method,
        path: request.path,
        status_code: request.statusCode?.toString() || 'unknown'
      }
    );

    // Count errors
    if (request.statusCode && request.statusCode >= 400) {
      metricsCollector.incrementCounter(
        'api.errors',
        1,
        {
          method: request.method,
          path: request.path,
          status_code: request.statusCode.toString()
        }
      );
    }

    // Count slow requests
    if (request.duration && request.duration > this.config.thresholds.responseTime.warning) {
      metricsCollector.incrementCounter(
        'api.slow_requests',
        1,
        {
          method: request.method,
          path: request.path
        }
      );
    }
  }

  private sanitizeHeaders(headers: any): Record<string, string> {
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      // Skip sensitive headers
      if (key.toLowerCase().includes('authorization') ||
          key.toLowerCase().includes('cookie') ||
          key.toLowerCase().includes('token')) {
        continue;
      }

      sanitized[key] = String(value);
    }

    return sanitized;
  }

  private getClientIP(req: Request): string {
    return (
      req.get('X-Forwarded-For') ||
      req.get('X-Real-IP') ||
      req.get('X-Client-IP') ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip ||
      'unknown'
    );
  }

  private getRequestSize(req: Request): number {
    try {
      return parseInt(req.get('Content-Length') || '0', 10);
    } catch {
      return 0;
    }
  }

  private getErrorType(statusCode: number): string {
    if (statusCode >= 500) return 'server_error';
    if (statusCode >= 400) {
      switch (statusCode) {
        case 400: return 'bad_request';
        case 401: return 'unauthorized';
        case 403: return 'forbidden';
        case 404: return 'not_found';
        case 429: return 'rate_limited';
        default: return 'client_error';
      }
    }
    return 'unknown';
  }

  private getStatusText(statusCode: number): string {
    const statusTexts: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      408: 'Request Timeout',
      409: 'Conflict',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout'
    };
    return statusTexts[statusCode] || `HTTP ${statusCode}`;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupMetricsCollection(): void {
    // Collect comprehensive metrics every 30 seconds
    setInterval(() => {
      try {
        const metrics = this.getCurrentMetrics();
        this.metricsHistory.push(metrics);
        if (this.metricsHistory.length > this.maxHistorySize) {
          this.metricsHistory.shift();
        }

        // Record summary metrics
        this.recordSummaryMetrics(metrics);

        this.emit('metrics', metrics);
      } catch (error) {
        console.error('Error collecting API metrics:', error);
      }
    }, 30000);
  }

  private recordSummaryMetrics(metrics: APIMetrics): void {
    // Record overall API metrics
    metricsCollector.setGauge('api.requests_per_second', metrics.requests.perSecond, 'req/s');
    metricsCollector.setGauge('api.average_response_time', metrics.responses.averageTime, 'ms');
    metricsCollector.setGauge('api.error_rate', metrics.errors.rate, 'percent');

    // Record health score
    const healthScore = this.getHealthScore();
    metricsCollector.setGauge('api.health_score', healthScore.overall, 'score');
    metricsCollector.setGauge('api.availability', healthScore.availability, 'percent');
    metricsCollector.setGauge('api.performance_score', healthScore.performance, 'score');
  }
}

// Singleton instance
export const apiMonitor = new APIMonitor();