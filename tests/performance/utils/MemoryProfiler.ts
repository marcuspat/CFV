/**
 * Advanced memory profiling and leak detection for Node.js applications
 */

import * as v8 from 'v8';
import { performance } from 'perf_hooks';
import { writeFileSync } from 'fs';
import { join } from 'path';

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  heapSizeLimit: number;
  numberOfNativeContexts: number;
  numberOfDetachedContexts: number;
}

export interface HeapAnalysis {
  totalSize: number;
  numberOfObjects: number;
  numberOfClasses: number;
  classDetails: HeapClassDetails[];
  retainedSize: number;
  dominators: HeapDominator[];
}

export interface HeapClassDetails {
  name: string;
  count: number;
  size: number;
  retainedSize: number;
  averageSize: number;
}

export interface HeapDominator {
  name: string;
  retainedSize: number;
  percentage: number;
  path: string[];
}

export interface MemoryLeakDetection {
  potentialLeaks: MemoryLeak[];
  growthPatterns: GrowthPattern[];
  recommendations: string[];
}

export interface MemoryLeak {
  objectName: string;
  growthRate: number;
  currentCount: number;
  retainedSize: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface GrowthPattern {
  objectType: string;
  samples: { timestamp: number; count: number; size: number }[];
  trend: 'increasing' | 'decreasing' | 'stable';
  growthRate: number;
  correlation: number;
}

export class MemoryProfiler {
  private snapshots: MemorySnapshot[] = [];
  private heapSnapshots: any[] = [];
  private baselineSnapshot?: MemorySnapshot;
  private isProfiling = false;
  private profilingInterval?: NodeJS.Timeout;
  private objectCounts: Map<string, number[]> = new Map();
  private lastGCStats?: any;

  constructor(private samplingInterval = 1000) {
    this.setupGCListeners();
  }

  startProfiling(): void {
    if (this.isProfiling) {
      return;
    }

    console.log('Starting memory profiling...');
    this.isProfiling = true;
    this.snapshots = [];
    this.heapSnapshots = [];
    this.objectCounts.clear();

    // Take initial baseline snapshot
    this.baselineSnapshot = this.takeMemorySnapshot();

    // Start periodic sampling
    this.profilingInterval = setInterval(() => {
      this.collectSnapshot();
    }, this.samplingInterval);

    // Take initial heap snapshot
    this.takeHeapSnapshot('initial');
  }

  stopProfiling(): MemoryAnalysis {
    if (!this.isProfiling) {
      throw new Error('Profiling is not active');
    }

    console.log('Stopping memory profiling...');
    this.isProfiling = false;

    if (this.profilingInterval) {
      clearInterval(this.profilingInterval);
      this.profilingInterval = undefined;
    }

    // Take final heap snapshot
    this.takeHeapSnapshot('final');

    // Generate analysis
    const analysis = this.generateMemoryAnalysis();

    console.log('Memory profiling stopped');
    return analysis;
  }

  private setupGCListeners(): void {
    // Listen for garbage collection events
    if (global.gc) {
      const originalGC = global.gc;
      global.gc = () => {
        const start = performance.now();
        originalGC();
        const duration = performance.now() - start;
        console.log(`Manual GC completed in ${duration.toFixed(2)}ms`);
        this.lastGCStats = { timestamp: Date.now(), duration };
      };
    }

    // Track GC performance (Node.js v14+)
    if (v8.getHeapStatistics) {
      const originalStats = v8.getHeapStatistics();
      console.log('Initial heap statistics:', this.formatHeapStats(originalStats));
    }
  }

  private collectSnapshot(): void {
    const snapshot = this.takeMemorySnapshot();
    this.snapshots.push(snapshot);

    // Analyze object growth
    this.analyzeObjectGrowth(snapshot);

    // Check for potential memory leaks
    this.detectMemoryLeaks(snapshot);

    // Keep only last 300 snapshots (5 minutes at 1-second intervals)
    if (this.snapshots.length > 300) {
      this.snapshots.shift();
    }
  }

  private takeMemorySnapshot(): MemorySnapshot {
    const usage = process.memoryUsage();
    const stats = v8.getHeapStatistics();

    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      arrayBuffers: usage.arrayBuffers,
      heapSizeLimit: stats.heap_size_limit,
      numberOfNativeContexts: stats.number_of_native_contexts,
      numberOfDetachedContexts: stats.number_of_detached_contexts
    };

    return snapshot;
  }

  private analyzeObjectGrowth(snapshot: MemorySnapshot): void {
    // Get object count by type (simplified version)
    // In a real implementation, you'd use heap snapshots for detailed analysis
    const objectTypes = ['Object', 'Array', 'String', 'Function', 'RegExp', 'Date'];

    objectTypes.forEach(type => {
      if (!this.objectCounts.has(type)) {
        this.objectCounts.set(type, []);
      }

      // Estimate object count based on heap usage (this is a simplification)
      const estimatedCount = Math.floor(snapshot.heapUsed / 100); // Rough estimate
      const counts = this.objectCounts.get(type)!;
      counts.push(estimatedCount);

      // Keep only last 60 samples
      if (counts.length > 60) {
        counts.shift();
      }
    });
  }

  private detectMemoryLeaks(snapshot: MemorySnapshot): void {
    if (!this.baselineSnapshot || this.snapshots.length < 30) {
      return; // Need at least 30 samples for detection
    }

    const recentSnapshots = this.snapshots.slice(-30);
    const growthRate = this.calculateGrowthRate(recentSnapshots);

    // Check for significant memory growth
    const memoryGrowth = snapshot.heapUsed - this.baselineSnapshot.heapUsed;
    const growthPercentage = (memoryGrowth / this.baselineSnapshot.heapUsed) * 100;

    if (growthPercentage > 50 && growthRate > 1024 * 1024) { // 1MB/s growth rate
      console.warn(`⚠️  Potential memory leak detected: ${growthPercentage.toFixed(1)}% growth, ${this.formatBytes(growthRate)}/s`);
    }
  }

  private calculateGrowthRate(snapshots: MemorySnapshot[]): number {
    if (snapshots.length < 2) {
      return 0;
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const timeDiff = last.timestamp - first.timestamp;
    const memoryDiff = last.heapUsed - first.heapUsed;

    return timeDiff > 0 ? (memoryDiff / timeDiff) * 1000 : 0; // bytes per second
  }

  private takeHeapSnapshot(name: string): void {
    try {
      const snapshot = v8.getHeapSnapshot();
      this.heapSnapshots.push({
        name,
        timestamp: Date.now(),
        snapshot
      });
      console.log(`Heap snapshot '${name}' taken`);
    } catch (error) {
      console.error('Failed to take heap snapshot:', error);
    }
  }

  private generateMemoryAnalysis(): MemoryAnalysis {
    const memoryTrend = this.analyzeMemoryTrend();
    const leakDetection = this.detectMemoryLeaksDetailed();
    const heapAnalysis = this.analyzeHeapUsage();
    const gcAnalysis = this.analyzeGCPerformance();

    return {
      summary: {
        totalSnapshots: this.snapshots.length,
        profilingDuration: this.snapshots.length > 1 ?
          this.snapshots[this.snapshots.length - 1].timestamp - this.snapshots[0].timestamp : 0,
        baselineMemory: this.baselineSnapshot?.heapUsed || 0,
        currentMemory: this.snapshots.length > 0 ?
          this.snapshots[this.snapshots.length - 1].heapUsed : 0,
        memoryGrowth: this.calculateTotalMemoryGrowth(),
        averageMemoryUsage: this.calculateAverageMemoryUsage(),
        peakMemoryUsage: this.calculatePeakMemoryUsage()
      },
      trend: memoryTrend,
      leaks: leakDetection,
      heap: heapAnalysis,
      gc: gcAnalysis,
      recommendations: this.generateRecommendations(leakDetection, memoryTrend, heapAnalysis)
    };
  }

  private analyzeMemoryTrend(): any {
    if (this.snapshots.length < 10) {
      return { trend: 'insufficient_data' };
    }

    const memoryUsages = this.snapshots.map(s => s.heapUsed);
    const timestamps = this.snapshots.map(s => s.timestamp);

    // Calculate linear regression
    const n = memoryUsages.length;
    const sumX = timestamps.reduce((a, b) => a + b, 0);
    const sumY = memoryUsages.reduce((a, b) => a + b, 0);
    const sumXY = timestamps.reduce((sum, x, i) => sum + x * memoryUsages[i], 0);
    const sumXX = timestamps.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate correlation coefficient
    const meanX = sumX / n;
    const meanY = sumY / n;
    const numerator = timestamps.reduce((sum, x, i) => sum + (x - meanX) * (memoryUsages[i] - meanY), 0);
    const denominatorX = Math.sqrt(timestamps.reduce((sum, x) => sum + Math.pow(x - meanX, 2), 0));
    const denominatorY = Math.sqrt(memoryUsages.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0));
    const correlation = numerator / (denominatorX * denominatorY);

    let trend: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(slope) < 1000) { // Less than 1KB/s
      trend = 'stable';
    } else if (slope > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }

    return {
      trend,
      slope, // bytes per millisecond
      correlation,
      strength: Math.abs(correlation),
      duration: timestamps[timestamps.length - 1] - timestamps[0],
      startMemory: memoryUsages[0],
      endMemory: memoryUsages[memoryUsages.length - 1],
      peakMemory: Math.max(...memoryUsages),
      minMemory: Math.min(...memoryUsages)
    };
  }

  private detectMemoryLeaksDetailed(): MemoryLeakDetection {
    const leaks: MemoryLeak[] = [];
    const growthPatterns: GrowthPattern[] = [];

    // Analyze object count growth patterns
    for (const [objectType, counts] of this.objectCounts.entries()) {
      if (counts.length < 10) continue;

      const pattern = this.analyzeGrowthPattern(objectType, counts);
      growthPatterns.push(pattern);

      if (pattern.trend === 'increasing' && pattern.growthRate > 0.1) {
        const severity = this.calculateLeakSeverity(pattern.growthRate);
        leaks.push({
          objectName: objectType,
          growthRate: pattern.growthRate,
          currentCount: counts[counts.length - 1],
          retainedSize: pattern.samples[pattern.samples.length - 1]?.size || 0,
          severity,
          description: `${objectType} objects are growing at ${pattern.growthRate.toFixed(2)} objects per second`
        });
      }
    }

    // Check for detached contexts (potential memory leaks)
    if (this.snapshots.length > 0) {
      const latestSnapshot = this.snapshots[this.snapshots.length - 1];
      if (latestSnapshot.numberOfDetachedContexts > 0) {
        leaks.push({
          objectName: 'Detached Contexts',
          growthRate: latestSnapshot.numberOfDetachedContexts,
          currentCount: latestSnapshot.numberOfDetachedContexts,
          retainedSize: 0,
          severity: 'high',
          description: `${latestSnapshot.numberOfDetachedContexts} detached DOM contexts detected`
        });
      }
    }

    return {
      potentialLeaks: leaks,
      growthPatterns,
      recommendations: this.generateLeakRecommendations(leaks)
    };
  }

  private analyzeGrowthPattern(objectType: string, counts: number[]): GrowthPattern {
    const n = counts.length;
    const growthRate = (counts[n - 1] - counts[0]) / (n * this.samplingInterval / 1000);

    let trend: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(growthRate) < 0.01) {
      trend = 'stable';
    } else if (growthRate > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }

    // Calculate correlation (simplified)
    const correlation = this.calculateSimpleCorrelation(counts);

    const samples = counts.map((count, i) => ({
      timestamp: Date.now() - (n - i) * this.samplingInterval,
      count,
      size: count * 100 // Estimated size
    }));

    return {
      objectType,
      samples,
      trend,
      growthRate,
      correlation
    };
  }

  private calculateSimpleCorrelation(values: number[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    const meanIndex = indices.reduce((a, b) => a + b, 0) / n;
    const meanValue = values.reduce((a, b) => a + b, 0) / n;

    const numerator = indices.reduce((sum, index, i) => sum + (index - meanIndex) * (values[i] - meanValue), 0);
    const denominatorIndex = Math.sqrt(indices.reduce((sum, index) => sum + Math.pow(index - meanIndex, 2), 0));
    const denominatorValue = Math.sqrt(values.reduce((sum, value) => sum + Math.pow(value - meanValue, 2), 0));

    return denominatorIndex * denominatorValue > 0 ? numerator / (denominatorIndex * denominatorValue) : 0;
  }

  private calculateLeakSeverity(growthRate: number): 'low' | 'medium' | 'high' | 'critical' {
    if (growthRate < 0.1) return 'low';
    if (growthRate < 1) return 'medium';
    if (growthRate < 10) return 'high';
    return 'critical';
  }

  private analyzeHeapUsage(): any {
    if (this.snapshots.length === 0) {
      return null;
    }

    const latestSnapshot = this.snapshots[this.snapshots.length - 1];
    const stats = v8.getHeapStatistics();

    return {
      current: {
        heapUsed: latestSnapshot.heapUsed,
        heapTotal: latestSnapshot.heapTotal,
        external: latestSnapshot.external,
        rss: latestSnapshot.rss
      },
      utilization: {
        heapUtilization: (latestSnapshot.heapUsed / latestSnapshot.heapTotal) * 100,
        heapSizeUtilization: (latestSnapshot.heapTotal / latestSnapshot.heapSizeLimit) * 100,
        externalToHeapRatio: latestSnapshot.external / latestSnapshot.heapUsed
      },
      limits: {
        heapSizeLimit: latestSnapshot.heapSizeLimit,
        availableMemory: latestSnapshot.heapSizeLimit - latestSnapshot.heapTotal,
        availableHeap: latestSnapshot.heapTotal - latestSnapshot.heapUsed
      },
      statistics: {
        numberOfNativeContexts: latestSnapshot.numberOfNativeContexts,
        numberOfDetachedContexts: latestSnapshot.numberOfDetachedContexts,
        totalHeapSize: stats.total_heap_size,
        usedHeapSize: stats.used_heap_size,
        heapSizeLimit: stats.heap_size_limit
      }
    };
  }

  private analyzeGCPerformance(): any {
    if (!this.lastGCStats) {
      return { message: 'No GC data available' };
    }

    return {
      lastGC: this.lastGCStats,
      recommendation: this.lastGCStats.duration > 100 ?
        'GC pause is high, consider optimizing memory usage' :
        'GC performance is within acceptable limits'
    };
  }

  private calculateTotalMemoryGrowth(): number {
    if (!this.baselineSnapshot || this.snapshots.length === 0) {
      return 0;
    }

    const current = this.snapshots[this.snapshots.length - 1];
    return current.heapUsed - this.baselineSnapshot.heapUsed;
  }

  private calculateAverageMemoryUsage(): number {
    if (this.snapshots.length === 0) return 0;
    const total = this.snapshots.reduce((sum, s) => sum + s.heapUsed, 0);
    return total / this.snapshots.length;
  }

  private calculatePeakMemoryUsage(): number {
    if (this.snapshots.length === 0) return 0;
    return Math.max(...this.snapshots.map(s => s.heapUsed));
  }

  private generateLeakRecommendations(leaks: MemoryLeak[]): string[] {
    const recommendations: string[] = [];

    leaks.forEach(leak => {
      switch (leak.severity) {
        case 'critical':
          recommendations.push(`🚨 CRITICAL: ${leak.objectName} leak detected - immediate investigation required`);
          break;
        case 'high':
          recommendations.push(`⚠️  HIGH: ${leak.objectName} shows significant growth - optimize object lifecycle`);
          break;
        case 'medium':
          recommendations.push(`📊 MEDIUM: ${leak.objectName} growth detected - monitor and consider optimization`);
          break;
        case 'low':
          recommendations.push(`ℹ️  LOW: ${leak.objectName} shows minor growth - keep monitoring`);
          break;
      }
    });

    return recommendations;
  }

  private generateRecommendations(leakDetection: MemoryLeakDetection, trend: any, heap: any): string[] {
    const recommendations: string[] = [];

    // Memory trend recommendations
    if (trend.trend === 'increasing' && trend.strength > 0.7) {
      recommendations.push('Strong memory growth trend detected - investigate for memory leaks');
    }

    // Heap utilization recommendations
    if (heap && heap.utilization.heapUtilization > 80) {
      recommendations.push('Heap utilization is high (>80%) - consider increasing heap size or optimizing memory usage');
    }

    // Leak-specific recommendations
    recommendations.push(...leakDetection.recommendations);

    // General recommendations
    if (this.lastGCStats && this.lastGCStats.duration > 100) {
      recommendations.push('GC pauses are high - reduce object allocation and improve object lifecycle management');
    }

    if (heap && heap.utilization.externalToHeapRatio > 0.5) {
      recommendations.push('High external memory usage - review native module usage and buffer management');
    }

    return recommendations;
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private formatHeapStats(stats: any): string {
    return `
Heap Statistics:
- Total Heap Size: ${this.formatBytes(stats.total_heap_size)}
- Used Heap Size: ${this.formatBytes(stats.used_heap_size)}
- Heap Size Limit: ${this.formatBytes(stats.heap_size_limit)}
- Malloced Memory: ${this.formatBytes(stats.malloced_memory)}
- Peak Malloced Memory: ${this.formatBytes(stats.peak_malloced_memory)}
- Native Contexts: ${stats.number_of_native_contexts}
- Detached Contexts: ${stats.number_of_detached_contexts}
    `.trim();
  }

  // Save profiling results to file
  async saveResults(outputDir: string): Promise<void> {
    const analysis = this.generateMemoryAnalysis();
    const resultsPath = join(outputDir, `memory-profile-${Date.now()}.json`);

    try {
      writeFileSync(resultsPath, JSON.stringify(analysis, null, 2));
      console.log(`Memory profiling results saved to: ${resultsPath}`);
    } catch (error) {
      console.error('Failed to save memory profiling results:', error);
    }
  }

  // Force garbage collection if available
  forceGC(): void {
    if (global.gc) {
      console.log('Forcing garbage collection...');
      global.gc();
    } else {
      console.warn('Garbage collection not available. Run with --expose-gc flag.');
    }
  }

  // Get current memory snapshot
  getCurrentSnapshot(): MemorySnapshot {
    return this.takeMemorySnapshot();
  }

  // Reset profiling state
  reset(): void {
    this.snapshots = [];
    this.heapSnapshots = [];
    this.objectCounts.clear();
    this.baselineSnapshot = undefined;
    this.lastGCStats = undefined;
  }
}

interface MemoryAnalysis {
  summary: {
    totalSnapshots: number;
    profilingDuration: number;
    baselineMemory: number;
    currentMemory: number;
    memoryGrowth: number;
    averageMemoryUsage: number;
    peakMemoryUsage: number;
  };
  trend: any;
  leaks: MemoryLeakDetection;
  heap: any;
  gc: any;
  recommendations: string[];
}

export default MemoryProfiler;