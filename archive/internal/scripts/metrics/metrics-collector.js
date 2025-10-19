/**
 * Metrics Collection System for Cognitive Fabric Visualizer Demo
 *
 * Collects, analyzes, and reports performance metrics throughout demo execution.
 */

import { performance } from 'perf_hooks';
import { cpus, totalmem, freemem } from 'os';

export class MetricsCollector {
  constructor() {
    this.demoStartTime = null;
    this.demoEndTime = null;
    this.phases = new Map();
    this.checkpoints = [];
    this.performanceData = {
      memory: [],
      cpu: [],
      network: [],
      api: [],
      processing: []
    };
    this.errors = [];
    this.warnings = [];

    // Start baseline monitoring
    this.startSystemMonitoring();
  }

  startDemo() {
    this.demoStartTime = performance.now();
    this.checkpoints.push({
      type: 'demo_start',
      timestamp: performance.now(),
      memory: this.getCurrentMemoryUsage(),
      cpu: this.getCurrentCpuUsage()
    });

    console.log('📊 Metrics collection started');
  }

  endDemo() {
    this.demoEndTime = performance.now();
    const totalDuration = this.demoEndTime - this.demoStartTime;

    this.checkpoints.push({
      type: 'demo_end',
      timestamp: performance.now(),
      memory: this.getCurrentMemoryUsage(),
      cpu: this.getCurrentCpuUsage()
    });

    console.log(`📊 Metrics collection completed (${Math.round(totalDuration)}ms total)`);
    return totalDuration;
  }

  startPhase(phaseName) {
    const phaseId = `phase_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();

    const phase = {
      id: phaseId,
      name: phaseName,
      startTime,
      startMemory: this.getCurrentMemoryUsage(),
      startCpu: this.getCurrentCpuUsage(),
      checkpoints: []
    };

    this.phases.set(phaseId, phase);

    console.log(`📈 Started tracking phase: ${phaseName}`);
    return phaseId;
  }

  endPhase(phaseId, result = {}) {
    const phase = this.phases.get(phaseId);
    if (!phase) {
      console.warn(`Phase not found: ${phaseId}`);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - phase.startTime;

    phase.endTime = endTime;
    phase.duration = duration;
    phase.endMemory = this.getCurrentMemoryUsage();
    phase.endCpu = this.getCurrentCpuUsage();
    phase.result = result;

    // Calculate phase-specific metrics
    phase.metrics = {
      duration,
      memoryDelta: phase.endMemory.heapUsed - phase.startMemory.heapUsed,
      cpuDelta: phase.endCpu - phase.startCpu,
      success: result.success || false,
      error: result.error || null
    };

    console.log(`📈 Completed phase: ${phase.name} (${Math.round(duration)}ms) - ${phase.metrics.success ? 'SUCCESS' : 'FAILED'}`);
    return phase;
  }

  recordApiCall(endpoint, method, startTime, endTime, statusCode, error = null) {
    const duration = endTime - startTime;
    const apiCall = {
      timestamp: startTime,
      endpoint,
      method,
      duration,
      statusCode,
      success: statusCode < 400 && !error,
      error: error?.message || null
    };

    this.performanceData.api.push(apiCall);

    if (apiCall.error) {
      this.errors.push({
        type: 'api_error',
        timestamp: startTime,
        endpoint,
        method,
        error: apiCall.error
      });
    }

    return apiCall;
  }

  recordProcessingStep(stepName, startTime, endTime, inputSize, outputSize, metadata = {}) {
    const duration = endTime - startTime;
    const throughput = inputSize / (duration / 1000); // items per second

    const processingStep = {
      timestamp: startTime,
      stepName,
      duration,
      inputSize,
      outputSize,
      throughput,
      efficiency: outputSize / inputSize,
      metadata
    };

    this.performanceData.processing.push(processingStep);

    // Check performance thresholds
    if (duration > 5000) { // 5 second threshold
      this.warnings.push({
        type: 'slow_processing',
        timestamp: startTime,
        stepName,
        duration,
        threshold: 5000
      });
    }

    return processingStep;
  }

  recordCognitiveMetrics(conversationId, cognitiveAnalysis, processingTime) {
    const cognitiveMetrics = {
      timestamp: performance.now(),
      conversationId,
      processingTime,
      scores: {
        factual: cognitiveAnalysis.factualScore,
        logical: cognitiveAnalysis.logicalScore,
        creative: cognitiveAnalysis.creativeScore,
        metacognitive: cognitiveAnalysis.metacognitiveScore
      },
      overall: Object.values(cognitiveAnalysis)
        .filter(value => typeof value === 'number')
        .reduce((sum, score) => sum + score, 0) / 4
    };

    // Check if scores meet targets
    const targets = {
      factual: 0.92,
      logical: 0.85,
      creative: 0.60,
      metacognitive: 0.96
    };

    for (const [dimension, score] of Object.entries(cognitiveMetrics.scores)) {
      if (score < targets[dimension]) {
        this.warnings.push({
          type: 'low_cognitive_score',
          timestamp: cognitiveMetrics.timestamp,
          conversationId,
          dimension,
          score,
          target: targets[dimension]
        });
      }
    }

    return cognitiveMetrics;
  }

  recordVisualizationMetrics(conversationId, visualizationId, renderTime, nodeCount, edgeCount, frameRate = null) {
    const vizMetrics = {
      timestamp: performance.now(),
      conversationId,
      visualizationId,
      renderTime,
      nodeCount,
      edgeCount,
      frameRate,
      complexity: nodeCount + edgeCount,
      renderEfficiency: (nodeCount + edgeCount) / renderTime // nodes per ms
    };

    // Check rendering performance
    if (renderTime > 1000) { // 1 second threshold
      this.warnings.push({
        type: 'slow_rendering',
        timestamp: vizMetrics.timestamp,
        conversationId,
        renderTime,
        threshold: 1000
      });
    }

    if (frameRate && frameRate < 120) { // 120 FPS target
      this.warnings.push({
        type: 'low_frame_rate',
        timestamp: vizMetrics.timestamp,
        conversationId,
        frameRate,
        threshold: 120
      });
    }

    return vizMetrics;
  }

  getCurrentMemoryUsage() {
    const memUsage = process.memoryUsage();
    const totalMem = totalmem();
    const freeMem = freemem();

    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      systemTotal: totalMem,
      systemFree: freeMem,
      systemUsed: totalMem - freeMem
    };
  }

  getCurrentCpuUsage() {
    // Simple CPU usage estimation
    const cpus_info = cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus_info.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    return {
      totalTick,
      totalIdle,
      usage: 100 - (totalIdle / totalTick * 100),
      cores: cpus_info.length
    };
  }

  startSystemMonitoring() {
    // Monitor system metrics every 500ms
    this.monitoringInterval = setInterval(() => {
      this.performanceData.memory.push({
        timestamp: performance.now(),
        ...this.getCurrentMemoryUsage()
      });

      this.performanceData.cpu.push({
        timestamp: performance.now(),
        ...this.getCurrentCpuUsage()
      });
    }, 500);
  }

  stopSystemMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  getSummary() {
    const totalDuration = this.demoEndTime ? this.demoEndTime - this.demoStartTime : 0;

    // Calculate performance summaries
    const apiCalls = this.performanceData.api;
    const processingSteps = this.performanceData.processing;

    return {
      totalDuration,
      phases: this.getPhaseSummary(),
      performance: {
        api: this.getApiSummary(),
        processing: this.getProcessingSummary(),
        memory: this.getMemorySummary(),
        cpu: this.getCpuSummary()
      },
      quality: {
        errors: this.errors.length,
        warnings: this.warnings.length,
        successRate: this.calculateSuccessRate()
      },
      checkpoints: this.checkpoints.length
    };
  }

  getPhaseSummary() {
    const phases = Array.from(this.phases.values());
    const completedPhases = phases.filter(p => p.endTime);

    return {
      total: phases.length,
      completed: completedPhases.length,
      totalDuration: completedPhases.reduce((sum, p) => sum + (p.duration || 0), 0),
      averageDuration: completedPhases.length > 0 ?
        completedPhases.reduce((sum, p) => sum + (p.duration || 0), 0) / completedPhases.length : 0,
      successRate: completedPhases.filter(p => p.metrics?.success).length / completedPhases.length,
      phases: completedPhases.map(p => ({
        name: p.name,
        duration: p.duration,
        success: p.metrics?.success || false,
        memoryDelta: p.metrics?.memoryDelta || 0
      }))
    };
  }

  getApiSummary() {
    const apiCalls = this.performanceData.api;

    if (apiCalls.length === 0) {
      return {
        totalCalls: 0,
        successRate: 0,
        averageResponseTime: 0,
        errors: 0
      };
    }

    const successfulCalls = apiCalls.filter(call => call.success);
    const totalResponseTime = apiCalls.reduce((sum, call) => sum + call.duration, 0);

    return {
      totalCalls: apiCalls.length,
      successfulCalls: successfulCalls.length,
      successRate: successfulCalls.length / apiCalls.length,
      averageResponseTime: totalResponseTime / apiCalls.length,
      maxResponseTime: Math.max(...apiCalls.map(call => call.duration)),
      minResponseTime: Math.min(...apiCalls.map(call => call.duration)),
      errors: apiCalls.length - successfulCalls.length,
      endpoints: this.getEndpointSummary()
    };
  }

  getEndpointSummary() {
    const endpointStats = {};

    this.performanceData.api.forEach(call => {
      if (!endpointStats[call.endpoint]) {
        endpointStats[call.endpoint] = {
          calls: 0,
          successRate: 0,
          averageResponseTime: 0,
          totalTime: 0,
          errors: 0
        };
      }

      const stats = endpointStats[call.endpoint];
      stats.calls++;
      stats.totalTime += call.duration;
      if (call.success) {
        stats.successRate++;
      } else {
        stats.errors++;
      }
    });

    // Calculate averages
    Object.values(endpointStats).forEach(stats => {
      stats.averageResponseTime = stats.totalTime / stats.calls;
      stats.successRate = stats.successRate / stats.calls;
    });

    return endpointStats;
  }

  getProcessingSummary() {
    const steps = this.performanceData.processing;

    if (steps.length === 0) {
      return {
        totalSteps: 0,
        averageDuration: 0,
        totalThroughput: 0,
        averageEfficiency: 0
      };
    }

    return {
      totalSteps: steps.length,
      averageDuration: steps.reduce((sum, step) => sum + step.duration, 0) / steps.length,
      totalThroughput: steps.reduce((sum, step) => sum + step.throughput, 0),
      averageThroughput: steps.reduce((sum, step) => sum + step.throughput, 0) / steps.length,
      averageEfficiency: steps.reduce((sum, step) => sum + step.efficiency, 0) / steps.length
    };
  }

  getMemorySummary() {
    const memoryData = this.performanceData.memory;

    if (memoryData.length === 0) {
      return {
        peakUsage: 0,
        averageUsage: 0,
        memoryGrowth: 0
      };
    }

    const heapUsages = memoryData.map(m => m.heapUsed);
    const peakUsage = Math.max(...heapUsages);
    const averageUsage = heapUsages.reduce((sum, usage) => sum + usage, 0) / heapUsages.length;
    const memoryGrowth = heapUsages[heapUsages.length - 1] - heapUsages[0];

    return {
      peakUsage,
      averageUsage,
      memoryGrowth,
      peakFormatted: this.formatBytes(peakUsage),
      averageFormatted: this.formatBytes(averageUsage),
      growthFormatted: this.formatBytes(Math.abs(memoryGrowth)),
      systemUsage: {
        total: this.formatBytes(memoryData[0]?.systemTotal || 0),
        peakPercentage: (peakUsage / (memoryData[0]?.systemTotal || 1)) * 100
      }
    };
  }

  getCpuSummary() {
    const cpuData = this.performanceData.cpu;

    if (cpuData.length === 0) {
      return {
        averageUsage: 0,
        peakUsage: 0,
        cores: 0
      };
    }

    const usages = cpuData.map(c => c.usage || 0);
    const averageUsage = usages.reduce((sum, usage) => sum + usage, 0) / usages.length;
    const peakUsage = Math.max(...usages);

    return {
      averageUsage,
      peakUsage,
      cores: cpuData[0]?.cores || 0,
      totalCores: cpuData[0]?.cores || 0
    };
  }

  calculateSuccessRate() {
    const phases = Array.from(this.phases.values()).filter(p => p.endTime);
    if (phases.length === 0) return 0;

    return phases.filter(p => p.metrics?.success).length / phases.length;
  }

  formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  printSummary() {
    const summary = this.getSummary();

    console.log('\n📊 Performance Metrics Summary');
    console.log('='.repeat(50));
    console.log(`Total Demo Duration: ${Math.round(summary.totalDuration / 1000)}s`);
    console.log(`Phases Completed: ${summary.phases.completed}/${summary.phases.total}`);
    console.log(`API Calls: ${summary.performance.api.totalCalls} (${Math.round(summary.performance.api.successRate * 100)}% success)`);
    console.log(`Average API Response Time: ${Math.round(summary.performance.api.averageResponseTime)}ms`);
    console.log(`Memory Usage: ${summary.performance.memory.peakFormatted} (peak)`);
    console.log(`CPU Usage: ${Math.round(summary.performance.cpu.averageUsage)}% (average)`);
    console.log(`Errors: ${summary.quality.errors}`);
    console.log(`Warnings: ${summary.quality.warnings}`);
    console.log(`Overall Success Rate: ${Math.round(summary.quality.successRate * 100)}%`);
    console.log('='.repeat(50));
  }

  exportMetrics() {
    return {
      summary: this.getSummary(),
      raw: {
        phases: Array.from(this.phases.values()),
        performanceData: this.performanceData,
        checkpoints: this.checkpoints,
        errors: this.errors,
        warnings: this.warnings
      },
      timestamp: new Date().toISOString()
    };
  }

  cleanup() {
    this.stopSystemMonitoring();
    this.phases.clear();
    this.performanceData = {
      memory: [],
      cpu: [],
      network: [],
      api: [],
      processing: []
    };
    this.errors = [];
    this.warnings = [];
  }
}

export default MetricsCollector;