#!/usr/bin/env node

/**
 * Cognitive Fabric Visualizer - Comprehensive Demo Script
 *
 * This script provides end-to-end demonstration of the Cognitive Fabric Visualizer
 * with real data processing, performance metrics, and validation checkpoints.
 *
 * Usage: node scripts/demo.js [options]
 * Options:
 *   --config <path>    Configuration file path
 *   --output <path>    Output directory for reports
 *   --verbose          Enable verbose logging
 *   --conversations <num>  Number of conversations to process
 *   --skip-validation  Skip final validation step
 */

import { performance } from 'perf_hooks';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { program } from 'commander';

// Import demo components
import { checkSystemHealth } from './demo/health-check.js';
import { generateConversation, generateMultipleConversations } from './data/sample-generator.js';
import { MetricsCollector } from './metrics/metrics-collector.js';
import { DemoValidator } from './validation/demo-validator.js';
import { DemoLogger } from './utils/demo-logger.js';
import { DEMO_CONFIG } from './config/demo-config.js';

class CognitiveFabricDemo {
  constructor(options = {}) {
    this.options = {
      config: options.config || './scripts/config/demo-config.js',
      output: options.output || './scripts/reports',
      conversations: parseInt(options.conversations) || 3,
      verbose: options.verbose || false,
      skipValidation: options.skipValidation || false,
      ...options
    };

    this.logger = new DemoLogger({
      level: this.options.verbose ? 'debug' : 'info',
      file: join(this.options.output, 'demo.log')
    });

    this.metrics = new MetricsCollector();
    this.validator = new DemoValidator(DEMO_CONFIG);

    this.results = {
      startTime: null,
      endTime: null,
      duration: null,
      conversations: [],
      performance: {},
      validation: null,
      success: false,
      errors: []
    };
  }

  async run() {
    this.results.startTime = new Date().toISOString();
    this.metrics.startDemo();

    try {
      this.logger.info('🚀 Starting Cognitive Fabric Visualizer Demo');
      this.logger.info(`Configuration: ${JSON.stringify(this.options, null, 2)}`);

      // Phase 1: System Health Check
      await this.executePhase('System Health Check', this.checkSystemHealthPhase);

      // Phase 2: Sample Data Generation
      await this.executePhase('Sample Data Generation', this.generateDataPhase);

      // Phase 3: Conversation Processing
      await this.executePhase('Conversation Processing', this.processConversationsPhase);

      // Phase 4: Visualization Generation
      await this.executePhase('Visualization Generation', this.generateVisualizationsPhase);

      // Phase 5: Export Results
      await this.executePhase('Export Results', this.exportResultsPhase);

      // Phase 6: Validation (optional)
      if (!this.options.skipValidation) {
        await this.executePhase('Validation', this.validateResultsPhase);
      }

      this.results.success = true;
      this.logger.info('✅ Demo completed successfully');

    } catch (error) {
      this.results.success = false;
      this.results.errors.push(error.message);
      this.logger.error(`❌ Demo failed: ${error.message}`);
      throw error;
    } finally {
      this.results.endTime = new Date().toISOString();
      this.results.duration = this.metrics.endDemo();

      // Generate final report
      await this.generateFinalReport();
    }
  }

  async executePhase(phaseName, phaseFunction) {
    this.logger.info(`\n🔄 Starting Phase: ${phaseName}`);
    const phaseMetrics = this.metrics.startPhase(phaseName);

    try {
      const result = await phaseFunction.call(this);
      this.metrics.endPhase(phaseMetrics, { success: true, result });
      this.logger.info(`✅ Phase completed: ${phaseName}`);
      return result;
    } catch (error) {
      this.metrics.endPhase(phaseMetrics, { success: false, error: error.message });
      this.logger.error(`❌ Phase failed: ${phaseName} - ${error.message}`);
      throw error;
    }
  }

  async checkSystemHealthPhase() {
    this.logger.info('Performing system health checks...');

    const health = await checkSystemHealth();

    if (health.status !== 'healthy') {
      throw new Error(`System health check failed: ${health.status}. Components: ${JSON.stringify(health.components, null, 2)}`);
    }

    this.logger.info(`✅ All systems healthy. Server response time: ${health.performance?.serverResponse || 'N/A'}ms`);
    return health;
  }

  async generateDataPhase() {
    this.logger.info(`Generating ${this.options.conversations} sample conversations...`);

    const conversations = await generateMultipleConversations(
      this.options.conversations,
      {
        complexity: ['low', 'medium', 'high'],
        cognitiveDimensions: ['factual', 'logical', 'creative', 'metacognitive'],
        length: [10, 20, 30]
      }
    );

    this.logger.info(`Generated ${conversations.length} conversations`);

    // Log cognitive analysis summary
    const avgFactual = conversations.reduce((sum, conv) => sum + (conv.cognitiveAnalysis?.factualScore || 0), 0) / conversations.length;
    const avgLogical = conversations.reduce((sum, conv) => sum + (conv.cognitiveAnalysis?.logicalScore || 0), 0) / conversations.length;
    const avgCreative = conversations.reduce((sum, conv) => sum + (conv.cognitiveAnalysis?.creativeScore || 0), 0) / conversations.length;
    const avgMetacognitive = conversations.reduce((sum, conv) => sum + (conv.cognitiveAnalysis?.metacognitiveScore || 0), 0) / conversations.length;

    this.logger.info(`Cognitive Analysis Targets:`);
    this.logger.info(`  Factual: ${avgFactual.toFixed(3)} (target: ≥${DEMO_CONFIG.cognitiveTargets.factualAccuracy})`);
    this.logger.info(`  Logical: ${avgLogical.toFixed(3)} (target: ≥${DEMO_CONFIG.cognitiveTargets.logicalPrecision})`);
    this.logger.info(`  Creative: ${avgCreative.toFixed(3)} (target: ≥${DEMO_CONFIG.cognitiveTargets.creativeRougeL})`);
    this.logger.info(`  Metacognitive: ${avgMetacognitive.toFixed(3)} (target: ≥${DEMO_CONFIG.cognitiveTargets.metacognitiveF1})`);

    this.results.conversations = conversations;
    return conversations;
  }

  async processConversationsPhase() {
    this.logger.info('Processing conversations through cognitive analysis pipeline...');
    const axios = require('axios');

    const processedConversations = [];

    for (let i = 0; i < this.results.conversations.length; i++) {
      const conversation = this.results.conversations[i];
      this.logger.info(`Processing conversation ${i + 1}/${this.results.conversations.length}: ${conversation.id}`);

      const startTime = performance.now();

      try {
        // Submit conversation for analysis
        const response = await axios.post(
          `${DEMO_CONFIG.apiEndpoints.base}${DEMO_CONFIG.apiEndpoints.conversations}`,
          {
            conversation: conversation,
            analysisOptions: {
              includeCognitiveDecomposition: true,
              includeGraphGeneration: true,
              includeConfidenceScoring: true
            }
          },
          { timeout: 30000 }
        );

        const endTime = performance.now();
        const processingTime = Math.round(endTime - startTime);

        const processedConversation = {
          ...conversation,
          processingTime,
          apiResponse: response.data,
          status: 'processed'
        };

        processedConversations.push(processedConversation);

        this.logger.info(`  ✅ Processed in ${processingTime}ms (target: ≤${DEMO_CONFIG.performanceThresholds.maxProcessingTime}ms)`);

        // Check if processing time exceeds threshold
        if (processingTime > DEMO_CONFIG.performanceThresholds.maxProcessingTime) {
          this.logger.warn(`  ⚠️ Processing time exceeds threshold: ${processingTime}ms > ${DEMO_CONFIG.performanceThresholds.maxProcessingTime}ms`);
        }

      } catch (error) {
        this.logger.error(`  ❌ Failed to process conversation: ${error.message}`);

        const failedConversation = {
          ...conversation,
          processingTime: Math.round(performance.now() - startTime),
          error: error.message,
          status: 'failed'
        };

        processedConversations.push(failedConversation);
        this.results.errors.push(`Conversation ${conversation.id} failed: ${error.message}`);
      }
    }

    this.results.conversations = processedConversations;

    // Calculate processing metrics
    const avgProcessingTime = processedConversations
      .filter(conv => conv.status === 'processed')
      .reduce((sum, conv) => sum + conv.processingTime, 0) / processedConversations.length;

    this.logger.info(`Average processing time: ${avgProcessingTime.toFixed(0)}ms`);

    return processedConversations;
  }

  async generateVisualizationsPhase() {
    this.logger.info('Generating 3D cognitive visualizations...');
    const axios = require('axios');

    const visualizations = [];

    for (let i = 0; i < this.results.conversations.length; i++) {
      const conversation = this.results.conversations[i];

      if (conversation.status !== 'processed') {
        this.logger.warn(`Skipping visualization for failed conversation: ${conversation.id}`);
        continue;
      }

      this.logger.info(`Generating visualization for conversation ${i + 1}: ${conversation.id}`);

      const startTime = performance.now();

      try {
        const response = await axios.post(
          `${DEMO_CONFIG.apiEndpoints.base}${DEMO_CONFIG.apiEndpoints.visualizations}`,
          {
            conversationId: conversation.apiResponse?.conversationId || conversation.id,
            visualizationOptions: {
              type: '3d_cognitive_fabric',
              includeDimensions: ['factual', 'logical', 'creative', 'metacognitive'],
              rendering: {
                quality: 'high',
                animateTransitions: true,
                showConfidenceScores: true
              }
            }
          },
          { timeout: 15000 }
        );

        const endTime = performance.now();
        const renderTime = Math.round(endTime - startTime);

        const visualization = {
          conversationId: conversation.id,
          visualizationId: response.data.visualizationId,
          renderTime,
          metadata: response.data.metadata,
          status: 'generated'
        };

        visualizations.push(visualization);

        this.logger.info(`  ✅ Visualization generated in ${renderTime}ms`);

        // Store visualization for export
        conversation.visualization = visualization;

      } catch (error) {
        this.logger.error(`  ❌ Failed to generate visualization: ${error.message}`);

        const failedVisualization = {
          conversationId: conversation.id,
          error: error.message,
          status: 'failed'
        };

        visualizations.push(failedVisualization);
        this.results.errors.push(`Visualization for ${conversation.id} failed: ${error.message}`);
      }
    }

    this.logger.info(`Generated ${visualizations.filter(v => v.status === 'generated').length} visualizations`);
    return visualizations;
  }

  async exportResultsPhase() {
    this.logger.info('Exporting demo results...');
    const axios = require('axios');

    const exports = [];

    for (const conversation of this.results.conversations) {
      if (conversation.status !== 'processed' || !conversation.visualization) {
        continue;
      }

      this.logger.info(`Exporting results for conversation: ${conversation.id}`);

      try {
        const response = await axios.post(
          `${DEMO_CONFIG.apiEndpoints.base}${DEMO_CONFIG.apiEndpoints.exports}`,
          {
            conversationId: conversation.id,
            visualizationId: conversation.visualization.visualizationId,
            exportOptions: {
              formats: ['json', 'csv', 'png'],
              includeMetrics: true,
              includeCognitiveAnalysis: true,
              includeRawData: false
            }
          },
          { timeout: 10000 }
        );

        const exportResult = {
          conversationId: conversation.id,
          exportId: response.data.exportId,
          files: response.data.files,
          status: 'exported'
        };

        exports.push(exportResult);
        this.logger.info(`  ✅ Exported ${response.data.files.length} files`);

        // Store export data for final report
        conversation.export = exportResult;

      } catch (error) {
        this.logger.error(`  ❌ Export failed: ${error.message}`);

        const failedExport = {
          conversationId: conversation.id,
          error: error.message,
          status: 'failed'
        };

        exports.push(failedExport);
        this.results.errors.push(`Export for ${conversation.id} failed: ${error.message}`);
      }
    }

    this.logger.info(`Exported results for ${exports.filter(e => e.status === 'exported').length} conversations`);
    return exports;
  }

  async validateResultsPhase() {
    this.logger.info('Validating demo results against success criteria...');

    const validationResults = await this.validator.validateDemo(this.results);
    this.results.validation = validationResults;

    this.logger.info(`Validation Results:`);
    this.logger.info(`  Overall Status: ${validationResults.overallStatus}`);
    this.logger.info(`  Performance Checks: ${validationResults.performance?.passed}/${validationResults.performance?.total} passed`);
    this.logger.info(`  Cognitive Accuracy: ${validationResults.cognitive?.passed}/${validationResults.cognitive?.total} passed`);
    this.logger.info(`  Output Validation: ${validationResults.outputs?.passed}/${validationResults.outputs?.total} passed`);

    if (validationResults.overallStatus !== 'passed') {
      const failedChecks = validationResults.checks?.filter(check => check.status === 'failed') || [];
      this.logger.warn(`Failed validation checks:`);
      failedChecks.forEach(check => {
        this.logger.warn(`  - ${check.category}: ${check.name} - ${check.reason}`);
      });
    }

    return validationResults;
  }

  async generateFinalReport() {
    this.logger.info('Generating final demo report...');

    const report = {
      summary: {
        demoVersion: '1.0.0',
        timestamp: new Date().toISOString(),
        duration: this.results.duration,
        success: this.results.success,
        totalConversations: this.options.conversations,
        processedConversations: this.results.conversations.filter(c => c.status === 'processed').length,
        generatedVisualizations: this.results.conversations.filter(c => c.visualization?.status === 'generated').length,
        exportedResults: this.results.conversations.filter(c => c.export?.status === 'exported').length,
        errors: this.results.errors.length
      },
      performance: this.metrics.getSummary(),
      conversations: this.results.conversations.map(conv => ({
        id: conv.id,
        status: conv.status,
        processingTime: conv.processingTime,
        cognitiveAnalysis: conv.cognitiveAnalysis,
        hasVisualization: !!conv.visualization,
        hasExport: !!conv.export
      })),
      validation: this.results.validation,
      configuration: this.options,
      logs: this.logger.getRecentLogs(50) // Last 50 log entries
    };

    // Ensure output directory exists
    await mkdir(this.options.output, { recursive: true });

    // Write comprehensive report
    const reportPath = join(this.options.output, `demo-report-${Date.now()}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2));

    // Write human-readable summary
    const summaryPath = join(this.options.output, `demo-summary-${Date.now()}.md`);
    const summaryContent = this.generateMarkdownSummary(report);
    await writeFile(summaryPath, summaryContent);

    this.logger.info(`📊 Reports generated:`);
    this.logger.info(`  Detailed: ${reportPath}`);
    this.logger.info(`  Summary:  ${summaryPath}`);

    return { reportPath, summaryPath };
  }

  generateMarkdownSummary(report) {
    const { summary, performance, validation } = report;

    return `# Cognitive Fabric Visualizer - Demo Report

## Executive Summary
- **Status**: ${summary.success ? '✅ SUCCESS' : '❌ FAILED'}
- **Duration**: ${Math.round(summary.duration / 1000)}s
- **Timestamp**: ${summary.timestamp}
- **Conversations Processed**: ${summary.processedConversations}/${summary.totalConversations}
- **Visualizations Generated**: ${summary.generatedVisualizations}
- **Results Exported**: ${summary.exportedResults}
- **Errors Encountered**: ${summary.errors}

## Performance Metrics
- **Total Demo Time**: ${Math.round(performance.totalDuration / 1000)}s
- **Average Processing Time**: ${Math.round(performance.averageProcessingTime || 0)}ms
- **API Response Time**: ${Math.round(performance.averageApiResponseTime || 0)}ms
- **System Memory Usage**: ${performance.peakMemoryUsage || 'N/A'}

## Cognitive Analysis Results
${Object.entries(summary.cognitiveAnalysis || {}).map(([dimension, scores]) => {
  const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return `- **${dimension}**: ${avg.toFixed(3)} average`;
}).join('\n')}

## Validation Results
- **Overall Status**: ${validation?.overallStatus?.toUpperCase() || 'N/A'}
- **Performance Checks**: ${validation?.performance?.passed || 0}/${validation?.performance?.total || 0}
- **Cognitive Accuracy**: ${validation?.cognitive?.passed || 0}/${validation?.cognitive?.total || 0}
- **Output Validation**: ${validation?.outputs?.passed || 0}/${validation?.outputs?.total || 0}

## Success Criteria Validation
${validation?.checks?.map(check =>
  `- **${check.category}**: ${check.name} - ${check.status === 'passed' ? '✅' : '❌'} ${check.reason || ''}`
).join('\n') || 'No validation checks performed'}

## Technical Details
- **Node.js Version**: ${process.version}
- **Platform**: ${process.platform}
- **Architecture**: ${process.arch}
- **Demo Configuration**: ${JSON.stringify(summary.configuration, null, 2)}

## Recommendations
${this.generateRecommendations(report)}

---
*Generated by Cognitive Fabric Visualizer Demo System*
*Report ID: ${Date.now()}*`;
  }

  generateRecommendations(report) {
    const recommendations = [];
    const { performance, validation } = report;

    // Performance recommendations
    if (performance.averageProcessingTime > DEMO_CONFIG.performanceThresholds.maxProcessingTime) {
      recommendations.push('- Consider optimizing cognitive analysis pipeline to reduce processing time');
    }

    // Validation recommendations
    if (validation?.overallStatus === 'failed') {
      const failedChecks = validation.checks?.filter(check => check.status === 'failed') || [];
      failedChecks.forEach(check => {
        recommendations.push(`- Address ${check.category} validation: ${check.reason}`);
      });
    }

    // Success recommendations
    if (report.summary.success) {
      recommendations.push('- Demo completed successfully - system is ready for production use');
      recommendations.push('- Consider scaling up to handle larger conversation volumes');
    }

    return recommendations.length > 0 ? recommendations.join('\n') : '- No specific recommendations - system performing as expected';
  }
}

// Command line interface
if (import.meta.url === `file://${process.argv[1]}`) {
  program
    .name('cognitive-fabric-demo')
    .description('Cognitive Fabric Visualizer Comprehensive Demo')
    .version('1.0.0')
    .option('-c, --config <path>', 'Configuration file path')
    .option('-o, --output <path>', 'Output directory for reports', './scripts/reports')
    .option('-n, --conversations <num>', 'Number of conversations to process', '3')
    .option('-v, --verbose', 'Enable verbose logging')
    .option('--skip-validation', 'Skip final validation step')
    .parse();

  const options = program.opts();

  const demo = new CognitiveFabricDemo(options);

  demo.run().catch(error => {
    console.error('Demo execution failed:', error);
    process.exit(1);
  });
}

export default CognitiveFabricDemo;