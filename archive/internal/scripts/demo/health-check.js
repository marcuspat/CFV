/**
 * System Health Checker for Cognitive Fabric Visualizer Demo
 *
 * Verifies all system components are operational before running demo.
 */

import axios from 'axios';
import { performance } from 'perf_hooks';
import { CONFIG } from '../config/demo-config.js';

export class SystemHealthChecker {
  constructor() {
    this.config = CONFIG;
    this.results = {
      status: 'unknown',
      components: {},
      performance: {},
      timestamp: null,
      errors: [],
      recommendations: []
    };
  }

  async checkAllComponents() {
    this.results.timestamp = new Date().toISOString();

    console.log('🔍 Performing comprehensive system health check...');

    const checks = [
      this.checkServerHealth(),
      this.checkDatabaseConnectivity(),
      this.checkMLPipelineAvailability(),
      this.checkWebSocketConnectivity(),
      this.checkAPIEndpoints(),
      this.checkFileSystemAccess()
    ];

    await Promise.allSettled(checks);
    this.calculateOverallStatus();
    this.generateRecommendations();

    return this.results;
  }

  async checkServerHealth() {
    console.log('  📡 Checking server connectivity...');
    const startTime = performance.now();

    try {
      const response = await axios.get(
        `${this.config.apiEndpoints.base}${this.config.apiEndpoints.health}`,
        {
          timeout: 5000,
          validateStatus: (status) => status < 500 // Accept 4xx as server is running
        }
      );

      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);

      this.results.components.server = {
        status: response.status === 200 ? 'healthy' : 'degraded',
        responseTime,
        version: response.data?.version || 'unknown',
        uptime: response.data?.uptime || 'unknown',
        environment: response.data?.environment || 'unknown'
      };

      this.results.performance.serverResponse = responseTime;

      console.log(`    ✅ Server healthy (${responseTime}ms response time)`);

    } catch (error) {
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);

      this.results.components.server = {
        status: 'error',
        responseTime,
        error: error.message,
        code: error.code || 'UNKNOWN'
      };

      this.results.errors.push(`Server health check failed: ${error.message}`);
      console.log(`    ❌ Server unavailable: ${error.message}`);
    }
  }

  async checkDatabaseConnectivity() {
    console.log('  🗄️  Checking database connectivity...');

    try {
      // Check database health through API (since direct DB access might be restricted)
      const response = await axios.get(
        `${this.config.apiEndpoints.base}/api/health/database`,
        { timeout: 3000 }
      );

      this.results.components.database = {
        status: response.data?.status === 'healthy' ? 'connected' : 'error',
        details: response.data,
        responseTime: response.data?.responseTime || 'unknown'
      };

      console.log(`    ✅ Database connected (${this.results.components.database.responseTime}ms)`);

    } catch (error) {
      this.results.components.database = {
        status: 'error',
        error: error.message,
        code: error.code || 'UNKNOWN'
      };

      this.results.errors.push(`Database check failed: ${error.message}`);
      console.log(`    ❌ Database unavailable: ${error.message}`);
    }
  }

  async checkMLPipelineAvailability() {
    console.log('  🧠 Checking ML pipeline availability...');

    try {
      const response = await axios.get(
        `${this.config.apiEndpoints.base}/api/health/ml`,
        { timeout: 5000 }
      );

      this.results.components.ml = {
        status: response.data?.status === 'available' ? 'available' : 'error',
        models: response.data?.models || [],
        version: response.data?.version || 'unknown',
        capabilities: response.data?.capabilities || []
      };

      console.log(`    ✅ ML pipeline available (${this.results.components.ml.models.length} models loaded)`);

    } catch (error) {
      this.results.components.ml = {
        status: 'error',
        error: error.message,
        code: error.code || 'UNKNOWN'
      };

      this.results.errors.push(`ML pipeline check failed: ${error.message}`);
      console.log(`    ❌ ML pipeline unavailable: ${error.message}`);
    }
  }

  async checkWebSocketConnectivity() {
    console.log('  🔌 Checking WebSocket connectivity...');

    return new Promise((resolve) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(this.config.apiEndpoints.ws);

      const timeout = setTimeout(() => {
        ws.terminate();
        this.results.components.websocket = {
          status: 'error',
          error: 'Connection timeout'
        };
        this.results.errors.push('WebSocket connection timeout');
        console.log('    ❌ WebSocket connection timeout');
        resolve();
      }, 3000);

      ws.on('open', () => {
        clearTimeout(timeout);
        this.results.components.websocket = {
          status: 'connected'
        };
        console.log('    ✅ WebSocket connected');
        ws.close();
        resolve();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        this.results.components.websocket = {
          status: 'error',
          error: error.message
        };
        this.results.errors.push(`WebSocket error: ${error.message}`);
        console.log(`    ❌ WebSocket error: ${error.message}`);
        resolve();
      });
    });
  }

  async checkAPIEndpoints() {
    console.log('  🛠️  Checking API endpoints...');

    const endpoints = [
      { name: 'conversations', path: this.config.apiEndpoints.conversations },
      { name: 'analysis', path: this.config.apiEndpoints.analysis },
      { name: 'visualizations', path: this.config.apiEndpoints.visualizations },
      { name: 'exports', path: this.config.apiEndpoints.exports }
    ];

    this.results.components.apiEndpoints = {};

    for (const endpoint of endpoints) {
      try {
        // Use OPTIONS to check endpoint availability without making changes
        const response = await axios.options(
          `${this.config.apiEndpoints.base}${endpoint.path}`,
          { timeout: 2000 }
        );

        this.results.components.apiEndpoints[endpoint.name] = {
          status: 'available',
          methods: response.headers?.allow || 'unknown'
        };

        console.log(`    ✅ ${endpoint.name} endpoint available`);

      } catch (error) {
        this.results.components.apiEndpoints[endpoint.name] = {
          status: 'error',
          error: error.message
        };

        this.results.errors.push(`API endpoint ${endpoint.name} unavailable: ${error.message}`);
        console.log(`    ❌ ${endpoint.name} endpoint unavailable: ${error.message}`);
      }
    }
  }

  async checkFileSystemAccess() {
    console.log('  📁 Checking file system access...');

    const { writeFile, mkdir } = await import('fs/promises');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    try {
      const testDir = join(tmpdir(), 'cfv-demo-test');
      const testFile = join(testDir, 'test.txt');

      // Test directory creation
      await mkdir(testDir, { recursive: true });

      // Test file write
      await writeFile(testFile, 'test content', 'utf8');

      // Clean up
      const { unlinkSync, rmdirSync } = await import('fs');
      unlinkSync(testFile);
      rmdirSync(testDir);

      this.results.components.fileSystem = {
        status: 'accessible',
        writePermissions: true,
        readPermissions: true
      };

      console.log('    ✅ File system accessible');

    } catch (error) {
      this.results.components.fileSystem = {
        status: 'error',
        error: error.message
      };

      this.results.errors.push(`File system check failed: ${error.message}`);
      console.log(`    ❌ File system error: ${error.message}`);
    }
  }

  calculateOverallStatus() {
    const componentStatuses = Object.values(this.results.components)
      .map(comp => comp.status);

    const allHealthy = componentStatuses.every(status =>
      status === 'healthy' || status === 'connected' ||
      status === 'available' || status === 'accessible'
    );

    const hasErrors = componentStatuses.some(status => status === 'error');

    const degradedCount = componentStatuses.filter(status => status === 'degraded').length;

    if (allHealthy) {
      this.results.status = 'healthy';
    } else if (hasErrors) {
      this.results.status = 'unhealthy';
    } else if (degradedCount > 0) {
      this.results.status = 'degraded';
    } else {
      this.results.status = 'unknown';
    }

    // Calculate performance metrics
    const performanceMetrics = Object.values(this.results.performance);
    if (performanceMetrics.length > 0) {
      this.results.performance.average = Math.round(
        performanceMetrics.reduce((sum, metric) => sum + metric, 0) / performanceMetrics.length
      );
    }
  }

  generateRecommendations() {
    this.results.recommendations = [];

    // Server recommendations
    if (this.results.components.server?.status === 'error') {
      this.results.recommendations.push('Start the server: npm run dev or node src/server/index.js');
    } else if (this.results.components.server?.responseTime > 1000) {
      this.results.recommendations.push('Server response time is slow - check system resources');
    }

    // Database recommendations
    if (this.results.components.database?.status === 'error') {
      this.results.recommendations.push('Check database connection and ensure database server is running');
    }

    // ML pipeline recommendations
    if (this.results.components.ml?.status === 'error') {
      this.results.recommendations.push('Ensure ML models are loaded and ML pipeline is initialized');
    }

    // WebSocket recommendations
    if (this.results.components.websocket?.status === 'error') {
      this.results.recommendations.push('WebSocket server may not be running - check server configuration');
    }

    // API endpoints recommendations
    const failedEndpoints = Object.entries(this.results.components.apiEndpoints || {})
      .filter(([name, endpoint]) => endpoint.status === 'error')
      .map(([name]) => name);

    if (failedEndpoints.length > 0) {
      this.results.recommendations.push(`Failed API endpoints: ${failedEndpoints.join(', ')} - check routing configuration`);
    }

    // File system recommendations
    if (this.results.components.fileSystem?.status === 'error') {
      this.results.recommendations.push('Check file system permissions and disk space');
    }

    if (this.results.recommendations.length === 0) {
      this.results.recommendations.push('All systems operational - ready to run demo');
    }
  }

  printHealthReport() {
    console.log('\n📋 System Health Report');
    console.log('='.repeat(50));
    console.log(`Overall Status: ${this.getStatusIcon(this.results.status)} ${this.results.status.toUpperCase()}`);
    console.log(`Checked At: ${this.results.timestamp}`);
    console.log('');

    // Component status
    console.log('Components:');
    for (const [name, component] of Object.entries(this.results.components)) {
      const icon = this.getStatusIcon(component.status);
      const details = component.responseTime ? ` (${component.responseTime}ms)` : '';
      console.log(`  ${icon} ${name}: ${component.status}${details}`);

      if (component.error) {
        console.log(`    Error: ${component.error}`);
      }
    }

    // Performance metrics
    if (Object.keys(this.results.performance).length > 0) {
      console.log('\nPerformance Metrics:');
      for (const [metric, value] of Object.entries(this.results.performance)) {
        console.log(`  📊 ${metric}: ${value}${metric.includes('Time') ? 'ms' : ''}`);
      }
    }

    // Recommendations
    if (this.results.recommendations.length > 0) {
      console.log('\nRecommendations:');
      this.results.recommendations.forEach(rec => {
        console.log(`  💡 ${rec}`);
      });
    }

    console.log('='.repeat(50));
  }

  getStatusIcon(status) {
    const icons = {
      'healthy': '✅',
      'connected': '✅',
      'available': '✅',
      'accessible': '✅',
      'degraded': '⚠️',
      'error': '❌',
      'unknown': '❓'
    };
    return icons[status] || '❓';
  }
}

// Convenience function
export async function checkSystemHealth() {
  const checker = new SystemHealthChecker();
  const results = await checker.checkAllComponents();
  checker.printHealthReport();
  return results;
}

export default SystemHealthChecker;