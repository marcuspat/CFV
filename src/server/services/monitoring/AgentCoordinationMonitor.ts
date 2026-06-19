/**
 * Agent Coordination Performance Monitor
 * Monitors agent communication, coordination overhead, and swarm performance
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { metricsCollector } from './MetricsCollector.js';
import { executionTimer } from './ExecutionTimer.js';
import { DEFAULT_MONITORING_CONFIG } from '../../../config/monitoring.js';
import { logger } from '../../utils/logger';

export interface AgentMetrics {
  agents: AgentInfo[];
  coordination: CoordinationMetrics;
  communication: CommunicationMetrics;
  topology: TopologyMetrics;
  performance: PerformanceMetrics;
  timestamp: number;
}

export interface AgentInfo {
  id: string;
  type: string;
  status: 'active' | 'idle' | 'busy' | 'error' | 'offline';
  startTime: number;
  lastActivity: number;
  tasksCompleted: number;
  tasksFailed: number;
  averageTaskTime: number;
  memoryUsage: number;
  cpuUsage: number;
  messagesSent: number;
  messagesReceived: number;
  errorRate: number;
  uptime: number;
}

export interface CoordinationMetrics {
  overhead: {
    average: number; // ms
    total: number; // ms
    min: number; // ms
    max: number; // ms
  };
  efficiency: {
    taskDistribution: number; // percentage
    resourceUtilization: number; // percentage
    coordinationScore: number; // 0-100
  };
  bottlenecks: Array<{
    type: 'communication' | 'task_distribution' | 'resource_contention' | 'synchronization';
    agent?: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    impact: number; // percentage impact on performance
  }>;
  synchronization: {
    waitTime: number; // ms
    conflicts: number;
    deadlocks: number;
    resolutionTime: number; // ms
  };
}

export interface CommunicationMetrics {
  messages: {
    total: number;
    perSecond: number;
    averageSize: number;
    averageLatency: number; // ms
  };
  protocols: Record<string, {
    messages: number;
    averageLatency: number;
    errorRate: number;
  }>;
  patterns: {
    broadcast: number;
    unicast: number;
    multicast: number;
    requestResponse: number;
    pubSub: number;
  };
  quality: {
    deliveryRate: number; // percentage
    errorRate: number; // percentage
    duplicateRate: number; // percentage
    orderIssues: number;
  };
}

export interface TopologyMetrics {
  type: 'hierarchical' | 'mesh' | 'ring' | 'star' | 'adaptive';
  size: number;
  depth: number;
  connectivity: number; // average connections per node
  resilience: {
    singlePointFailure: boolean;
    connectivityLoss: number; // percentage if 1 node fails
    recoveryTime: number; // ms
  };
  efficiency: {
    messageHops: number; // average
    bandwidthUtilization: number; // percentage
    loadBalance: number; // 0-100 score
  };
}

export interface PerformanceMetrics {
  throughput: {
    tasksPerSecond: number;
    messagesPerSecond: number;
    operationsPerSecond: number;
  };
  latency: {
    taskCompletion: number; // ms
    messageDelivery: number; // ms
    coordination: number; // ms
  };
  scalability: {
    currentCapacity: number; // agents
    maxCapacity: number; // agents
    efficiency: number; // percentage at current size
  };
  reliability: {
    uptime: number; // percentage
    errorRate: number; // percentage
    recoveryTime: number; // ms
    dataLoss: number; // percentage
  };
}

export interface CoordinationEvent {
  id: string;
  type: 'task_assignment' | 'message_send' | 'message_receive' | 'synchronization' | 'error' | 'recovery';
  agentId: string;
  agentType: string;
  timestamp: number;
  duration?: number;
  data?: any;
  error?: string;
  tags?: Record<string, string>;
}

export interface TaskTrace {
  id: string;
  taskId: string;
  agentId: string;
  agentType: string;
  status: 'assigned' | 'started' | 'completed' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  duration?: number;
  coordinationOverhead?: number;
  dependencies?: string[];
  result?: any;
  error?: string;
  subtasks?: string[];
}

export class AgentCoordinationMonitor extends EventEmitter {
  private config = DEFAULT_MONITORING_CONFIG;
  private monitoringInterval?: NodeJS.Timeout;
  private agents: Map<string, AgentInfo> = new Map();
  private events: CoordinationEvent[] = [];
  private taskTraces: Map<string, TaskTrace> = new Map();
  private maxEvents = 5000;
  private metricsHistory: AgentMetrics[] = [];
  private maxHistorySize = 500;
  private messageLatencies: number[] = [];
  private coordinationOverheads: number[] = [];

  constructor() {
    super();
    this.setupMonitoring();
  }

  /**
   * Register an agent for monitoring
   */
  registerAgent(agentId: string, agentType: string): void {
    const agent: AgentInfo = {
      id: agentId,
      type: agentType,
      status: 'active',
      startTime: Date.now(),
      lastActivity: Date.now(),
      tasksCompleted: 0,
      tasksFailed: 0,
      averageTaskTime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      messagesSent: 0,
      messagesReceived: 0,
      errorRate: 0,
      uptime: 0
    };

    this.agents.set(agentId, agent);
    this.emit('agentRegistered', agent);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'offline';
      this.emit('agentUnregistered', agent);
      // Keep agent info for historical data
    }
  }

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: string, status: AgentInfo['status'], metadata?: Partial<AgentInfo>): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      agent.lastActivity = Date.now();
      agent.uptime = Date.now() - agent.startTime;

      if (metadata) {
        Object.assign(agent, metadata);
      }

      this.emit('agentStatusUpdated', agent);
    }
  }

  /**
   * Track task assignment
   */
  trackTaskAssignment(taskId: string, agentId: string, agentType: string, coordinationOverhead?: number): void {
    const trace: TaskTrace = {
      id: this.generateTraceId(),
      taskId,
      agentId,
      agentType,
      status: 'assigned',
      startTime: Date.now(),
      coordinationOverhead
    };

    this.taskTraces.set(trace.id, trace);

    this.recordEvent({
      type: 'task_assignment',
      agentId,
      agentType,
      timestamp: Date.now(),
      data: { taskId, coordinationOverhead }
    });

    // Update agent metrics
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastActivity = Date.now();
      agent.status = 'busy';
    }

    if (coordinationOverhead) {
      this.coordinationOverheads.push(coordinationOverhead);
      if (this.coordinationOverheads.length > 1000) {
        this.coordinationOverheads.shift();
      }
    }
  }

  /**
   * Track task completion
   */
  trackTaskCompletion(traceId: string, result?: any, error?: string): void {
    const trace = this.taskTraces.get(traceId);
    if (!trace) return;

    const endTime = Date.now();
    const duration = endTime - trace.startTime;

    trace.endTime = endTime;
    trace.duration = duration;
    trace.status = error ? 'failed' : 'completed';
    trace.result = result;
    trace.error = error;

    // Update agent metrics
    const agent = this.agents.get(trace.agentId);
    if (agent) {
      agent.lastActivity = endTime;
      agent.status = 'idle';

      if (error) {
        agent.tasksFailed++;
      } else {
        agent.tasksCompleted++;
      }

      // Update average task time
      const totalTasks = agent.tasksCompleted + agent.tasksFailed;
      agent.averageTaskTime = ((agent.averageTaskTime * (totalTasks - 1)) + duration) / totalTasks;

      // Update error rate
      agent.errorRate = (agent.tasksFailed / totalTasks) * 100;
    }

    this.recordEvent({
      type: error ? 'error' : 'task_assignment',
      agentId: trace.agentId,
      agentType: trace.agentType,
      timestamp: endTime,
      duration,
      data: { taskId: trace.taskId, result, error }
    });

    this.emit('taskCompleted', trace);
  }

  /**
   * Track message communication
   */
  trackMessage(
    fromAgentId: string,
    toAgentId: string,
    messageType: string,
    messageSize: number = 0,
    latency?: number
  ): void {
    const fromAgent = this.agents.get(fromAgentId);
    const toAgent = this.agents.get(toAgentId);

    if (fromAgent) {
      fromAgent.messagesSent++;
      fromAgent.lastActivity = Date.now();
    }

    if (toAgent) {
      toAgent.messagesReceived++;
      toAgent.lastActivity = Date.now();
    }

    if (latency) {
      this.messageLatencies.push(latency);
      if (this.messageLatencies.length > 1000) {
        this.messageLatencies.shift();
      }
    }

    this.recordEvent({
      type: 'message_send',
      agentId: fromAgentId,
      agentType: fromAgent?.type || 'unknown',
      timestamp: Date.now(),
      data: {
        toAgentId,
        messageType,
        messageSize,
        latency
      }
    });

    // Record metrics
    metricsCollector.setGauge(
      'agent.message.latency',
      latency || 0,
      'ms',
      {
        from_type: fromAgent?.type ?? 'unknown',
        to_type: toAgent?.type ?? 'unknown',
        message_type: messageType
      }
    );

    metricsCollector.incrementCounter(
      'agent.messages',
      1,
      {
        direction: 'sent',
        agent_type: fromAgent?.type ?? 'unknown',
        message_type: messageType
      }
    );
  }

  /**
   * Track coordination overhead
   */
  trackCoordinationOverhead(agentId: string, operation: string, overhead: number): void {
    this.coordinationOverheads.push(overhead);
    if (this.coordinationOverheads.length > 1000) {
      this.coordinationOverheads.shift();
    }

    this.recordEvent({
      type: 'synchronization',
      agentId,
      agentType: this.agents.get(agentId)?.type || 'unknown',
      timestamp: Date.now(),
      duration: overhead,
      data: { operation }
    });

    // Check for high overhead
    if (overhead > this.config.thresholds.agentCoordination.overheadWarning) {
      this.emit('highCoordinationOverhead', { agentId, operation, overhead });
    }

    metricsCollector.setGauge(
      'agent.coordination.overhead',
      overhead,
      'ms',
      {
        agent_type: this.agents.get(agentId)?.type ?? 'unknown',
        operation
      }
    );
  }

  /**
   * Track synchronization event
   */
  trackSynchronization(agentIds: string[], duration: number, conflicts: number = 0): void {
    for (const agentId of agentIds) {
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.lastActivity = Date.now();
      }
    }

    this.recordEvent({
      type: 'synchronization',
      agentId: agentIds[0], // Primary agent
      agentType: this.agents.get(agentIds[0])?.type || 'unknown',
      timestamp: Date.now(),
      duration,
      data: { agentIds, conflicts }
    });

    metricsCollector.setGauge(
      'agent.synchronization.duration',
      duration,
      'ms',
      {
        agents_count: agentIds.length.toString(),
        conflicts: conflicts.toString()
      }
    );
  }

  /**
   * Get current agent metrics
   */
  getCurrentMetrics(): AgentMetrics {
    const agents = Array.from(this.agents.values());
    const coordination = this.getCoordinationMetrics();
    const communication = this.getCommunicationMetrics();
    const topology = this.getTopologyMetrics();
    const performance = this.getPerformanceMetrics(agents);

    return {
      agents,
      coordination,
      communication,
      topology,
      performance,
      timestamp: Date.now()
    };
  }

  /**
   * Get task traces
   */
  getTaskTraces(limit?: number, filters?: {
    agentId?: string;
    agentType?: string;
    status?: TaskTrace['status'];
    minDuration?: number;
    maxDuration?: number;
    startTime?: number;
    endTime?: number;
  }): TaskTrace[] {
    let traces = Array.from(this.taskTraces.values());

    if (filters) {
      if (filters.agentId) {
        traces = traces.filter(t => t.agentId === filters.agentId);
      }
      if (filters.agentType) {
        traces = traces.filter(t => t.agentType === filters.agentType);
      }
      if (filters.status) {
        traces = traces.filter(t => t.status === filters.status);
      }
      if (filters.minDuration !== undefined) {
        const minDur = filters.minDuration;
        traces = traces.filter(t => t.duration && t.duration >= minDur);
      }
      if (filters.maxDuration !== undefined) {
        const maxDur = filters.maxDuration;
        traces = traces.filter(t => t.duration && t.duration <= maxDur);
      }
      if (filters.startTime !== undefined) {
        const start = filters.startTime;
        traces = traces.filter(t => t.startTime >= start);
      }
      if (filters.endTime !== undefined) {
        const end = filters.endTime;
        traces = traces.filter(t => t.endTime && t.endTime <= end);
      }
    }

    traces.sort((a, b) => b.startTime - a.startTime);
    return limit ? traces.slice(0, limit) : traces;
  }

  /**
   * Get coordination events
   */
  getEvents(limit?: number, type?: CoordinationEvent['type']): CoordinationEvent[] {
    let events = [...this.events];

    if (type) {
      events = events.filter(e => e.type === type);
    }

    events.sort((a, b) => b.timestamp - a.timestamp);
    return limit ? events.slice(0, limit) : events;
  }

  /**
   * Get performance trends
   */
  getPerformanceTrends(hours: number = 1): {
    throughput: { trend: 'up' | 'down' | 'stable'; change: number };
    latency: { trend: 'up' | 'down' | 'stable'; change: number };
    efficiency: { trend: 'up' | 'down' | 'stable'; change: number };
  } {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const relevantHistory = this.metricsHistory.filter(m => m.timestamp > cutoff);

    if (relevantHistory.length < 2) {
      return {
        throughput: { trend: 'stable', change: 0 },
        latency: { trend: 'stable', change: 0 },
        efficiency: { trend: 'stable', change: 0 }
      };
    }

    const oldest = relevantHistory[0];
    const newest = relevantHistory[relevantHistory.length - 1];

    const calculateTrend = (oldValue: number, newValue: number, inverse: boolean = false): { trend: 'up' | 'down' | 'stable'; change: number } => {
      if (oldValue === 0) return { trend: 'stable', change: 0 };
      const change = ((newValue - oldValue) / oldValue) * 100;
      const trend: 'up' | 'down' | 'stable' = Math.abs(change) > 5 ?
        (inverse ? (change < 0 ? 'up' : 'down') : (change > 0 ? 'up' : 'down'))
        : 'stable';
      return { trend, change };
    };

    return {
      throughput: calculateTrend(
        oldest.performance.throughput.tasksPerSecond,
        newest.performance.throughput.tasksPerSecond
      ),
      latency: calculateTrend(
        newest.performance.latency.coordination,
        oldest.performance.latency.coordination,
        true
      ),
      efficiency: calculateTrend(
        newest.coordination.efficiency.coordinationScore,
        oldest.coordination.efficiency.coordinationScore
      )
    };
  }

  private getCoordinationMetrics(): CoordinationMetrics {
    const overheads = this.coordinationOverheads;
    const averageOverhead = overheads.length > 0 ? overheads.reduce((a, b) => a + b, 0) / overheads.length : 0;

    // Calculate efficiency metrics
    const agents = Array.from(this.agents.values());
    const activeAgents = agents.filter(a => a.status === 'active' || a.status === 'busy');
    const totalTasks = agents.reduce((sum, a) => sum + a.tasksCompleted + a.tasksFailed, 0);
    const totalOverhead = overheads.reduce((sum, o) => sum + o, 0);

    const taskDistribution = activeAgents.length > 0 ? (totalTasks / activeAgents.length) : 0;
    const coordinationScore = Math.max(0, 100 - (averageOverhead / 10)); // 10ms overhead = 0 score

    // Detect bottlenecks
    const bottlenecks = this.detectBottlenecks(agents, overheads);

    return {
      overhead: {
        average: averageOverhead,
        total: totalOverhead,
        min: overheads.length > 0 ? Math.min(...overheads) : 0,
        max: overheads.length > 0 ? Math.max(...overheads) : 0
      },
      efficiency: {
        taskDistribution,
        resourceUtilization: this.calculateResourceUtilization(agents),
        coordinationScore
      },
      bottlenecks,
      synchronization: {
        waitTime: averageOverhead * 0.5, // Estimate
        conflicts: 0, // Would need detailed tracking
        deadlocks: 0,
        resolutionTime: averageOverhead
      }
    };
  }

  private getCommunicationMetrics(): CommunicationMetrics {
    const recentEvents = this.events.filter(e =>
      e.type === 'message_send' && e.timestamp > Date.now() - 60000
    );

    const messagesPerSecond = recentEvents.length / 60;
    const averageSize = recentEvents.reduce((sum, e) => sum + (e.data?.messageSize || 0), 0) / recentEvents.length || 0;
    const averageLatency = this.messageLatencies.length > 0 ?
      this.messageLatencies.reduce((a, b) => a + b, 0) / this.messageLatencies.length : 0;

    // Protocol breakdown
    const protocols: Record<string, any> = {};
    for (const event of recentEvents) {
      const protocol = event.data?.messageType || 'unknown';
      if (!protocols[protocol]) {
        protocols[protocol] = { messages: 0, totalLatency: 0, errors: 0 };
      }
      protocols[protocol].messages++;
      protocols[protocol].totalLatency += event.data?.latency || 0;
    }

    for (const protocol of Object.keys(protocols)) {
      const count = protocols[protocol].messages;
      protocols[protocol].averageLatency = protocols[protocol].totalLatency / count;
      protocols[protocol].errorRate = 0; // Would need error tracking
    }

    // Communication patterns
    const patterns = {
      broadcast: 0,
      unicast: recentEvents.length,
      multicast: 0,
      requestResponse: 0,
      pubSub: 0
    };

    return {
      messages: {
        total: recentEvents.length,
        perSecond: messagesPerSecond,
        averageSize,
        averageLatency
      },
      protocols,
      patterns,
      quality: {
        deliveryRate: 95, // Estimate
        errorRate: 5, // Estimate
        duplicateRate: 1, // Estimate
        orderIssues: 0 // Estimate
      }
    };
  }

  private getTopologyMetrics(): TopologyMetrics {
    const agents = Array.from(this.agents.values());
    const activeAgents = agents.filter(a => a.status !== 'offline');

    // Simplified topology detection
    const type: 'mesh' | 'ring' | 'star' = activeAgents.length > 10 ? 'mesh' : activeAgents.length > 3 ? 'star' : 'ring';

    return {
      type,
      size: activeAgents.length,
      depth: 1,
      connectivity: type === 'mesh' ? activeAgents.length - 1 : type === 'star' ? 1 : 2,
      resilience: {
        singlePointFailure: type === 'star',
        connectivityLoss: type === 'star' ? 50 : type === 'mesh' ? 5 : 20,
        recoveryTime: 1000 // ms
      },
      efficiency: {
        messageHops: type === 'mesh' ? 1.5 : type === 'star' ? 2 : type === 'ring' ? 2.5 : 3,
        bandwidthUtilization: 65, // percentage
        loadBalance: this.calculateLoadBalance(activeAgents)
      }
    };
  }

  private getPerformanceMetrics(agents: AgentInfo[]): PerformanceMetrics {
    const activeAgents = agents.filter(a => a.status === 'active' || a.status === 'busy');
    const completedTasks = agents.reduce((sum, a) => sum + a.tasksCompleted, 0);
    const averageTaskTime = agents.reduce((sum, a) => sum + a.averageTaskTime, 0) / agents.length || 0;
    const averageCoordinationOverhead = this.coordinationOverheads.length > 0 ?
      this.coordinationOverheads.reduce((a, b) => a + b, 0) / this.coordinationOverheads.length : 0;

    // Calculate rates (simplified - would need time-based calculations)
    const tasksPerSecond = completedTasks / 3600; // Assuming 1 hour window
    const messagesPerSecond = agents.reduce((sum, a) => sum + a.messagesSent + a.messagesReceived, 0) / 3600;

    return {
      throughput: {
        tasksPerSecond,
        messagesPerSecond,
        operationsPerSecond: tasksPerSecond + messagesPerSecond
      },
      latency: {
        taskCompletion: averageTaskTime,
        messageDelivery: this.messageLatencies.length > 0 ?
          this.messageLatencies.reduce((a, b) => a + b, 0) / this.messageLatencies.length : 0,
        coordination: averageCoordinationOverhead
      },
      scalability: {
        currentCapacity: activeAgents.length,
        maxCapacity: 100, // Estimate
        efficiency: this.calculateScalabilityEfficiency(activeAgents)
      },
      reliability: {
        uptime: this.calculateUptime(agents),
        errorRate: this.calculateErrorRate(agents),
        recoveryTime: 5000, // ms estimate
        dataLoss: 0.1 // percentage estimate
      }
    };
  }

  private detectBottlenecks(agents: AgentInfo[], overheads: number[]): CoordinationMetrics['bottlenecks'] {
    const bottlenecks: CoordinationMetrics['bottlenecks'] = [];

    // High coordination overhead
    const avgOverhead = overheads.length > 0 ? overheads.reduce((a, b) => a + b, 0) / overheads.length : 0;
    if (avgOverhead > this.config.thresholds.agentCoordination.overheadCritical) {
      bottlenecks.push({
        type: 'synchronization',
        severity: 'critical',
        description: `High coordination overhead: ${avgOverhead.toFixed(2)}ms`,
        impact: Math.min(50, (avgOverhead / this.config.thresholds.agentCoordination.overheadWarning) * 25)
      });
    }

    // Unbalanced agent load
    const activeAgents = agents.filter(a => a.status === 'active' || a.status === 'busy');
    const taskCounts = activeAgents.map(a => a.tasksCompleted + a.tasksFailed);
    const avgTasks = taskCounts.length > 0 ? taskCounts.reduce((a, b) => a + b, 0) / taskCounts.length : 0;
    const maxTasks = Math.max(...taskCounts, 0);

    if (avgTasks > 0 && maxTasks > avgTasks * 3) {
      bottlenecks.push({
        type: 'task_distribution',
        severity: 'medium',
        description: 'Unbalanced task distribution across agents',
        impact: Math.min(30, ((maxTasks / avgTasks) - 1) * 10)
      });
    }

    // Low throughput agents
    const lowPerformingAgents = agents.filter(a =>
      a.status !== 'offline' && a.averageTaskTime > avgOverhead * 10
    );

    if (lowPerformingAgents.length > 0) {
      bottlenecks.push({
        type: 'resource_contention',
        severity: 'medium',
        description: `${lowPerformingAgents.length} agents showing low performance`,
        impact: lowPerformingAgents.length * 5
      });
    }

    return bottlenecks;
  }

  private calculateResourceUtilization(agents: AgentInfo[]): number {
    if (agents.length === 0) return 0;

    const totalUtilization = agents.reduce((sum, a) => sum + a.cpuUsage + a.memoryUsage, 0);
    const maxUtilization = agents.length * 200; // 100% CPU + 100% Memory per agent

    return Math.min(100, (totalUtilization / maxUtilization) * 100);
  }

  private calculateLoadBalance(agents: AgentInfo[]): number {
    if (agents.length === 0) return 100;

    const taskCounts = agents.map(a => a.tasksCompleted + a.tasksFailed);
    const avgTasks = taskCounts.reduce((a, b) => a + b, 0) / taskCounts.length;
    const variance = taskCounts.reduce((sum, count) => sum + Math.pow(count - avgTasks, 2), 0) / taskCounts.length;
    const stdDev = Math.sqrt(variance);

    // Perfect balance = 100, high variance = 0
    return Math.max(0, 100 - (stdDev / Math.max(avgTasks, 1)) * 100);
  }

  private calculateScalabilityEfficiency(agents: AgentInfo[]): number {
    if (agents.length === 0) return 0;

    const activeAgents = agents.filter(a => a.status === 'active' || a.status === 'busy');
    const totalTasks = agents.reduce((sum, a) => sum + a.tasksCompleted + a.tasksFailed, 0);
    const avgTasksPerAgent = totalTasks / agents.length;

    // Efficiency based on how well agents are utilized
    const utilizedAgents = activeAgents.filter(a => a.tasksCompleted + a.tasksFailed > avgTasksPerAgent * 0.5);
    return (utilizedAgents.length / Math.max(agents.length, 1)) * 100;
  }

  private calculateUptime(agents: AgentInfo[]): number {
    if (agents.length === 0) return 100;

    const now = Date.now();
    const totalUptime = agents.reduce((sum, a) => {
      const uptime = a.status === 'offline' ? a.uptime : now - a.startTime;
      return sum + uptime;
    }, 0);

    const maxPossibleUptime = agents.length * (now - Math.min(...agents.map(a => a.startTime)));
    return maxPossibleUptime > 0 ? (totalUptime / maxPossibleUptime) * 100 : 100;
  }

  private calculateErrorRate(agents: AgentInfo[]): number {
    if (agents.length === 0) return 0;

    const totalTasks = agents.reduce((sum, a) => sum + a.tasksCompleted + a.tasksFailed, 0);
    const totalErrors = agents.reduce((sum, a) => sum + a.tasksFailed, 0);

    return totalTasks > 0 ? (totalErrors / totalTasks) * 100 : 0;
  }

  private recordEvent(event: Omit<CoordinationEvent, 'id'>): void {
    const fullEvent: CoordinationEvent = {
      id: this.generateEventId(),
      ...event
    };

    this.events.push(fullEvent);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    this.emit('event', fullEvent);
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupMonitoring(): void {
    if (!this.config.enabled) return;

    this.monitoringInterval = setInterval(() => {
      try {
        const metrics = this.getCurrentMetrics();

        // Record metrics in collector
        this.recordMetrics(metrics);

        // Add to history
        this.metricsHistory.push(metrics);
        if (this.metricsHistory.length > this.maxHistorySize) {
          this.metricsHistory.shift();
        }

        this.emit('metrics', metrics);
      } catch (error) {
        logger.error('Error collecting agent coordination metrics:', { err: error });
      }
    }, this.config.interval * 2); // Less frequent collection
  }

  private recordMetrics(metrics: AgentMetrics): void {
    // Agent metrics
    metricsCollector.setGauge('agent.agents.total', metrics.agents.length, 'count');
    metricsCollector.setGauge('agent.agents.active', metrics.agents.filter(a => a.status === 'active' || a.status === 'busy').length, 'count');
    metricsCollector.setGauge('agent.agents.error_rate', this.calculateErrorRate(metrics.agents), 'percent');

    // Coordination metrics
    metricsCollector.setGauge('agent.coordination.overhead', metrics.coordination.overhead.average, 'ms');
    metricsCollector.setGauge('agent.coordination.efficiency', metrics.coordination.efficiency.coordinationScore, 'score');

    // Communication metrics
    metricsCollector.setGauge('agent.communication.messages_per_second', metrics.communication.messages.perSecond, 'msg/s');
    metricsCollector.setGauge('agent.communication.latency', metrics.communication.messages.averageLatency, 'ms');

    // Performance metrics
    metricsCollector.setGauge('agent.performance.throughput', metrics.performance.throughput.tasksPerSecond, 'tasks/s');
    metricsCollector.setGauge('agent.performance.uptime', metrics.performance.reliability.uptime, 'percent');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    // Mark all agents as offline
    for (const agent of this.agents.values()) {
      if (agent.status !== 'offline') {
        agent.status = 'offline';
      }
    }

    this.removeAllListeners();
  }
}

// Singleton instance
export const agentCoordinationMonitor = new AgentCoordinationMonitor();