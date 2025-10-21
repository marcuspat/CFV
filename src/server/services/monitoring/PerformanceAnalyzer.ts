/**
 * Performance Analyzer Service
 * Analyzes metrics, detects anomalies, and identifies performance bottlenecks
 */

import { EventEmitter } from 'events';
import { metricsCollector, Metric, MetricSnapshot } from './MetricsCollector.js';
import { DEFAULT_MONITORING_CONFIG, PerformanceThresholds } from '../../../config/monitoring.js';

export interface Anomaly {
  id: string;
  type: 'spike' | 'drop' | 'trend' | 'threshold' | 'pattern';
  severity: 'low' | 'medium' | 'high' | 'critical';
  metric: string;
  category: string;
  description: string;
  timestamp: number;
  value: number;
  expected: number;
  deviation: number;
  confidence: number;
  tags?: Record<string, string>;
}

export interface Bottleneck {
  id: string;
  type: 'cpu' | 'memory' | 'io' | 'network' | 'database' | 'coordination';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  metrics: string[];
  timestamp: number;
  recommendations: string[];
  estimatedImpact: {
    performanceLoss: number; // percentage
    resourceWaste: number; // percentage
  };
}

export interface PerformanceReport {
  timestamp: number;
  period: number; // ms
  overall: {
    score: number; // 0-100
    status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    trend: 'improving' | 'stable' | 'degrading';
  };
  anomalies: Anomaly[];
  bottlenecks: Bottleneck[];
  insights: PerformanceInsight[];
  recommendations: Recommendation[];
}

export interface PerformanceInsight {
  category: string;
  finding: string;
  evidence: string;
  impact: string;
  confidence: number;
}

export interface Recommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  action: string;
  expectedImprovement: string;
  effort: 'low' | 'medium' | 'high';
  timeline: string;
}

export class PerformanceAnalyzer extends EventEmitter {
  private config = DEFAULT_MONITORING_CONFIG;
  private analysisHistory: PerformanceReport[] = [];
  private baselineMetrics: Map<string, number> = new Map();
  private alertCooldowns: Map<string, number> = new Map();

  constructor() {
    super();
    this.setupAnalysis();
    this.calculateBaselines();
  }

  /**
   * Analyze current performance metrics
   */
  async analyzePerformance(): Promise<PerformanceReport> {
    const snapshot = metricsCollector.getSnapshot();
    const history = metricsCollector.getHistory(20); // Last 20 snapshots

    const anomalies = await this.detectAnomalies(snapshot, history);
    const bottlenecks = await this.identifyBottlenecks(snapshot, history);
    const insights = this.generateInsights(snapshot, history, anomalies, bottlenecks);
    const recommendations = this.generateRecommendations(anomalies, bottlenecks, insights);

    const overall = this.calculateOverallScore(snapshot, anomalies, bottlenecks);

    const report: PerformanceReport = {
      timestamp: Date.now(),
      period: this.config.interval,
      overall,
      anomalies,
      bottlenecks,
      insights,
      recommendations
    };

    this.analysisHistory.push(report);
    this.emit('analysis', report);

    return report;
  }

  /**
   * Detect performance anomalies
   */
  private async detectAnomalies(snapshot: MetricSnapshot, history: MetricSnapshot[]): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    for (const metric of snapshot.metrics) {
      const baseline = this.getBaseline(metric.name);
      const deviation = this.calculateDeviation(metric.value, baseline);

      // Check threshold violations
      if (this.isThresholdViolation(metric.name, metric.value)) {
        anomalies.push(this.createThresholdAnomaly(metric, baseline, deviation));
      }

      // Check for statistical anomalies
      if (this.isStatisticalAnomaly(metric, history)) {
        anomalies.push(this.createStatisticalAnomaly(metric, baseline, deviation));
      }

      // Check for pattern anomalies
      if (this.isPatternAnomaly(metric, history)) {
        anomalies.push(this.createPatternAnomaly(metric, baseline, deviation));
      }
    }

    return this.filterDuplicateAnomalies(anomalies);
  }

  /**
   * Identify performance bottlenecks
   */
  private async identifyBottlenecks(snapshot: MetricSnapshot, history: MetricSnapshot[]): Promise<Bottleneck[]> {
    const bottlenecks: Bottleneck[] = [];

    // CPU bottlenecks
    const cpuMetrics = snapshot.metrics.filter(m => m.name.includes('cpu') || m.name.includes('load'));
    if (this.detectCpuBottleneck(cpuMetrics)) {
      bottlenecks.push(this.createCpuBottleneck(cpuMetrics));
    }

    // Memory bottlenecks
    const memoryMetrics = snapshot.metrics.filter(m => m.name.includes('memory'));
    if (this.detectMemoryBottleneck(memoryMetrics)) {
      bottlenecks.push(this.createMemoryBottleneck(memoryMetrics));
    }

    // I/O bottlenecks
    const ioMetrics = snapshot.metrics.filter(m => m.name.includes('disk') || m.name.includes('io'));
    if (this.detectIoBottleneck(ioMetrics)) {
      bottlenecks.push(this.createIoBottleneck(ioMetrics));
    }

    // Network bottlenecks
    const networkMetrics = snapshot.metrics.filter(m => m.name.includes('network') || m.name.includes('latency'));
    if (this.detectNetworkBottleneck(networkMetrics)) {
      bottlenecks.push(this.createNetworkBottleneck(networkMetrics));
    }

    // Database bottlenecks
    const dbMetrics = snapshot.metrics.filter(m => m.name.includes('database') || m.name.includes('query'));
    if (this.detectDatabaseBottleneck(dbMetrics)) {
      bottlenecks.push(this.createDatabaseBottleneck(dbMetrics));
    }

    // Agent coordination bottlenecks
    const agentMetrics = snapshot.metrics.filter(m => m.name.includes('agent') || m.name.includes('coordination'));
    if (this.detectCoordinationBottleneck(agentMetrics)) {
      bottlenecks.push(this.createCoordinationBottleneck(agentMetrics));
    }

    return bottlenecks;
  }

  /**
   * Generate performance insights
   */
  private generateInsights(
    snapshot: MetricSnapshot,
    history: MetricSnapshot[],
    anomalies: Anomaly[],
    bottlenecks: Bottleneck[]
  ): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    // Performance trend analysis
    const trendInsights = this.analyzeTrends(history);
    insights.push(...trendInsights);

    // Resource utilization insights
    const utilizationInsights = this.analyzeUtilization(snapshot);
    insights.push(...utilizationInsights);

    // Anomaly correlation insights
    const correlationInsights = this.anomalyCorrelation(anomalies);
    insights.push(...correlationInsights);

    // System health insights
    const healthInsights = this.analyzeSystemHealth(snapshot, bottlenecks);
    insights.push(...healthInsights);

    return insights;
  }

  /**
   * Generate actionable recommendations
   */
  private generateRecommendations(
    anomalies: Anomaly[],
    bottlenecks: Bottleneck[],
    insights: PerformanceInsight[]
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Bottleneck-specific recommendations
    for (const bottleneck of bottlenecks) {
      recommendations.push(...this.getBottleneckRecommendations(bottleneck));
    }

    // Anomaly-specific recommendations
    for (const anomaly of anomalies) {
      if (anomaly.severity === 'high' || anomaly.severity === 'critical') {
        recommendations.push(...this.getAnomalyRecommendations(anomaly));
      }
    }

    // General optimization recommendations
    const generalRecommendations = this.getGeneralRecommendations(insights);
    recommendations.push(...generalRecommendations);

    // Sort by priority and effort
    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      const effortOrder = { low: 1, medium: 2, high: 3 };
      return effortOrder[a.effort] - effortOrder[b.effort];
    });
  }

  private calculateOverallScore(snapshot: MetricSnapshot, anomalies: Anomaly[], bottlenecks: Bottleneck[]) {
    let score = 100;

    // Deduct points for anomalies
    for (const anomaly of anomalies) {
      const deductions = {
        low: 5,
        medium: 10,
        high: 20,
        critical: 40
      };
      score -= deductions[anomaly.severity];
    }

    // Deduct points for bottlenecks
    for (const bottleneck of bottlenecks) {
      const deductions = {
        low: 10,
        medium: 20,
        high: 35,
        critical: 50
      };
      score -= deductions[bottleneck.severity];
    }

    score = Math.max(0, Math.min(100, score));

    let status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    let trend: 'improving' | 'stable' | 'degrading';

    if (score >= 90) status = 'excellent';
    else if (score >= 75) status = 'good';
    else if (score >= 60) status = 'fair';
    else if (score >= 40) status = 'poor';
    else status = 'critical';

    // Determine trend based on recent analysis history
    if (this.analysisHistory.length >= 2) {
      const recentScores = this.analysisHistory.slice(-5).map(r => r.overall.score);
      const averageChange = (recentScores[recentScores.length - 1] - recentScores[0]) / recentScores.length;

      if (averageChange > 2) trend = 'improving';
      else if (averageChange < -2) trend = 'degrading';
      else trend = 'stable';
    } else {
      trend = 'stable';
    }

    return { score, status, trend };
  }

  // Helper methods for anomaly detection
  private isThresholdViolation(metricName: string, value: number): boolean {
    const thresholds = this.config.thresholds;

    // Response time thresholds
    if (metricName.includes('response_time') || metricName.includes('duration')) {
      return value > thresholds.responseTime.warning;
    }

    // CPU thresholds
    if (metricName.includes('cpu_usage')) {
      return value > thresholds.cpu.warning;
    }

    // Memory thresholds
    if (metricName.includes('memory_usage') || metricName.includes('memory_percent')) {
      return value > thresholds.memory.warning;
    }

    return false;
  }

  private createThresholdAnomaly(metric: Metric, baseline: number, deviation: number): Anomaly {
    const thresholds = this.config.thresholds;
    let severity: 'low' | 'medium' | 'high' | 'critical';

    if (metric.name.includes('response_time')) {
      severity = metric.value > thresholds.responseTime.critical ? 'critical' : 'high';
    } else if (metric.name.includes('cpu') || metric.name.includes('memory')) {
      severity = metric.value > 90 ? 'critical' : 'high';
    } else {
      severity = deviation > 100 ? 'high' : 'medium';
    }

    return {
      id: this.generateAnomalyId(),
      type: 'threshold',
      severity,
      metric: metric.name,
      category: metric.category,
      description: `${metric.name} exceeded threshold: ${metric.value.toFixed(2)}${metric.unit} (threshold: ${baseline.toFixed(2)}${metric.unit})`,
      timestamp: Date.now(),
      value: metric.value,
      expected: baseline,
      deviation,
      confidence: 0.95,
      tags: metric.tags
    };
  }

  private isStatisticalAnomaly(metric: Metric, history: MetricSnapshot[]): boolean {
    if (history.length < 5) return false;

    const historicalValues = history
      .flatMap(h => h.metrics)
      .filter(m => m.name === metric.name)
      .map(m => m.value);

    if (historicalValues.length < 3) return false;

    const mean = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
    const stdDev = Math.sqrt(
      historicalValues.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / historicalValues.length
    );

    // Anomaly if value is more than 2 standard deviations from mean
    return Math.abs(metric.value - mean) > 2 * stdDev;
  }

  private createStatisticalAnomaly(metric: Metric, baseline: number, deviation: number): Anomaly {
    return {
      id: this.generateAnomalyId(),
      type: 'spike',
      severity: Math.abs(deviation) > 200 ? 'high' : 'medium',
      metric: metric.name,
      category: metric.category,
      description: `Statistical anomaly detected in ${metric.name}: ${metric.value.toFixed(2)}${metric.unit} (baseline: ${baseline.toFixed(2)}${metric.unit})`,
      timestamp: Date.now(),
      value: metric.value,
      expected: baseline,
      deviation,
      confidence: 0.85,
      tags: metric.tags
    };
  }

  private isPatternAnomaly(metric: Metric, history: MetricSnapshot[]): boolean {
    // This would implement more sophisticated pattern detection
    // For now, just check for sudden drops or spikes
    if (history.length < 2) return false;

    const previousValue = history[history.length - 1].metrics
      .find(m => m.name === metric.name)?.value;

    if (!previousValue) return false;

    const changePercent = Math.abs((metric.value - previousValue) / previousValue) * 100;
    return changePercent > 50; // 50% change is significant
  }

  private createPatternAnomaly(metric: Metric, baseline: number, deviation: number): Anomaly {
    return {
      id: this.generateAnomalyId(),
      type: 'pattern',
      severity: 'medium',
      metric: metric.name,
      category: metric.category,
      description: `Pattern anomaly detected in ${metric.name}: unusual value change`,
      timestamp: Date.now(),
      value: metric.value,
      expected: baseline,
      deviation,
      confidence: 0.75,
      tags: metric.tags
    };
  }

  // Bottleneck detection methods
  private detectCpuBottleneck(cpuMetrics: Metric[]): boolean {
    const loadAvg = cpuMetrics.find(m => m.name.includes('load_1m'));
    return loadAvg ? loadAvg.value > (this.config.thresholds.cpu.warning / 100) * os.cpus().length : false;
  }

  private createCpuBottleneck(metrics: Metric[]): Bottleneck {
    return {
      id: this.generateBottleneckId(),
      type: 'cpu',
      severity: 'high',
      description: 'High CPU utilization detected',
      impact: 'System responsiveness and processing speed are degraded',
      metrics: metrics.map(m => m.name),
      timestamp: Date.now(),
      recommendations: [
        'Profile CPU-intensive operations',
        'Consider scaling horizontally or vertically',
        'Optimize algorithms and data structures',
        'Implement caching strategies'
      ],
      estimatedImpact: {
        performanceLoss: 25,
        resourceWaste: 15
      }
    };
  }

  private detectMemoryBottleneck(memoryMetrics: Metric[]): boolean {
    const memoryUsage = memoryMetrics.find(m => m.name.includes('usage_percent') || m.name.includes('heap_used'));
    return memoryUsage ? memoryUsage.value > this.config.thresholds.memory.warning : false;
  }

  private createMemoryBottleneck(metrics: Metric[]): Bottleneck {
    return {
      id: this.generateBottleneckId(),
      type: 'memory',
      severity: 'high',
      description: 'High memory usage detected',
      impact: 'Risk of memory leaks and out-of-memory errors',
      metrics: metrics.map(m => m.name),
      timestamp: Date.now(),
      recommendations: [
        'Profile memory usage and identify leaks',
        'Optimize data structures and algorithms',
        'Implement memory pooling or streaming',
        'Consider increasing available memory'
      ],
      estimatedImpact: {
        performanceLoss: 30,
        resourceWaste: 20
      }
    };
  }

  private detectIoBottleneck(ioMetrics: Metric[]): boolean {
    // Simplified I/O bottleneck detection
    return ioMetrics.some(m => m.name.includes('disk') && m.value > 100);
  }

  private createIoBottleneck(metrics: Metric[]): Bottleneck {
    return {
      id: this.generateBottleneckId(),
      type: 'io',
      severity: 'medium',
      description: 'Disk I/O bottleneck detected',
      impact: 'Slow data access and processing delays',
      metrics: metrics.map(m => m.name),
      timestamp: Date.now(),
      recommendations: [
        'Optimize database queries',
        'Implement caching layers',
        'Use faster storage solutions',
        'Batch I/O operations'
      ],
      estimatedImpact: {
        performanceLoss: 20,
        resourceWaste: 10
      }
    };
  }

  private detectNetworkBottleneck(networkMetrics: Metric[]): boolean {
    const latency = networkMetrics.find(m => m.name.includes('latency'));
    return latency ? latency.value > this.config.thresholds.network.latencyWarning : false;
  }

  private createNetworkBottleneck(metrics: Metric[]): Bottleneck {
    return {
      id: this.generateBottleneckId(),
      type: 'network',
      severity: 'medium',
      description: 'Network latency issues detected',
      impact: 'Slow API responses and data transfer',
      metrics: metrics.map(m => m.name),
      timestamp: Date.now(),
      recommendations: [
        'Optimize network requests and responses',
        'Implement compression and minification',
        'Use CDNs for static content',
        'Consider connection pooling'
      ],
      estimatedImpact: {
        performanceLoss: 15,
        resourceWaste: 5
      }
    };
  }

  private detectDatabaseBottleneck(dbMetrics: Metric[]): boolean {
    const queryTime = dbMetrics.find(m => m.name.includes('query_time') || m.name.includes('duration'));
    return queryTime ? queryTime.value > this.config.thresholds.database.queryTimeWarning : false;
  }

  private createDatabaseBottleneck(metrics: Metric[]): Bottleneck {
    return {
      id: this.generateBottleneckId(),
      type: 'database',
      severity: 'high',
      description: 'Database performance issues detected',
      impact: 'Slow data retrieval and processing',
      metrics: metrics.map(m => m.name),
      timestamp: Date.now(),
      recommendations: [
        'Optimize database queries and indexes',
        'Implement query caching',
        'Consider database connection pooling',
        'Profile and optimize slow queries'
      ],
      estimatedImpact: {
        performanceLoss: 35,
        resourceWaste: 25
      }
    };
  }

  private detectCoordinationBottleneck(agentMetrics: Metric[]): boolean {
    const overhead = agentMetrics.find(m => m.name.includes('overhead'));
    return overhead ? overhead.value > this.config.thresholds.agentCoordination.overheadWarning : false;
  }

  private createCoordinationBottleneck(metrics: Metric[]): Bottleneck {
    return {
      id: this.generateBottleneckId(),
      type: 'coordination',
      severity: 'medium',
      description: 'Agent coordination overhead detected',
      impact: 'Reduced swarm efficiency and increased latency',
      metrics: metrics.map(m => m.name),
      timestamp: Date.now(),
      recommendations: [
        'Optimize agent communication patterns',
        'Reduce unnecessary coordination overhead',
        'Implement more efficient message passing',
        'Consider decentralized coordination'
      ],
      estimatedImpact: {
        performanceLoss: 20,
        resourceWaste: 15
      }
    };
  }

  // Helper methods
  private getBaseline(metricName: string): number {
    return this.baselineMetrics.get(metricName) || 0;
  }

  private calculateDeviation(value: number, baseline: number): number {
    if (baseline === 0) return value;
    return ((value - baseline) / baseline) * 100;
  }

  private generateAnomalyId(): string {
    return `anomaly_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBottleneckId(): string {
    return `bottleneck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private filterDuplicateAnomalies(anomalies: Anomaly[]): Anomaly[] {
    // Simple deduplication by metric name and type
    const seen = new Set<string>();
    return anomalies.filter(anomaly => {
      const key = `${anomaly.metric}_${anomaly.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private setupAnalysis(): void {
    // Run analysis every 30 seconds
    setInterval(() => {
      this.analyzePerformance().catch(console.error);
    }, 30000);
  }

  private async calculateBaselines(): Promise<void> {
    // Collect baseline metrics over time
    const snapshots = metricsCollector.getHistory(10);

    if (snapshots.length > 0) {
      const allMetrics = snapshots.flatMap(s => s.metrics);
      const metricsByName = new Map<string, number[]>();

      for (const metric of allMetrics) {
        const values = metricsByName.get(metric.name) || [];
        values.push(metric.value);
        metricsByName.set(metric.name, values);
      }

      for (const [name, values] of metricsByName.entries()) {
        const baseline = values.reduce((a, b) => a + b, 0) / values.length;
        this.baselineMetrics.set(name, baseline);
      }
    }
  }

  private analyzeTrends(history: MetricSnapshot[]): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    if (history.length < 5) return insights;

    // Analyze response time trend
    const responseTimes = history
      .flatMap(h => h.metrics)
      .filter(m => m.name.includes('response_time') || m.name.includes('duration'));

    if (responseTimes.length >= 3) {
      const recent = responseTimes.slice(-3).reduce((a, b) => a + b.value, 0) / 3;
      const older = responseTimes.slice(0, 3).reduce((a, b) => a + b.value, 0) / 3;
      const trend = ((recent - older) / older) * 100;

      if (Math.abs(trend) > 10) {
        insights.push({
          category: 'Performance',
          finding: `Response times are ${trend > 0 ? 'increasing' : 'decreasing'} by ${Math.abs(trend).toFixed(1)}%`,
          evidence: `Average response time changed from ${older.toFixed(2)}ms to ${recent.toFixed(2)}ms`,
          impact: trend > 0 ? 'User experience degradation' : 'Improved user experience',
          confidence: 0.8
        });
      }
    }

    return insights;
  }

  private analyzeUtilization(snapshot: MetricSnapshot): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    // Memory utilization analysis
    const memoryUsage = snapshot.metrics.find(m => m.name.includes('memory_percent'));
    if (memoryUsage) {
      if (memoryUsage.value > 80) {
        insights.push({
          category: 'Memory',
          finding: `High memory usage at ${memoryUsage.value.toFixed(1)}%`,
          evidence: 'Memory usage consistently above 80%',
          impact: 'Risk of memory leaks and performance degradation',
          confidence: 0.9
        });
      }
    }

    // CPU utilization analysis
    const loadAvg = snapshot.metrics.find(m => m.name.includes('load_1m'));
    if (loadAvg) {
      const cpuCount = os.cpus().length;
      const utilizationPercent = (loadAvg.value / cpuCount) * 100;

      if (utilizationPercent > 70) {
        insights.push({
          category: 'CPU',
          finding: `High CPU utilization at ${utilizationPercent.toFixed(1)}%`,
          evidence: `Load average: ${loadAvg.value.toFixed(2)} on ${cpuCount} CPUs`,
          impact: 'System responsiveness may be degraded',
          confidence: 0.85
        });
      }
    }

    return insights;
  }

  private anomalyCorrelation(anomalies: Anomaly[]): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    // Group anomalies by category
    const anomaliesByCategory = new Map<string, Anomaly[]>();
    for (const anomaly of anomalies) {
      const categoryAnomalies = anomaliesByCategory.get(anomaly.category) || [];
      categoryAnomalies.push(anomaly);
      anomaliesByCategory.set(anomaly.category, categoryAnomalies);
    }

    // Find correlated anomalies
    for (const [category, categoryAnomalies] of anomaliesByCategory.entries()) {
      if (categoryAnomalies.length > 2) {
        insights.push({
          category,
          finding: `Multiple anomalies detected in ${category}`,
          evidence: `${categoryAnomalies.length} anomalies in the same category`,
          impact: 'May indicate systemic issue requiring comprehensive review',
          confidence: 0.75
        });
      }
    }

    return insights;
  }

  private analyzeSystemHealth(snapshot: MetricSnapshot, bottlenecks: Bottleneck[]): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    // Overall system health assessment
    const criticalBottlenecks = bottlenecks.filter(b => b.severity === 'critical').length;
    const highBottlenecks = bottlenecks.filter(b => b.severity === 'high').length;

    if (criticalBottlenecks > 0) {
      insights.push({
        category: 'System Health',
        finding: 'Critical system issues detected',
        evidence: `${criticalBottlenecks} critical bottlenecks identified`,
        impact: 'Immediate attention required to prevent system failure',
        confidence: 0.95
      });
    } else if (highBottlenecks > 2) {
      insights.push({
        category: 'System Health',
        finding: 'Multiple high-priority performance issues',
        evidence: `${highBottlenecks} high-severity bottlenecks identified`,
        impact: 'Performance significantly degraded, user experience affected',
        confidence: 0.85
      });
    }

    return insights;
  }

  private getBottleneckRecommendations(bottleneck: Bottleneck): Recommendation[] {
    return bottleneck.recommendations.map(action => ({
      priority: bottleneck.severity === 'critical' ? 'critical' :
                bottleneck.severity === 'high' ? 'high' : 'medium',
      category: bottleneck.type,
      action,
      expectedImprovement: `Reduce ${bottleneck.type} bottleneck impact`,
      effort: 'medium',
      timeline: '1-2 weeks'
    }));
  }

  private getAnomalyRecommendations(anomaly: Anomaly): Recommendation[] {
    const recommendations: Recommendation[] = [];

    switch (anomaly.type) {
      case 'threshold':
        recommendations.push({
          priority: anomaly.severity,
          category: anomaly.category,
          action: `Investigate and resolve ${anomaly.metric} threshold violation`,
          expectedImprovement: `Restore ${anomaly.metric} to normal levels`,
          effort: 'medium',
          timeline: 'Immediate'
        });
        break;
      case 'spike':
        recommendations.push({
          priority: anomaly.severity,
          category: anomaly.category,
          action: `Investigate spike in ${anomaly.metric}`,
          expectedImprovement: 'Prevent future spikes',
          effort: 'low',
          timeline: '1-3 days'
        });
        break;
    }

    return recommendations;
  }

  private getGeneralRecommendations(insights: PerformanceInsight[]): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Add general optimization recommendations based on insights
    const performanceInsights = insights.filter(i => i.category === 'Performance');
    if (performanceInsights.length > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'General',
        action: 'Implement comprehensive performance monitoring',
        expectedImprovement: 'Better visibility into performance issues',
        effort: 'medium',
        timeline: '1-2 weeks'
      });
    }

    return recommendations;
  }

  /**
   * Get latest performance report
   */
  getLatestReport(): PerformanceReport | null {
    return this.analysisHistory.length > 0 ? this.analysisHistory[this.analysisHistory.length - 1] : null;
  }

  /**
   * Get performance analysis history
   */
  getAnalysisHistory(limit?: number): PerformanceReport[] {
    if (limit) {
      return this.analysisHistory.slice(-limit);
    }
    return [...this.analysisHistory];
  }
}

// Import os for CPU count
import * as os from 'os';

// Singleton instance
export const performanceAnalyzer = new PerformanceAnalyzer();