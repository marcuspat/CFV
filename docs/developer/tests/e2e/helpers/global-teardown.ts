import { FullConfig } from '@playwright/test';
import path from 'path';
import fs from 'fs';

/**
 * Global teardown for Playwright testing
 * Cleans up test environment and generates performance reports
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 Cleaning up Cognitive Fabric Visualizer E2E Tests...');

  try {
    // Generate performance summary report
    const performanceDir = path.join(process.cwd(), 'test-results', 'performance');
    const reportPath = path.join(performanceDir, 'summary-report.json');

    if (fs.existsSync(performanceDir)) {
      const performanceData = fs.readdirSync(performanceDir)
        .filter(file => file.endsWith('.json') && file !== 'baseline.json')
        .map(file => {
          const data = JSON.parse(fs.readFileSync(path.join(performanceDir, file), 'utf8'));
          return { file, ...data };
        });

      if (performanceData.length > 0) {
        const summary = {
          timestamp: new Date().toISOString(),
          totalTests: performanceData.length,
          averageFPS: performanceData.reduce((sum, data) => sum + (data.fps || 0), 0) / performanceData.length,
          averageMemory: performanceData.reduce((sum, data) => sum + (data.memory || 0), 0) / performanceData.length,
          averageLoadTime: performanceData.reduce((sum, data) => sum + (data.loadTime || 0), 0) / performanceData.length,
          performanceGoals: {
            fpsTarget: 240,
            fpsAchieved: performanceData.filter(data => (data.fps || 0) >= 180).length,
            memoryTarget: 512,
            memoryAchieved: performanceData.filter(data => (data.memory || 0) <= 512).length,
          },
          tests: performanceData,
        };

        fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
        console.log(`📊 Performance summary report generated: ${reportPath}`);
      }
    }

    // Cleanup temporary files
    const tempDir = path.join(process.cwd(), 'test-results', 'temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    console.log('✅ Cleanup completed successfully');
    console.log('🎉 All Cognitive Fabric Visualizer E2E Tests Finished!');

  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    throw error;
  }
}

export default globalTeardown;