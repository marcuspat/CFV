import { test as base, Page, BrowserContext } from '@playwright/test';
import { setupTestUtils, PerformanceMonitor, CognitiveVisualizationUtils, MobileTestingUtils } from './test-utilities';

/**
 * Extended test fixture with cognitive visualization utilities
 */
export type TestFixtures = {
  performanceMonitor: PerformanceMonitor;
  cognitiveUtils: CognitiveVisualizationUtils;
  mobileUtils: MobileTestingUtils;
};

/**
 * Extended test object with cognitive visualization methods
 */
export const test = base.extend<TestFixtures>({
  // Page fixture with cognitive visualization setup
  page: async ({ page }, use) => {
    // Set up error handling
    page.on('pageerror', (error) => {
      console.error('Page error:', error);
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('Console error:', msg.text());
      }
    });

    await use(page);
  },

  // Performance monitor fixture
  performanceMonitor: async ({ page }, use) => {
    const monitor = new PerformanceMonitor(page);
    await monitor.startMonitoring();
    await use(monitor);
  },

  // Cognitive visualization utilities fixture
  cognitiveUtils: async ({ page }, use) => {
    const utils = new CognitiveVisualizationUtils(page);
    await use(utils);
  },

  // Mobile testing utilities fixture
  mobileUtils: async ({ page }, use) => {
    const utils = new MobileTestingUtils(page);
    await use(utils);
  },
});

/**
 * Custom test expect extensions for cognitive visualization
 */
export const expectCognitive = {
  /**
   * Expect 3D scene to be ready and interactive
   */
  async toBeReady(page: Page) {
    const utils = new CognitiveVisualizationUtils(page);
    await utils.waitForSceneReady();
  },

  /**
   * Expect performance to meet targets
   */
  async toMeetPerformanceTargets(page: Page, targets: { fps: number; memory: number }) {
    const monitor = new PerformanceMonitor(page);
    const validation = await monitor.validatePerformance(targets);

    if (!validation.fps.passed || !validation.memory.passed) {
      throw new Error(`Performance targets not met: FPS ${validation.fps.current}/${targets.fps}, Memory ${validation.memory.current}MB/${targets.memory}MB`);
    }
  },

  /**
   * Expect cognitive graph to have valid structure
   */
  async toHaveValidStructure(page: Page, minNodes: number, minEdges: number) {
    const utils = new CognitiveVisualizationUtils(page);
    const { nodes, edges } = await utils.validateGraphStructure(minNodes, minEdges);
    return { nodes, edges };
  },
};

/**
 * Re-export standard test utilities
 */
export { expect } from '@playwright/test';