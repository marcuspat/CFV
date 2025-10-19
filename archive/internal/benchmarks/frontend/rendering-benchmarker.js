import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FrontendRenderingBenchmark {
  constructor() {
    this.results = [];
    this.testScenarios = this.generateTestScenarios();
  }

  generateTestScenarios() {
    return [
      {
        name: 'Simple Graph (50 nodes)',
        nodeCount: 50,
        edgeCount: 75,
        targetFPS: 240,
        complexity: 'low'
      },
      {
        name: 'Medium Graph (200 nodes)',
        nodeCount: 200,
        edgeCount: 350,
        targetFPS: 120,
        complexity: 'medium'
      },
      {
        name: 'Complex Graph (500 nodes)',
        nodeCount: 500,
        edgeCount: 900,
        targetFPS: 60,
        complexity: 'high'
      },
      {
        name: 'Ultra Complex Graph (1000 nodes)',
        nodeCount: 1000,
        edgeCount: 1800,
        targetFPS: 30,
        complexity: 'extreme'
      }
    ];
  }

  generateGraphData(nodeCount, edgeCount) {
    const nodes = [];
    const edges = [];

    // Generate nodes with random positions and cognitive types
    const cognitiveTypes = ['factual', 'logical', 'creative', 'meta-cognitive'];

    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        id: i,
        x: Math.random() * 800,
        y: Math.random() * 600,
        type: cognitiveTypes[Math.floor(Math.random() * cognitiveTypes.length)],
        confidence: Math.random(),
        size: 3 + Math.random() * 7
      });
    }

    // Generate edges
    for (let i = 0; i < edgeCount; i++) {
      const source = Math.floor(Math.random() * nodeCount);
      const target = Math.floor(Math.random() * nodeCount);

      if (source !== target) {
        edges.push({
          source,
          target,
          weight: Math.random(),
          type: 'causal'
        });
      }
    }

    return { nodes, edges };
  }

  simulateRenderingLoop(graphData, durationMs = 5000) {
    return new Promise((resolve) => {
      const startTime = performance.now();
      let frameCount = 0;
      let lastFrameTime = startTime;
      const frameTimes = [];

      const renderFrame = () => {
        const currentTime = performance.now();
        const frameTime = currentTime - lastFrameTime;

        frameTimes.push(frameTime);
        frameCount++;
        lastFrameTime = currentTime;

        // Simulate rendering work based on graph complexity
        const complexity = graphData.nodes.length * 0.01 + graphData.edges.length * 0.005;
        const renderTime = Math.min(complexity * 2, 16); // Cap at 16ms for 60fps

        const renderStart = performance.now();
        while (performance.now() - renderStart < renderTime) {
          // Simulate rendering calculations
          Math.random() * Math.random();
        }

        if (currentTime - startTime < durationMs) {
          setImmediate(renderFrame);
        } else {
          resolve({
            frameCount,
            duration: currentTime - startTime,
            frameTimes,
            averageFPS: frameCount / ((currentTime - startTime) / 1000)
          });
        }
      };

      renderFrame();
    });
  }

  async runRenderingBenchmark(scenario) {
    console.log(`Testing rendering: ${scenario.name}`);

    const graphData = this.generateGraphData(scenario.nodeCount, scenario.edgeCount);

    // Warm up
    await this.simulateRenderingLoop(graphData, 1000);

    // Actual benchmark
    const startTime = performance.now();
    const renderResult = await this.simulateRenderingLoop(graphData, 10000);
    const endTime = performance.now();

    const totalTime = endTime - startTime;

    // Calculate performance metrics
    const fps = renderResult.averageFPS;
    const frameTimeStats = this.calculateFrameTimeStats(renderResult.frameTimes);

    const result = {
      scenario: scenario.name,
      nodeCount: scenario.nodeCount,
      edgeCount: scenario.edgeCount,
      targetFPS: scenario.targetFPS,
      performance: {
        actualFPS: fps,
        targetMet: fps >= scenario.targetFPS,
        frameTimeStats,
        renderTime: totalTime,
        totalFrames: renderResult.frameCount
      },
      complexity: scenario.complexity,
      nodesPerSecond: (scenario.nodeCount * renderResult.frameCount) / (totalTime / 1000),
      edgesPerSecond: (scenario.edgeCount * renderResult.frameCount) / (totalTime / 1000)
    };

    this.results.push(result);

    console.log(`✅ ${scenario.name}: ${fps.toFixed(1)} FPS (Target: ${scenario.targetFPS}) - ${result.performance.targetMet ? 'PASS' : 'FAIL'}`);
    console.log(`   Frame time: ${frameTimeStats.average.toFixed(2)}ms avg, ${frameTimeStats.p95.toFixed(2)}ms p95`);

    return result;
  }

  calculateFrameTimeStats(frameTimes) {
    const sorted = frameTimes.sort((a, b) => a - b);
    const sum = frameTimes.reduce((acc, time) => acc + time, 0);

    return {
      average: sum / frameTimes.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  async runWebGLBenchmark() {
    console.log('Running WebGL Performance Benchmarks...');

    const webglTests = [
      {
        name: 'WebGL Context Creation',
        test: async () => {
          const startTime = performance.now();

          // Simulate WebGL context creation
          await this.simulateStep(50, 'WebGL context initialization');

          return performance.now() - startTime;
        }
      },
      {
        name: 'Shader Compilation',
        test: async () => {
          const startTime = performance.now();

          // Simulate shader compilation
          await this.simulateStep(200, 'Vertex and fragment shader compilation');

          return performance.now() - startTime;
        }
      },
      {
        name: 'Buffer Transfer',
        test: async () => {
          const startTime = performance.now();

          // Simulate buffer data transfer
          await this.simulateStep(30, 'GPU buffer upload');

          return performance.now() - startTime;
        }
      }
    ];

    for (const test of webglTests) {
      try {
        const result = await test.test();
        console.log(`✅ ${test.name}: ${result.toFixed(2)}ms`);

        this.results.push({
          scenario: test.name,
          performance: {
            actualTime: result,
            targetMet: result < 100, // 100ms target for WebGL operations
            renderTime: result
          },
          type: 'webgl'
        });
      } catch (error) {
        console.error(`❌ ${test.name} failed:`, error.message);
      }
    }
  }

  simulateStep(duration, description) {
    return new Promise(resolve => {
      const start = performance.now();
      while (performance.now() - start < duration) {
        Math.random() * Math.random();
      }
      resolve();
    });
  }

  async runAllBenchmarks() {
    console.log('Starting Frontend Rendering Performance Benchmarks...');

    // Run rendering benchmarks
    for (const scenario of this.testScenarios) {
      await this.runRenderingBenchmark(scenario);
    }

    // Run WebGL benchmarks
    await this.runWebGLBenchmark();
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(),
      detailed: this.results
    };

    const reportPath = path.join(__dirname, '../reports/frontend-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`Frontend Performance report saved to: ${reportPath}`);
    return report;
  }

  generateSummary() {
    const renderingResults = this.results.filter(r => r.nodeCount !== undefined);
    const webglResults = this.results.filter(r => r.type === 'webgl');

    if (renderingResults.length === 0 && webglResults.length === 0) return {};

    const summary = {
      rendering: {
        totalTests: renderingResults.length,
        targetsMet: 0,
        targetsMissed: 0,
        averageFPS: 0,
        peakFPS: 0,
        averageFrameTime: 0
      },
      webgl: {
        totalTests: webglResults.length,
        averageOperationTime: 0,
        targetsMet: 0
      }
    };

    if (renderingResults.length > 0) {
      summary.rendering.targetsMet = renderingResults.filter(r => r.performance.targetMet).length;
      summary.rendering.targetsMissed = renderingResults.filter(r => !r.performance.targetMet).length;
      summary.rendering.averageFPS = renderingResults.reduce((sum, r) => sum + r.performance.actualFPS, 0) / renderingResults.length;
      summary.rendering.peakFPS = Math.max(...renderingResults.map(r => r.performance.actualFPS));
      summary.rendering.averageFrameTime = renderingResults.reduce((sum, r) => sum + r.performance.frameTimeStats.average, 0) / renderingResults.length;
    }

    if (webglResults.length > 0) {
      summary.webgl.averageOperationTime = webglResults.reduce((sum, r) => sum + r.performance.actualTime, 0) / webglResults.length;
      summary.webgl.targetsMet = webglResults.filter(r => r.performance.targetMet).length;
    }

    return summary;
  }
}

export default FrontendRenderingBenchmark;