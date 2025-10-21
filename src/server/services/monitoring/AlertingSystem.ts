/**
 * Automated Alerting System for Performance Anomalies
 * Provides intelligent alerting with cooldowns, escalation, and multi-channel notifications
 */

import { EventEmitter } from 'events';
import { performanceAnalyzer, Anomaly, Bottleneck } from './PerformanceAnalyzer.js';
import { resourceMonitor } from './ResourceMonitor.js';
import { networkMonitor } from './NetworkMonitor.js';
import { databaseMonitor } from './DatabaseMonitor.js';
import { apiMonitor } from './APIMonitor.js';
import { agentCoordinationMonitor } from './AgentCoordinationMonitor.js';
import { metricsCollector } from './MetricsCollector.js';
import { DEFAULT_MONITORING_CONFIG, AlertConfig, AlertChannel } from '../../../config/monitoring.js';

export interface Alert {
  id: string;
  type: 'anomaly' | 'bottleneck' | 'threshold' | 'trend' | 'system';
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  title: string;
  description: string;
  timestamp: number;
  source: string;
  metrics: Record<string, any>;
  context: Record<string, any>;
  status: 'active' | 'acknowledged' | 'resolved' | 'suppressed';
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  resolvedAt?: number;
  escalated: boolean;
  escalationLevel: number;
  tags: Record<string, string>;
  actions?: AlertAction[];
}

export interface AlertAction {
  type: 'script' | 'webhook' | 'email' | 'slack' | 'restart' | 'scale';
  description: string;
  config: Record<string, any>;
  executed: boolean;
  executedAt?: number;
  result?: any;
  error?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: AlertCondition[];
  severity: Alert['severity'];
  cooldown: number; // minutes
  channels: string[];
  actions?: AlertAction[];
  tags: Record<string, string>;
  schedule?: {
    enabled: boolean;
    timezone: string;
    activeHours: { start: string; end: string }[];
    activeDays: number[]; // 0-6 (Sunday-Saturday)
  };
}

export interface AlertCondition {
  metric: string;
  operator: '>' | '<' | '=' | '>=' | '<=' | '!=' | 'contains' | 'not_contains';
  value: any;
  aggregation?: 'avg' | 'min' | 'max' | 'sum' | 'count';
  window?: number; // minutes
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: AlertChannel['type'];
  enabled: boolean;
  config: Record<string, any>;
  rateLimit?: {
    maxPerMinute: number;
    maxPerHour: number;
  };
  templates?: {
    title: string;
    body: string;
  };
}

export interface AlertStatistics {
  total: number;
  active: number;
  resolved: number;
  suppressed: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  averageResolutionTime: number;
  escalationRate: number;
}

export class AlertingSystem extends EventEmitter {
  private config = DEFAULT_MONITORING_CONFIG;
  private alerts: Map<string, Alert> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private channels: Map<string, NotificationChannel> = new Map();
  private cooldowns: Map<string, number> = new Map();
  private rateLimiters: Map<string, number[]> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private statistics: AlertStatistics = {
    total: 0,
    active: 0,
    resolved: 0,
    suppressed: 0,
    bySeverity: {},
    byCategory: {},
    bySource: {},
    averageResolutionTime: 0,
    escalationRate: 0
  };

  constructor() {
    super();
    this.setupDefaultChannels();
    this.setupDefaultRules();
    this.setupMonitoring();
  }

  /**
   * Configure alerting system
   */
  configure(config: Partial<typeof DEFAULT_MONITORING_CONFIG>): void {
    this.config = { ...this.config, ...config };
    if (this.config.enabled) {
      this.setupMonitoring();
    } else {
      this.stopMonitoring();
    }
  }

  /**
   * Add an alert rule
   */
  addRule(rule: Omit<AlertRule, 'id'>): string {
    const id = this.generateRuleId();
    const fullRule: AlertRule = { ...rule, id };
    this.rules.set(id, fullRule);
    this.emit('ruleAdded', fullRule);
    return id;
  }

  /**
   * Update an alert rule
   */
  updateRule(id: string, updates: Partial<AlertRule>): boolean {
    const rule = this.rules.get(id);
    if (!rule) return false;

    const updatedRule = { ...rule, ...updates };
    this.rules.set(id, updatedRule);
    this.emit('ruleUpdated', updatedRule);
    return true;
  }

  /**
   * Remove an alert rule
   */
  removeRule(id: string): boolean {
    const rule = this.rules.get(id);
    if (!rule) return false;

    this.rules.delete(id);
    this.emit('ruleRemoved', rule);
    return true;
  }

  /**
   * Add a notification channel
   */
  addChannel(channel: Omit<NotificationChannel, 'id'>): string {
    const id = this.generateChannelId();
    const fullChannel: NotificationChannel = { ...channel, id };
    this.channels.set(id, fullChannel);
    this.emit('channelAdded', fullChannel);
    return id;
  }

  /**
   * Update a notification channel
   */
  updateChannel(id: string, updates: Partial<NotificationChannel>): boolean {
    const channel = this.channels.get(id);
    if (!channel) return false;

    const updatedChannel = { ...channel, ...updates };
    this.channels.set(id, updatedChannel);
    this.emit('channelUpdated', updatedChannel);
    return true;
  }

  /**
   * Remove a notification channel
   */
  removeChannel(id: string): boolean {
    const channel = this.channels.get(id);
    if (!channel) return false;

    this.channels.delete(id);
    this.emit('channelRemoved', channel);
    return true;
  }

  /**
   * Create a manual alert
   */
  createAlert(alert: Omit<Alert, 'id' | 'timestamp' | 'status' | 'escalated' | 'escalationLevel'>): string {
    const id = this.generateAlertId();
    const fullAlert: Alert = {
      ...alert,
      id,
      timestamp: Date.now(),
      status: 'active',
      escalated: false,
      escalationLevel: 0
    };

    this.alerts.set(id, fullAlert);
    this.updateStatistics();
    this.processAlert(fullAlert);
    this.emit('alertCreated', fullAlert);

    return id;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(id: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.get(id);
    if (!alert || alert.status !== 'active') return false;

    alert.status = 'acknowledged';
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = Date.now();

    this.emit('alertAcknowledged', alert);
    return true;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(id: string, resolvedBy?: string): boolean {
    const alert = this.alerts.get(id);
    if (!alert || alert.status === 'resolved') return false;

    alert.status = 'resolved';
    alert.resolvedAt = Date.now();

    // Update statistics
    if (alert.timestamp) {
      const resolutionTime = alert.resolvedAt - alert.timestamp;
      this.statistics.averageResolutionTime =
        (this.statistics.averageResolutionTime + resolutionTime) / 2;
    }

    this.emit('alertResolved', alert);
    return true;
  }

  /**
   * Suppress an alert
   */
  suppressAlert(id: string, duration: number = 60): boolean {
    const alert = this.alerts.get(id);
    if (!alert || alert.status === 'resolved') return false;

    alert.status = 'suppressed';

    // Auto-unsuppress after duration
    setTimeout(() => {
      if (this.alerts.get(id)?.status === 'suppressed') {
        alert.status = 'active';
        this.emit('alertUnsuppressed', alert);
      }
    }, duration * 60 * 1000);

    this.emit('alertSuppressed', alert);
    return true;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(filters?: {
    severity?: Alert['severity'];
    category?: string;
    source?: string;
    tags?: Record<string, string>;
  }): Alert[] {
    let alerts = Array.from(this.alerts.values()).filter(a => a.status === 'active');

    if (filters) {
      if (filters.severity) {
        alerts = alerts.filter(a => a.severity === filters.severity);
      }
      if (filters.category) {
        alerts = alerts.filter(a => a.category === filters.category);
      }
      if (filters.source) {
        alerts = alerts.filter(a => a.source === filters.source);
      }
      if (filters.tags) {
        alerts = alerts.filter(a => {
          for (const [key, value] of Object.entries(filters.tags!)) {
            if (a.tags[key] !== value) return false;
          }
          return true;
        });
      }
    }

    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(limit?: number): Alert[] {
    const alerts = Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp - a.timestamp);
    return limit ? alerts.slice(0, limit) : alerts;
  }

  /**
   * Get alert statistics
   */
  getStatistics(): AlertStatistics {
    this.updateStatistics();
    return { ...this.statistics };
  }

  /**
   * Get alert rules
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get notification channels
   */
  getChannels(): NotificationChannel[] {
    return Array.from(this.channels.values());
  }

  private setupDefaultChannels(): void {
    // Console channel (always available)
    this.channels.set('console', {
      id: 'console',
      name: 'Console',
      type: 'console',
      enabled: true,
      config: {}
    });

    // Add other channels from config
    if (this.config.alerts.channels) {
      for (const channelConfig of this.config.alerts.channels) {
        if (channelConfig.enabled) {
          this.channels.set(channelConfig.type, {
            id: channelConfig.type,
            name: channelConfig.type,
            ...channelConfig
          });
        }
      }
    }
  }

  private setupDefaultRules(): void {
    // CPU usage alert
    this.addRule({
      name: 'High CPU Usage',
      enabled: true,
      conditions: [
        { metric: 'resource.cpu.usage', operator: '>', value: 80 }
      ],
      severity: 'warning',
      cooldown: 5,
      channels: ['console'],
      tags: { resource: 'cpu' }
    });

    // Memory usage alert
    this.addRule({
      name: 'High Memory Usage',
      enabled: true,
      conditions: [
        { metric: 'resource.memory.usage', operator: '>', value: 85 }
      ],
      severity: 'warning',
      cooldown: 5,
      channels: ['console'],
      tags: { resource: 'memory' }
    });

    // API response time alert
    this.addRule({
      name: 'Slow API Response',
      enabled: true,
      conditions: [
        { metric: 'api.average_response_time', operator: '>', value: 1000 }
      ],
      severity: 'warning',
      cooldown: 3,
      channels: ['console'],
      tags: { component: 'api' }
    });

    // Database query time alert
    this.addRule({
      name: 'Slow Database Query',
      enabled: true,
      conditions: [
        { metric: 'database.query_duration', operator: '>', value: 500 }
      ],
      severity: 'warning',
      cooldown: 5,
      channels: ['console'],
      tags: { component: 'database' }
    });

    // Error rate alert
    this.addRule({
      name: 'High Error Rate',
      enabled: true,
      conditions: [
        { metric: 'api.error_rate', operator: '>', value: 5 }
      ],
      severity: 'error',
      cooldown: 2,
      channels: ['console'],
      tags: { type: 'error_rate' }
    });
  }

  private setupMonitoring(): void {
    if (!this.config.enabled) return;

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.evaluateRules();
        await this.checkSystemHealth();
        this.cleanupOldAlerts();
      } catch (error) {
        console.error('Error in alerting system:', error);
      }
    }, 30000); // Check every 30 seconds
  }

  private async evaluateRules(): Promise<void> {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // Check schedule
      if (rule.schedule?.enabled && !this.isScheduleActive(rule.schedule)) {
        continue;
      }

      // Check cooldown
      if (this.isInCooldown(rule.name, rule.cooldown)) {
        continue;
      }

      // Evaluate conditions
      const shouldAlert = await this.evaluateConditions(rule.conditions);
      if (shouldAlert) {
        await this.triggerRule(rule);
      }
    }
  }

  private async evaluateConditions(conditions: AlertCondition[]): Promise<boolean> {
    for (const condition of conditions) {
      const value = await this.getMetricValue(condition.metric, condition.aggregation, condition.window);
      if (!this.evaluateCondition(value, condition.operator, condition.value)) {
        return false;
      }
    }
    return true;
  }

  private async getMetricValue(metric: string, aggregation?: string, window?: number): Promise<number> {
    // Get metric value from metrics collector or other monitoring services
    const snapshot = metricsCollector.getSnapshot();
    const metricData = snapshot.metrics.find(m => m.name === metric);

    if (!metricData) return 0;

    // For now, return the current value
    // In a real implementation, would handle aggregation and time windows
    return metricData.value;
  }

  private evaluateCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '=': return value === threshold;
      case '!=': return value !== threshold;
      default: return false;
    }
  }

  private async triggerRule(rule: AlertRule): Promise<void> {
    // Get context for the alert
    const context = await this.getAlertContext(rule);

    const alert: Omit<Alert, 'id' | 'timestamp' | 'status' | 'escalated' | 'escalationLevel'> = {
      type: 'threshold',
      severity: rule.severity,
      category: this.inferCategory(rule.name),
      title: rule.name,
      description: this.generateAlertDescription(rule, context),
      source: 'alerting_system',
      metrics: context,
      context,
      tags: rule.tags,
      actions: rule.actions
    };

    this.createAlert(alert);
    this.setCooldown(rule.name, rule.cooldown);
  }

  private async getAlertContext(rule: AlertRule): Promise<Record<string, any>> {
    const context: Record<string, any> = {};

    for (const condition of rule.conditions) {
      const value = await this.getMetricValue(condition.metric, condition.aggregation, condition.window);
      context[condition.metric] = value;
    }

    return context;
  }

  private generateAlertDescription(rule: AlertRule, context: Record<string, any>): string {
    const conditions = rule.conditions.map(condition => {
      const value = context[condition.metric] || 'unknown';
      return `${condition.metric} ${condition.operator} ${condition.value} (current: ${value})`;
    });

    return `Alert triggered: ${rule.name}. Conditions: ${conditions.join(', ')}`;
  }

  private inferCategory(ruleName: string): string {
    if (ruleName.toLowerCase().includes('cpu')) return 'system';
    if (ruleName.toLowerCase().includes('memory')) return 'system';
    if (ruleName.toLowerCase().includes('api')) return 'api';
    if (ruleName.toLowerCase().includes('database')) return 'database';
    if (ruleName.toLowerCase().includes('network')) return 'network';
    if (ruleName.toLowerCase().includes('agent')) return 'agent';
    return 'general';
  }

  private async checkSystemHealth(): Promise<void> {
    // Check for performance anomalies
    const report = performanceAnalyzer.getLatestReport();
    if (report) {
      for (const anomaly of report.anomalies) {
        if (anomaly.severity === 'critical' || anomaly.severity === 'high') {
          this.createAlert({
            type: 'anomaly',
            severity: anomaly.severity === 'critical' ? 'critical' : 'error',
            category: anomaly.category,
            title: `Performance Anomaly: ${anomaly.metric}`,
            description: anomaly.description,
            source: 'performance_analyzer',
            metrics: { anomaly },
            context: { confidence: anomaly.confidence },
            tags: { anomaly_type: anomaly.type }
          });
        }
      }

      for (const bottleneck of report.bottlenecks) {
        if (bottleneck.severity === 'critical' || bottleneck.severity === 'high') {
          this.createAlert({
            type: 'bottleneck',
            severity: bottleneck.severity === 'critical' ? 'critical' : 'error',
            category: bottleneck.type,
            title: `Performance Bottleneck: ${bottleneck.type}`,
            description: bottleneck.description,
            source: 'performance_analyzer',
            metrics: { bottleneck },
            context: { impact: bottleneck.impact },
            tags: { bottleneck_type: bottleneck.type }
          });
        }
      }
    }

    // Check resource alerts
    const resourceAlerts = resourceMonitor.checkAlerts();
    for (const resourceAlert of resourceAlerts) {
      this.createAlert({
        type: 'threshold',
        severity: resourceAlert.severity === 'critical' ? 'critical' : 'warning',
        category: 'system',
        title: `Resource Alert: ${resourceAlert.type}`,
        description: resourceAlert.message,
        source: 'resource_monitor',
        metrics: { [resourceAlert.metric]: resourceAlert.value },
        context: { threshold: resourceAlert.threshold },
        tags: { resource_type: resourceAlert.type }
      });
    }
  }

  private async processAlert(alert: Alert): Promise<void> {
    // Execute alert actions
    if (alert.actions) {
      for (const action of alert.actions) {
        try {
          await this.executeAction(action, alert);
        } catch (error) {
          console.error(`Error executing alert action:`, error);
          action.error = (error as Error).message;
        }
      }
    }

    // Send notifications
    const channels = this.getChannelsForAlert(alert);
    for (const channel of channels) {
      try {
        await this.sendNotification(channel, alert);
      } catch (error) {
        console.error(`Error sending notification to ${channel.name}:`, error);
      }
    }

    // Check for escalation
    await this.checkEscalation(alert);
  }

  private getChannelsForAlert(alert: Alert): NotificationChannel[] {
    // Get channels from alert rules or use default channels
    const channels: NotificationChannel[] = [];

    // Find rules that might have triggered this alert
    for (const rule of this.rules.values()) {
      if (rule.conditions.some(c => alert.metrics[c.metric] !== undefined)) {
        for (const channelId of rule.channels) {
          const channel = this.channels.get(channelId);
          if (channel?.enabled) {
            channels.push(channel);
          }
        }
      }
    }

    // If no specific channels, use default channels
    if (channels.length === 0) {
      const defaultChannel = this.channels.get('console');
      if (defaultChannel?.enabled) {
        channels.push(defaultChannel);
      }
    }

    return channels;
  }

  private async executeAction(action: AlertAction, alert: Alert): Promise<void> {
    if (action.executed) return;

    action.executed = true;
    action.executedAt = Date.now();

    switch (action.type) {
      case 'script':
        // Execute script action
        console.log(`Executing script: ${action.description}`);
        action.result = { status: 'executed' };
        break;

      case 'webhook':
        // Send webhook
        try {
          const response = await fetch(action.config.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alert, action })
          });
          action.result = { status: response.status };
        } catch (error) {
          action.error = (error as Error).message;
        }
        break;

      case 'email':
        // Send email (would need email service integration)
        console.log(`Sending email: ${action.description}`);
        action.result = { status: 'sent' };
        break;

      case 'slack':
        // Send Slack notification (would need Slack integration)
        console.log(`Sending Slack message: ${action.description}`);
        action.result = { status: 'sent' };
        break;

      case 'restart':
        // Restart service (would need service management)
        console.log(`Restarting service: ${action.description}`);
        action.result = { status: 'restarted' };
        break;

      case 'scale':
        // Scale resources (would need auto-scaling integration)
        console.log(`Scaling resources: ${action.description}`);
        action.result = { status: 'scaled' };
        break;
    }
  }

  private async sendNotification(channel: NotificationChannel, alert: Alert): Promise<void> {
    // Check rate limiting
    if (!this.checkRateLimit(channel.id)) {
      console.log(`Rate limit exceeded for channel ${channel.name}`);
      return;
    }

    const message = this.formatNotificationMessage(channel, alert);

    switch (channel.type) {
      case 'console':
        console.log(`[ALERT] ${alert.title}: ${alert.description}`);
        break;

      case 'email':
        // Would integrate with email service
        console.log(`Email notification sent to ${channel.config.to}`);
        break;

      case 'slack':
        // Would integrate with Slack API
        console.log(`Slack notification sent to ${channel.config.channel}`);
        break;

      case 'webhook':
        try {
          await fetch(channel.config.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
          });
        } catch (error) {
          console.error('Webhook notification failed:', error);
        }
        break;
    }
  }

  private formatNotificationMessage(channel: NotificationChannel, alert: Alert): any {
    const template = channel.templates || {
      title: '[{severity}] {title}',
      body: '{description}\n\nSource: {source}\nTime: {timestamp}'
    };

    const timestamp = new Date(alert.timestamp).toISOString();
    const title = template.title
      .replace('{severity}', alert.severity.toUpperCase())
      .replace('{title}', alert.title)
      .replace('{category}', alert.category);

    const body = template.body
      .replace('{description}', alert.description)
      .replace('{source}', alert.source)
      .replace('{timestamp}', timestamp)
      .replace('{severity}', alert.severity)
      .replace('{category}', alert.category);

    return { title, body, alert };
  }

  private async checkEscalation(alert: Alert): Promise<void> {
    if (!this.config.alerts.escalation.enabled || alert.escalated) return;

    const timeSinceCreation = Date.now() - alert.timestamp;
    const escalationLevels = this.config.alerts.escalation.levels;

    for (const level of escalationLevels) {
      if (timeSinceCreation > level.threshold * 60 * 1000 && !alert.escalated) {
        alert.escalated = true;
        alert.escalationLevel = level.threshold;
        alert.title = `[ESCALATED] ${alert.title}`;

        // Send escalation notifications
        for (const channelId of level.channels) {
          const channel = this.channels.get(channelId);
          if (channel?.enabled) {
            await this.sendNotification(channel, alert);
          }
        }

        this.emit('alertEscalated', alert);
        break;
      }
    }
  }

  private checkRateLimit(channelId: string): boolean {
    const channel = this.channels.get(channelId);
    if (!channel?.rateLimit) return true;

    const now = Date.now();
    const timestamps = this.rateLimiters.get(channelId) || [];

    // Clean old timestamps
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;
    const recentMinute = timestamps.filter(t => t > oneMinuteAgo);
    const recentHour = timestamps.filter(t => t > oneHourAgo);

    // Check limits
    if (recentMinute.length >= channel.rateLimit.maxPerMinute) return false;
    if (recentHour.length >= channel.rateLimit.maxPerHour) return false;

    // Add current timestamp
    recentMinute.push(now);
    this.rateLimiters.set(channelId, recentMinute);

    return true;
  }

  private isInCooldown(key: string, cooldownMinutes: number): boolean {
    const lastTrigger = this.cooldowns.get(key);
    if (!lastTrigger) return false;

    const cooldownMs = cooldownMinutes * 60 * 1000;
    return (Date.now() - lastTrigger) < cooldownMs;
  }

  private setCooldown(key: string, cooldownMinutes: number): void {
    this.cooldowns.set(key, Date.now());
  }

  private isScheduleActive(schedule: AlertRule['schedule']): boolean {
    if (!schedule?.enabled) return true;

    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // Check if current day is active
    if (!schedule.activeDays.includes(currentDay)) return false;

    // Check if current time is within active hours
    for (const hours of schedule.activeHours) {
      const [startHour, startMin] = hours.start.split(':').map(Number);
      const [endHour, endMin] = hours.end.split(':').map(Number);
      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      if (currentTime >= startTime && currentTime <= endTime) {
        return true;
      }
    }

    return false;
  }

  private cleanupOldAlerts(): void {
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const [id, alert] of this.alerts.entries()) {
      if (alert.status === 'resolved' && now - alert.timestamp > maxAge) {
        this.alerts.delete(id);
      }
    }

    // Cleanup old cooldowns
    for (const [key, timestamp] of this.cooldowns.entries()) {
      if (now - timestamp > 60 * 60 * 1000) { // 1 hour
        this.cooldowns.delete(key);
      }
    }
  }

  private updateStatistics(): void {
    const alerts = Array.from(this.alerts.values());

    this.statistics.total = alerts.length;
    this.statistics.active = alerts.filter(a => a.status === 'active').length;
    this.statistics.resolved = alerts.filter(a => a.status === 'resolved').length;
    this.statistics.suppressed = alerts.filter(a => a.status === 'suppressed').length;

    // By severity
    this.statistics.bySeverity = {};
    for (const alert of alerts) {
      this.statistics.bySeverity[alert.severity] = (this.statistics.bySeverity[alert.severity] || 0) + 1;
    }

    // By category
    this.statistics.byCategory = {};
    for (const alert of alerts) {
      this.statistics.byCategory[alert.category] = (this.statistics.byCategory[alert.category] || 0) + 1;
    }

    // By source
    this.statistics.bySource = {};
    for (const alert of alerts) {
      this.statistics.bySource[alert.source] = (this.statistics.bySource[alert.source] || 0) + 1;
    }

    // Escalation rate
    const escalatedAlerts = alerts.filter(a => a.escalated);
    this.statistics.escalationRate = alerts.length > 0 ? (escalatedAlerts.length / alerts.length) * 100 : 0;
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRuleId(): string {
    return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateChannelId(): string {
    return `channel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.stopMonitoring();
    this.removeAllListeners();
  }
}

// Singleton instance
export const alertingSystem = new AlertingSystem();