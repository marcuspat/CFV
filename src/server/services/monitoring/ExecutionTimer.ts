/**
 * Execution Timer Service
 * Provides comprehensive execution time measurement for commands, functions, and operations
 */

import { performance, PerformanceObserver } from 'perf_hooks';
import { metricsCollector } from './MetricsCollector.js';
import { DEFAULT_MONITORING_CONFIG } from '../../../config/monitoring.js';

export interface ExecutionTiming {
  id: string;
  name: string;
  category: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
  tags?: Record<string, string>;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  error?: Error;
}

export interface CommandTiming extends ExecutionTiming {
  command: string;
  args: string[];
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

export interface FunctionTiming extends ExecutionTiming {
  functionName: string;
  className?: string;
  moduleName?: string;
  args?: any[];
  result?: any;
}

export interface DatabaseTiming extends ExecutionTiming {
  query: string;
  queryType: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'DROP' | 'OTHER';
  database: string;
  table?: string;
  rowCount?: number;
  indexUsed?: string;
}

export interface APITiming extends ExecutionTiming {
  method: string;
  url: string;
  statusCode?: number;
  requestSize?: number;
  responseSize?: number;
  userAgent?: string;
  clientIP?: string;
}

export interface AgentTiming extends ExecutionTiming {
  agentId: string;
  agentType: string;
  task: string;
  coordinationOverhead?: number;
  messagesExchanged?: number;
  topology?: string;
}

export class ExecutionTimer {
  private static instance: ExecutionTimer;
  private timings: Map<string, ExecutionTiming> = new Map();
  private performanceObserver?: PerformanceObserver;
  private config = DEFAULT_MONITORING_CONFIG;

  private constructor() {
    this.setupPerformanceObserver();
  }

  static getInstance(): ExecutionTimer {
    if (!ExecutionTimer.instance) {
      ExecutionTimer.instance = new ExecutionTimer();
    }
    return ExecutionTimer.instance;
  }

  /**
   * Start timing a general execution
   */
  startExecution(name: string, metadata?: Record<string, any>, tags?: Record<string, string>): string {
    const id = this.generateTimingId();
    const timing: ExecutionTiming = {
      id,
      name,
      category: this.inferCategory(name),
      startTime: performance.now(),
      metadata,
      tags,
      status: 'running'
    };

    this.timings.set(id, timing);

    // Also start a performance mark
    performance.mark(`execution-start-${id}`);

    return id;
  }

  /**
   * End timing an execution
   */
  endExecution(id: string, error?: Error): number | null {
    const timing = this.timings.get(id);
    if (!timing) return null;

    const endTime = performance.now();
    const duration = endTime - timing.startTime;

    timing.endTime = endTime;
    timing.duration = duration;
    timing.status = error ? 'failed' : 'completed';
    if (error) {
      timing.error = error;
    }

    // Create performance mark and measure
    performance.mark(`execution-end-${id}`);
    performance.measure(
      `execution-duration-${id}`,
      `execution-start-${id}`,
      `execution-end-${id}`
    );

    // Record metric
    const tags = {
      ...timing.tags,
      status: timing.status,
      ...(error && { error: error.name })
    };

    metricsCollector.setGauge(
      `execution_time.${timing.name}`,
      duration,
      'ms',
      tags
    );

    // Clean up performance marks
    performance.clearMarks(`execution-start-${id}`);
    performance.clearMarks(`execution-end-${id}`);
    performance.clearMeasures(`execution-duration-${id}`);

    return duration;
  }

  /**
   * Time a command execution
   */
  async timeCommand<T>(
    command: string,
    args: string[] = [],
    executeFn: () => Promise<T>
  ): Promise<{ result: T; timing: CommandTiming }> {
    const id = this.startExecution(`command:${command}`, { command, args });

    const timing = this.timings.get(id) as CommandTiming;
    timing.command = command;
    timing.args = args;

    try {
      const result = await executeFn();
      this.endExecution(id);

      if (timing) {
        (timing as any).result = result;
        metricsCollector.incrementCounter('commands.executed', 1, {
          command,
          status: 'success'
        });
      }

      return { result, timing: timing as CommandTiming };
    } catch (error) {
      this.endExecution(id, error as Error);

      if (timing) {
        timing.exitCode = 1;
        metricsCollector.incrementCounter('commands.executed', 1, {
          command,
          status: 'failed'
        });
      }

      throw error;
    }
  }

  /**
   * Time a function execution
   */
  async timeFunction<T>(
    fn: () => T | Promise<T>,
    functionName?: string,
    className?: string,
    moduleName?: string,
    args?: any[]
  ): Promise<{ result: T; timing: FunctionTiming }> {
    const name = functionName || fn.name || 'anonymous';
    const fullName = className ? `${className}.${name}` : name;
    const id = this.startExecution(`function:${fullName}`, {
      functionName: name,
      className,
      moduleName,
      args: args?.length
    });

    const timing = this.timings.get(id) as FunctionTiming;
    timing.functionName = name;
    timing.className = className;
    timing.moduleName = moduleName;
    timing.args = args;

    try {
      const result = await fn();
      this.endExecution(id);

      if (timing) {
        timing.result = result;
        metricsCollector.incrementCounter('functions.executed', 1, {
          functionName: name,
          className: className || 'none',
          status: 'success'
        });
      }

      return { result, timing: timing as FunctionTiming };
    } catch (error) {
      this.endExecution(id, error as Error);

      if (timing) {
        metricsCollector.incrementCounter('functions.executed', 1, {
          functionName: name,
          className: className || 'none',
          status: 'failed'
        });
      }

      throw error;
    }
  }

  /**
   * Time a database query
   */
  async timeDatabaseQuery<T>(
    query: string,
    queryType: DatabaseTiming['queryType'],
    executeFn: () => Promise<T>,
    database: string = 'default',
    table?: string
  ): Promise<{ result: T; timing: DatabaseTiming }> {
    const id = this.startExecution(`database_query:${queryType}`, {
      query: query.substring(0, 100), // Truncate long queries
      queryType,
      database,
      table
    });

    const timing = this.timings.get(id) as DatabaseTiming;
    timing.query = query;
    timing.queryType = queryType;
    timing.database = database;
    timing.table = table;

    try {
      const result = await executeFn();
      this.endExecution(id);

      if (timing) {
        metricsCollector.incrementCounter('database.queries', 1, {
          queryType,
          database,
          table: table || 'unknown',
          status: 'success'
        });
      }

      return { result, timing: timing as DatabaseTiming };
    } catch (error) {
      this.endExecution(id, error as Error);

      if (timing) {
        metricsCollector.incrementCounter('database.queries', 1, {
          queryType,
          database,
          table: table || 'unknown',
          status: 'failed'
        });
      }

      throw error;
    }
  }

  /**
   * Time an API request/response
   */
  async timeAPIRequest<T>(
    method: string,
    url: string,
    requestFn: () => Promise<T>,
    requestSize?: number,
    userAgent?: string,
    clientIP?: string
  ): Promise<{ result: T; timing: APITiming }> {
    const id = this.startExecution(`api_request:${method}`, {
      method,
      url,
      requestSize,
      userAgent,
      clientIP
    });

    const timing = this.timings.get(id) as APITiming;
    timing.method = method;
    timing.url = url;
    timing.requestSize = requestSize;
    timing.userAgent = userAgent;
    timing.clientIP = clientIP;

    try {
      const result = await requestFn();
      this.endExecution(id);

      if (timing) {
        metricsCollector.incrementCounter('api.requests', 1, {
          method,
          status: 'success'
        });
      }

      return { result, timing: timing as APITiming };
    } catch (error) {
      this.endExecution(id, error as Error);

      if (timing) {
        metricsCollector.incrementCounter('api.requests', 1, {
          method,
          status: 'failed'
        });
      }

      throw error;
    }
  }

  /**
   * Time agent coordination and execution
   */
  async timeAgentExecution<T>(
    agentId: string,
    agentType: string,
    task: string,
    executeFn: () => Promise<T>,
    topology?: string
  ): Promise<{ result: T; timing: AgentTiming }> {
    const id = this.startExecution(`agent_execution:${agentType}`, {
      agentId,
      agentType,
      task,
      topology
    });

    const timing = this.timings.get(id) as AgentTiming;
    timing.agentId = agentId;
    timing.agentType = agentType;
    timing.task = task;
    timing.topology = topology;

    try {
      const result = await executeFn();
      this.endExecution(id);

      if (timing) {
        metricsCollector.incrementCounter('agent.executions', 1, {
          agentType,
          topology: topology || 'unknown',
          status: 'success'
        });
      }

      return { result, timing: timing as AgentTiming };
    } catch (error) {
      this.endExecution(id, error as Error);

      if (timing) {
        metricsCollector.incrementCounter('agent.executions', 1, {
          agentType,
          topology: topology || 'unknown',
          status: 'failed'
        });
      }

      throw error;
    }
  }

  /**
   * Get timing by ID
   */
  getTiming(id: string): ExecutionTiming | undefined {
    return this.timings.get(id);
  }

  /**
   * Get all timings
   */
  getAllTimings(): ExecutionTiming[] {
    return Array.from(this.timings.values());
  }

  /**
   * Get timings by category
   */
  getTimingsByCategory(category: string): ExecutionTiming[] {
    return Array.from(this.timings.values()).filter(t => t.category === category);
  }

  /**
   * Get timings by status
   */
  getTimingsByStatus(status: ExecutionTiming['status']): ExecutionTiming[] {
    return Array.from(this.timings.values()).filter(t => t.status === status);
  }

  /**
   * Get running timings
   */
  getRunningTimings(): ExecutionTiming[] {
    return this.getTimingsByStatus('running');
  }

  /**
   * Get completed timings
   */
  getCompletedTimings(): ExecutionTiming[] {
    return this.getTimingsByStatus('completed');
  }

  /**
   * Get failed timings
   */
  getFailedTimings(): ExecutionTiming[] {
    return this.getTimingsByStatus('failed');
  }

  /**
   * Get timing statistics
   */
  getStatistics(category?: string): {
    total: number;
    running: number;
    completed: number;
    failed: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
  } {
    const timings = category
      ? this.getTimingsByCategory(category)
      : this.getAllTimings();

    const completed = timings.filter(t => t.status === 'completed' && t.duration !== undefined);
    const durations = completed.map(t => t.duration!);

    return {
      total: timings.length,
      running: timings.filter(t => t.status === 'running').length,
      completed: completed.length,
      failed: timings.filter(t => t.status === 'failed').length,
      averageDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      minDuration: durations.length > 0 ? Math.min(...durations) : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0
    };
  }

  /**
   * Clear old timings
   */
  clearOldTimings(maxAge: number = 3600000): void { // 1 hour default
    const now = performance.now();

    for (const [id, timing] of this.timings.entries()) {
      if (now - timing.startTime > maxAge) {
        this.timings.delete(id);
      }
    }
  }

  /**
   * Cancel a running timing
   */
  cancelTiming(id: string): boolean {
    const timing = this.timings.get(id);
    if (timing && timing.status === 'running') {
      timing.status = 'cancelled';
      timing.endTime = performance.now();
      timing.duration = timing.endTime - timing.startTime;
      return true;
    }
    return false;
  }

  /**
   * Export timing data
   */
  exportTimings(): string {
    return JSON.stringify({
      timestamp: Date.now(),
      timings: Array.from(this.timings.values()),
      statistics: this.getStatistics()
    }, null, 2);
  }

  private setupPerformanceObserver(): void {
    // Set up performance observer to automatically capture performance entries
    this.performanceObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();

      for (const entry of entries) {
        if (entry.entryType === 'measure') {
          // Convert performance measures to metrics
          const name = entry.name.replace(/^execution-duration-/, '');
          const duration = entry.duration;

          metricsCollector.setGauge(
            `performance.${name}`,
            duration,
            'ms',
            { source: 'performance_observer' }
          );
        }
      }
    });

    this.performanceObserver.observe({ entryTypes: ['measure'] });
  }

  private inferCategory(name: string): string {
    if (name.includes('command')) return 'command';
    if (name.includes('function')) return 'function';
    if (name.includes('database') || name.includes('query')) return 'database';
    if (name.includes('api') || name.includes('request')) return 'api';
    if (name.includes('agent')) return 'agent';
    if (name.includes('coordination')) return 'coordination';
    return 'general';
  }

  private generateTimingId(): string {
    return `timing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    // Cancel all running timings
    for (const [id, timing] of this.timings.entries()) {
      if (timing.status === 'running') {
        this.cancelTiming(id);
      }
    }

    // Clean up performance observer
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }

    // Clear all timings
    this.timings.clear();
  }
}

// Decorator for timing functions
export function timing(functionName?: string, className?: string, moduleName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const timer = ExecutionTimer.getInstance();

    descriptor.value = async function (...args: any[]) {
      const fnName = functionName || propertyKey;
      const clsName = className || target.constructor.name;

      return await timer.timeFunction(
        () => originalMethod.apply(this, args),
        fnName,
        clsName,
        moduleName,
        args
      ).then(result => result.result);
    };

    return descriptor;
  };
}

// Export singleton instance
export const executionTimer = ExecutionTimer.getInstance();