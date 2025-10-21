/**
 * Baseline Manager for Performance Monitoring
 * Establishes and maintains performance baselines for anomaly detection
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { join } from 'path';
import { metricsCollector } from './MetricsCollector.js';
import { performanceAnalyzer } from './PerformanceAnalyzer.js';
import { DEFAULT_MONITORING_CONFIG } from '../../../config/monitoring.js';

export interface BaselineMetric {
  name: string;
  category: string;
  baseline: number;
  unit: string;
  variance: number;
  samples: number;
  confidence: number;
  updated: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  seasonal?: {
    pattern: number[]; // 24-hour pattern
    detected: boolean;
  };
}

export interface PerformanceBaseline {
  id: string;
  name: string;
  description: string;
  created: number;
  updated: number;
  period: number; // hours of data used
  metrics: BaselineMetric[];
  thresholds: {
    warning: number; // percentage above baseline
    critical: number; // percentage above baseline
  };
  status: 'active' | 'building' | 'stale' | 'error';
  quality: {
    score: number; // 0-100
    factors: {
      sampleSize: number;
      variance: number;
      trend: number;
      seasonality: number;
    };
  };
}

export interface BaselineAnalysis {
  baseline: PerformanceBaseline;
  current: Array<{
    metric: string;
    value: number;
    deviation: number;
    status: 'normal' | 'warning' | 'critical';
  }>;
  overall: {
    score: number;
    status: 'healthy' | 'degraded' | 'critical';
    recommendations: string[];
  };
  trends: Array<{
    metric: string;
    trend: 'improving' | 'degrading' | 'stable';
    change: number;
    significance: number;
  }>;
}

export class BaselineManager extends EventEmitter {
  private config = DEFAULT_MONITORING_CONFIG;
  private baselines: Map<string, PerformanceBaseline> = new Map();
  private baselineData: Map<string, number[]> = new Map();
  private buildingBaselines: Map<string, NodeJS.Timeout> = new Map();
  private storagePath: string;

  constructor() {
    super();
    this.storagePath = join(process.cwd(), 'data', 'baselines');
    this.loadBaselines();
    this.setupPeriodicBuilding();
  }

  /**
   * Create a new performance baseline
   */
  async createBaseline(
    name: string,
    description: string,
    periodHours: number = 24,
    metrics?: string[]
  ): Promise<string> {
    const id = this.generateBaselineId();
    const baseline: PerformanceBaseline = {
      id,
      name,
      description,
      created: Date.now(),
      updated: Date.now(),
      period: periodHours,
      metrics: [],
      thresholds: {
        warning: 20, // 20% above baseline
        critical: 50 // 50% above baseline
      },
      status: 'building',
      quality: {
        score: 0,
        factors: {
          sampleSize: 0,
          variance: 0,
          trend: 0,
          seasonality: 0
        }
      }
    };

    this.baselines.set(id, baseline);

    // Start building the baseline
    await this.buildBaseline(id, metrics);

    this.emit('baselineCreated', baseline);
    return id;
  }

  /**
   * Build a baseline from historical data
   */
  async buildBaseline(baselineId: string, specificMetrics?: string[]): Promise<void> {
    const baseline = this.baselines.get(baselineId);
    if (!baseline) {
      throw new Error(`Baseline not found: ${baselineId}`);
    }

    baseline.status = 'building';
    this.emit('baselineBuilding', baseline);

    // Get historical metrics for the specified period
    const history = metricsCollector.getHistory(
      Math.ceil((baseline.period * 60 * 60 * 1000) / (this.config.interval * 2)) // Number of snapshots
    );

    if (history.length < 10) {
      baseline.status = 'error';
      baseline.quality.score = 0;
      this.emit('baselineError', baseline, 'Insufficient historical data');
      return;
    }

    // Process metrics to create baselines
    const metricNames = specificMetrics || this.extractMetricNames(history);
    const baselineMetrics: BaselineMetric[] = [];

    for (const metricName of metricNames) {
      const values = this.extractMetricValues(history, metricName);
      if (values.length >= 5) { // Minimum samples for baseline
        const baselineMetric = this.calculateBaselineMetric(metricName, values);
        baselineMetrics.push(baselineMetric);
      }
    }

    baseline.metrics = baselineMetrics;
    baseline.updated = Date.now();
    baseline.quality = this.calculateBaselineQuality(baselineMetrics, history.length);

    if (baseline.quality.score >= 70) {
      baseline.status = 'active';
    } else {
      baseline.status = 'stale';
    }

    await this.saveBaselines();
    this.emit('baselineBuilt', baseline);
  }

  /**
   * Analyze current metrics against baselines
   */
  async analyzeAgainstBaselines(baselineId?: string): Promise<BaselineAnalysis[]> {
    const baselinesToAnalyze = baselineId
      ? [this.baselines.get(baselineId)].filter(Boolean) as PerformanceBaseline[]
      : Array.from(this.baselines.values()).filter(b => b.status === 'active');

    const analyses: BaselineAnalysis[] = [];
    const currentSnapshot = metricsCollector.getSnapshot();

    for (const baseline of baselinesToAnalyze) {
      const analysis = this.analyzeBaseline(baseline, currentSnapshot);
      analyses.push(analysis);
    }

    return analyses;
  }

  /**
   * Update baseline with new data
   */
  async updateBaseline(baselineId: string, adaptive: boolean = false): Promise<void> {
    const baseline = this.baselines.get(baselineId);
    if (!baseline) {
      throw new Error(`Baseline not found: ${baselineId}`);
    }

    if (adaptive) {
      // Adaptive baseline - gradually update with new data
      await this.adaptiveUpdate(baseline);
    } else {
      // Full rebuild
      await this.buildBaseline(baselineId);
    }

    this.emit('baselineUpdated', baseline);
  }

  /**
   * Get all baselines
   */
  getBaselines(): PerformanceBaseline[] {
    return Array.from(this.baselines.values())
      .sort((a, b) => b.updated - a.updated);
  }

  /**
   * Get baseline by ID
   */
  getBaseline(id: string): PerformanceBaseline | undefined {
    return this.baselines.get(id);
  }

  /**
   * Delete baseline
   */
  async deleteBaseline(id: string): Promise<boolean> {
    const baseline = this.baselines.get(id);
    if (!baseline) return false;

    this.baselines.delete(id);
    this.baselineData.delete(id);

    // Cancel any ongoing building
    const builder = this.buildingBaselines.get(id);
    if (builder) {
      clearTimeout(builder);
      this.buildingBaselines.delete(id);
    }

    await this.saveBaselines();
    this.emit('baselineDeleted', baseline);
    return true;
  }

  /**
   * Export baseline
   */
  exportBaseline(id: string): string {
    const baseline = this.baselines.get(id);
    if (!baseline) {
      throw new Error(`Baseline not found: ${id}`);
    }

    return JSON.stringify(baseline, null, 2);
  }

  /**
   * Import baseline
   */
  async importBaseline(data: string): Promise<string> {
    try {
      const baseline: PerformanceBaseline = JSON.parse(data);

      // Validate baseline structure
      if (!baseline.id || !baseline.name || !baseline.metrics) {
        throw new Error('Invalid baseline format');
      }

      // Generate new ID to avoid conflicts
      const newId = this.generateBaselineId();
      baseline.id = newId;
      baseline.created = Date.now();
      baseline.updated = Date.now();

      this.baselines.set(newId, baseline);
      await this.saveBaselines();

      this.emit('baselineImported', baseline);
      return newId;
    } catch (error) {
      throw new Error(`Failed to import baseline: ${(error as Error).message}`);
    }
  }

  /**
   * Detect anomalies using baselines
   */
  detectAnomalies(baselineId?: string): Array<{
    metric: string;
    value: number;
    baseline: number;
    deviation: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    baselineId: string;
  }> {
    const baselinesToCheck = baselineId
      ? [this.baselines.get(baselineId)].filter(Boolean) as PerformanceBaseline[]
      : Array.from(this.baselines.values()).filter(b => b.status === 'active');

    const anomalies: any[] = [];
    const currentSnapshot = metricsCollector.getSnapshot();

    for (const baseline of baselinesToCheck) {
      for (const baselineMetric of baseline.metrics) {
        const currentMetric = currentSnapshot.metrics.find(m => m.name === baselineMetric.name);
        if (!currentMetric) continue;

        const deviation = this.calculateDeviation(currentMetric.value, baselineMetric.baseline);
        const threshold = deviation > baseline.thresholds.critical ? 'critical' :
                         deviation > baseline.thresholds.warning ? 'high' :
                         deviation > 10 ? 'medium' : 'low';

        if (deviation > 10) { // Only report deviations over 10%
          anomalies.push({
            metric: baselineMetric.name,
            value: currentMetric.value,
            baseline: baselineMetric.baseline,
            deviation,
            severity: threshold,
            baselineId: baseline.id
          });
        }
      }
    }

    return anomalies.sort((a, b) => b.deviation - a.deviation);
  }

  private extractMetricNames(history: any[]): string[] {
    const metricNames = new Set<string>();
    for (const snapshot of history) {
      for (const metric of snapshot.metrics) {
        metricNames.add(metric.name);
      }
    }
    return Array.from(metricNames);
  }

  private extractMetricValues(history: any[], metricName: string): number[] {
    const values: number[] = [];
    for (const snapshot of history) {
      const metric = snapshot.metrics.find((m: any) => m.name === metricName);
      if (metric) {
        values.push(metric.value);
      }
    }
    return values;
  }

  private calculateBaselineMetric(name: string, values: number[]): BaselineMetric {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Detect trend
    const trend = this.detectTrend(values);

    // Detect seasonality (simplified 24-hour pattern)
    const seasonal = this.detectSeasonality(values);

    // Determine category from metric name
    const category = this.inferCategory(name);

    return {
      name,
      category,
      baseline: mean,
      unit: 'value', // Would need to extract from metric metadata
      variance: stdDev,
      samples: values.length,
      confidence: Math.min(100, (values.length / 100) * 100), // More samples = higher confidence
      updated: Date.now(),
      trend,
      seasonal
    };
  }

  private detectTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 10) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstMean = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
    const secondMean = secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length;

    const change = ((secondMean - firstMean) / firstMean) * 100;

    if (change > 5) return 'increasing';
    if (change < -5) return 'decreasing';
    return 'stable';
  }

  private detectSeasonality(values: number[]): BaselineMetric['seasonal'] {
    // Simplified seasonality detection for 24-hour patterns
    // In a real implementation, would use more sophisticated time series analysis

    if (values.length < 24) {
      return { pattern: [], detected: false };
    }

    // Group values by hour (simplified - assumes 1 value per hour)
    const hourlyPattern = new Array(24).fill(0);
    const hourlyCounts = new Array(24).fill(0);

    values.forEach((value, index) => {
      const hour = index % 24;
      hourlyPattern[hour] += value;
      hourlyCounts[hour]++;
    });

    // Calculate averages
    for (let i = 0; i < 24; i++) {
      if (hourlyCounts[i] > 0) {
        hourlyPattern[i] /= hourlyCounts[i];
      }
    }

    // Simple seasonality detection: check if pattern varies significantly
    const overallMean = hourlyPattern.reduce((sum, v) => sum + v, 0) / 24;
    const variance = hourlyPattern.reduce((sum, v) => sum + Math.pow(v - overallMean, 2), 0) / 24;
    const coefficientOfVariation = Math.sqrt(variance) / overallMean;

    return {
      pattern: hourlyPattern,
      detected: coefficientOfVariation > 0.2 // 20% variation indicates seasonality
    };
  }

  private inferCategory(metricName: string): string {
    if (metricName.includes('cpu') || metricName.includes('memory') || metricName.includes('disk')) {
      return 'system';
    }
    if (metricName.includes('database') || metricName.includes('query')) {
      return 'database';
    }
    if (metricName.includes('network') || metricName.includes('latency')) {
      return 'network';
    }
    if (metricName.includes('api') || metricName.includes('response')) {
      return 'api';
    }
    if (metricName.includes('agent') || metricName.includes('coordination')) {
      return 'agent';
    }
    return 'application';
  }

  private calculateBaselineQuality(metrics: BaselineMetric[], totalSamples: number): PerformanceBaseline['quality'] {
    // Sample size factor
    const sampleSizeFactor = Math.min(100, (totalSamples / 1000) * 100);

    // Variance factor (lower variance = higher quality)
    const avgVariance = metrics.reduce((sum, m) => sum + m.variance, 0) / metrics.length;
    const avgBaseline = metrics.reduce((sum, m) => sum + m.baseline, 0) / metrics.length;
    const coefficientOfVariation = avgBaseline > 0 ? (avgVariance / avgBaseline) * 100 : 100;
    const varianceFactor = Math.max(0, 100 - coefficientOfVariation);

    // Trend factor (stable trends = higher quality)
    const trendFactor = metrics.filter(m => m.trend === 'stable').length / metrics.length * 100;

    // Seasonality factor (detected patterns = higher quality)
    const seasonalityFactor = metrics.filter(m => m.seasonal?.detected).length / metrics.length * 50;

    // Overall quality score
    const score = (sampleSizeFactor * 0.3 + varianceFactor * 0.4 + trendFactor * 0.2 + seasonalityFactor * 0.1);

    return {
      score: Math.round(score),
      factors: {
        sampleSize: Math.round(sampleSizeFactor),
        variance: Math.round(varianceFactor),
        trend: Math.round(trendFactor),
        seasonality: Math.round(seasonalityFactor)
      }
    };
  }

  private analyzeBaseline(baseline: PerformanceBaseline, currentSnapshot: any): BaselineAnalysis {
    const currentMetrics: BaselineAnalysis['current'] = [];
    let totalScore = 0;
    let metricCount = 0;

    for (const baselineMetric of baseline.metrics) {
      const currentMetric = currentSnapshot.metrics.find((m: any) => m.name === baselineMetric.name);
      if (!currentMetric) continue;

      const deviation = this.calculateDeviation(currentMetric.value, baselineMetric.baseline);
      const status = deviation > baseline.thresholds.critical ? 'critical' :
                    deviation > baseline.thresholds.warning ? 'warning' : 'normal';

      currentMetrics.push({
        metric: baselineMetric.name,
        value: currentMetric.value,
        deviation,
        status
      });

      // Score calculation
      const metricScore = status === 'normal' ? 100 :
                         status === 'warning' ? 60 : 20;
      totalScore += metricScore;
      metricCount++;
    }

    const overallScore = metricCount > 0 ? totalScore / metricCount : 0;
    const overallStatus = overallScore >= 80 ? 'healthy' :
                         overallScore >= 60 ? 'degraded' : 'critical';

    // Generate recommendations
    const recommendations = this.generateRecommendations(currentMetrics, baseline);

    // Analyze trends (simplified)
    const trends = this.analyzeMetricTrends(baseline, currentSnapshot);

    return {
      baseline,
      current: currentMetrics,
      overall: {
        score: Math.round(overallScore),
        status: overallStatus,
        recommendations
      },
      trends
    };
  }

  private calculateDeviation(current: number, baseline: number): number {
    if (baseline === 0) return current > 0 ? 100 : 0;
    return Math.abs(((current - baseline) / baseline) * 100);
  }

  private generateRecommendations(currentMetrics: BaselineAnalysis['current'], baseline: PerformanceBaseline): string[] {
    const recommendations: string[] = [];
    const criticalMetrics = currentMetrics.filter(m => m.status === 'critical');
    const warningMetrics = currentMetrics.filter(m => m.status === 'warning');

    if (criticalMetrics.length > 0) {
      recommendations.push(`Immediate attention required for ${criticalMetrics.length} critical metrics`);
    }

    if (warningMetrics.length > 0) {
      recommendations.push(`${warningMetrics.length} metrics show performance degradation`);
    }

    // Specific recommendations based on metric categories
    const systemMetrics = currentMetrics.filter(m =>
      baseline.metrics.find(bm => bm.name === m.metric)?.category === 'system'
    );

    if (systemMetrics.some(m => m.status !== 'normal')) {
      recommendations.push('System resources under stress - consider scaling or optimization');
    }

    const apiMetrics = currentMetrics.filter(m =>
      baseline.metrics.find(bm => bm.name === m.metric)?.category === 'api'
    );

    if (apiMetrics.some(m => m.status !== 'normal')) {
      recommendations.push('API performance degraded - check for bottlenecks or increased load');
    }

    return recommendations;
  }

  private analyzeMetricTrends(baseline: PerformanceBaseline, currentSnapshot: any): BaselineAnalysis['trends'] {
    const trends: BaselineAnalysis['trends'] = [];

    for (const baselineMetric of baseline.metrics) {
      const currentMetric = currentSnapshot.metrics.find((m: any) => m.name === baselineMetric.name);
      if (!currentMetric) continue;

      const change = this.calculateDeviation(currentMetric.value, baselineMetric.baseline);
      const trend = change > 10 ? 'degrading' : change < -10 ? 'improving' : 'stable';

      // Significance based on baseline variance
      const significance = Math.min(100, (change / Math.max(baselineMetric.variance, 1)) * 10);

      trends.push({
        metric: baselineMetric.name,
        trend,
        change,
        significance
      });
    }

    return trends.sort((a, b) => b.significance - a.significance);
  }

  private async adaptiveUpdate(baseline: PerformanceBaseline): Promise<void> {
    // Get recent metrics for adaptive update
    const recentHistory = metricsCollector.getHistory(10); // Last 10 snapshots
    if (recentHistory.length < 5) return;

    for (const baselineMetric of baseline.metrics) {
      const recentValues = this.extractMetricValues(recentHistory, baselineMetric.name);
      if (recentValues.length < 3) continue;

      const recentMean = recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length;

      // Adaptive update with smoothing factor
      const smoothingFactor = 0.1; // 10% new data, 90% old baseline
      const newBaseline = (baselineMetric.baseline * (1 - smoothingFactor)) + (recentMean * smoothingFactor);

      baselineMetric.baseline = newBaseline;
      baselineMetric.updated = Date.now();
    }

    baseline.updated = Date.now();
    baseline.quality = this.calculateBaselineQuality(baseline.metrics, recentHistory.length);

    await this.saveBaselines();
  }

  private setupPeriodicBuilding(): void {
    // Rebuild baselines periodically to adapt to changing patterns
    setInterval(async () => {
      const activeBaselines = Array.from(this.baselines.values())
        .filter(b => b.status === 'active');

      for (const baseline of activeBaselines) {
        const hoursSinceUpdate = (Date.now() - baseline.updated) / (1000 * 60 * 60);

        if (hoursSinceUpdate > 24) { // Rebuild daily
          try {
            await this.buildBaseline(baseline.id);
          } catch (error) {
            console.error(`Failed to rebuild baseline ${baseline.id}:`, error);
          }
        }
      }
    }, 60 * 60 * 1000); // Check every hour
  }

  private generateBaselineId(): string {
    return `baseline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async saveBaselines(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      const filePath = join(this.storagePath, 'baselines.json');
      const data = JSON.stringify(Array.from(this.baselines.values()), null, 2);
      await fs.writeFile(filePath, data, 'utf-8');
    } catch (error) {
      console.error('Error saving baselines:', error);
    }
  }

  private async loadBaselines(): Promise<void> {
    try {
      const filePath = join(this.storagePath, 'baselines.json');
      const data = await fs.readFile(filePath, 'utf-8');
      const baselines: PerformanceBaseline[] = JSON.parse(data);

      for (const baseline of baselines) {
        this.baselines.set(baseline.id, baseline);
      }

      console.log(`Loaded ${baselines.length} baselines`);
    } catch (error) {
      console.log('No existing baselines found, starting fresh');
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    // Cancel any ongoing baseline building
    for (const [id, timer] of this.buildingBaselines.entries()) {
      clearTimeout(timer);
    }
    this.buildingBaselines.clear();

    // Save current baselines
    await this.saveBaselines();
    this.removeAllListeners();
  }
}

// Singleton instance
export const baselineManager = new BaselineManager();