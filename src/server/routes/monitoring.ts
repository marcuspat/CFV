/**
 * Monitoring API Routes
 * RESTful endpoints for accessing monitoring data and configuration
 */

import { Router, Request, Response } from 'express';
import {
  metricsCollector,
  performanceAnalyzer,
  resourceMonitor,
  networkMonitor,
  databaseMonitor,
  apiMonitor,
  agentCoordinationMonitor,
  alertingSystem,
  initializeMonitoring,
  shutdownMonitoring
} from '../services/monitoring/index.js';

const router = Router();

/**
 * Get comprehensive monitoring overview
 * GET /api/monitoring/overview
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const [
      metrics,
      performanceReport,
      resourceMetrics,
      networkMetrics,
      databaseMetrics,
      agentMetrics,
      alerts,
      apiHealth
    ] = await Promise.all([
      metricsCollector.getSnapshot(),
      performanceAnalyzer.getLatestReport(),
      resourceMonitor.getCurrentMetrics(),
      networkMonitor.getCurrentMetrics(),
      databaseMonitor.getCurrentMetrics(),
      agentCoordinationMonitor.getCurrentMetrics(),
      alertingSystem.getActiveAlerts(),
      apiMonitor.getHealthScore()
    ]);

    const overview = {
      timestamp: Date.now(),
      status: 'healthy',
      health: {
        overall: apiHealth.overall,
        availability: apiHealth.availability,
        performance: apiHealth.performance,
        status: apiHealth.status
      },
      metrics: {
        system: resourceMetrics,
        network: networkMetrics,
        database: databaseMetrics,
        agents: agentMetrics,
        api: apiMonitor.getCurrentMetrics()
      },
      performance: performanceReport,
      alerts: {
        active: alerts.length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
        recent: alerts.slice(0, 5)
      },
      trends: {
        performance: performanceAnalyzer.getAnalysisHistory(24),
        resource: resourceMonitor.getTrends(24),
        network: networkMonitor.getPerformanceTrends(24),
        agents: agentCoordinationMonitor.getPerformanceTrends(24)
      }
    };

    res.json(overview);
  } catch (error) {
    console.error('Error getting monitoring overview:', error);
    res.status(500).json({ error: 'Failed to get monitoring overview' });
  }
});

/**
 * Get metrics snapshot
 * GET /api/monitoring/metrics
 */
router.get('/metrics', (req: Request, res: Response) => {
  try {
    const { category, limit } = req.query;
    let metrics = metricsCollector.getSnapshot();

    if (category) {
      metrics.metrics = metrics.metrics.filter(m => m.category === category);
    }

    if (limit) {
      metrics.metrics = metrics.metrics.slice(0, parseInt(limit as string));
    }

    res.json(metrics);
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

/**
 * Get metrics history
 * GET /api/monitoring/metrics/history
 */
router.get('/metrics/history', (req: Request, res: Response) => {
  try {
    const { limit, category } = req.query;
    const history = metricsCollector.getHistory(parseInt(limit as string) || 100);

    let filteredHistory = history;
    if (category) {
      filteredHistory = history.map(snapshot => ({
        ...snapshot,
        metrics: snapshot.metrics.filter(m => m.category === category)
      }));
    }

    res.json(filteredHistory);
  } catch (error) {
    console.error('Error getting metrics history:', error);
    res.status(500).json({ error: 'Failed to get metrics history' });
  }
});

/**
 * Get performance analysis
 * GET /api/monitoring/performance
 */
router.get('/performance', async (req: Request, res: Response) => {
  try {
    const report = await performanceAnalyzer.analyzePerformance();
    res.json(report);
  } catch (error) {
    console.error('Error getting performance analysis:', error);
    res.status(500).json({ error: 'Failed to get performance analysis' });
  }
});

/**
 * Get performance trends
 * GET /api/monitoring/performance/trends
 */
router.get('/performance/trends', (req: Request, res: Response) => {
  try {
    const { hours } = req.query;
    const history = performanceAnalyzer.getAnalysisHistory(parseInt(hours as string) || 24);

    const trends = {
      overall: history.map(h => ({ timestamp: h.timestamp, score: h.overall.score })),
      anomalies: history.map(h => ({ timestamp: h.timestamp, count: h.anomalies.length })),
      bottlenecks: history.map(h => ({ timestamp: h.timestamp, count: h.bottlenecks.length }))
    };

    res.json(trends);
  } catch (error) {
    console.error('Error getting performance trends:', error);
    res.status(500).json({ error: 'Failed to get performance trends' });
  }
});

/**
 * Get resource metrics
 * GET /api/monitoring/resources
 */
router.get('/resources', async (req: Request, res: Response) => {
  try {
    const metrics = await resourceMonitor.getCurrentMetrics();
    const trends = resourceMonitor.getTrends(parseInt(req.query.hours as string) || 1);
    const alerts = resourceMonitor.checkAlerts();

    res.json({
      current: metrics,
      trends,
      alerts
    });
  } catch (error) {
    console.error('Error getting resource metrics:', error);
    res.status(500).json({ error: 'Failed to get resource metrics' });
  }
});

/**
 * Get network metrics
 * GET /api/monitoring/network
 */
router.get('/network', async (req: Request, res: Response) => {
  try {
    const metrics = await networkMonitor.getCurrentMetrics();
    const trends = networkMonitor.getPerformanceTrends(parseInt(req.query.hours as string) || 1);
    const activeTests = networkMonitor.getActiveTests();

    res.json({
      current: metrics,
      trends,
      activeTests
    });
  } catch (error) {
    console.error('Error getting network metrics:', error);
    res.status(500).json({ error: 'Failed to get network metrics' });
  }
});

/**
 * Run network test
 * POST /api/monitoring/network/test
 */
router.post('/network/test', async (req: Request, res: Response) => {
  try {
    const { type, target } = req.body;
    if (!type || !target) {
      return res.status(400).json({ error: 'Type and target are required' });
    }

    const test = await networkMonitor.runTest(type, target);
    res.json(test);
  } catch (error) {
    console.error('Error running network test:', error);
    res.status(500).json({ error: 'Failed to run network test' });
  }
});

/**
 * Get database metrics
 * GET /api/monitoring/database
 */
router.get('/database', async (req: Request, res: Response) => {
  try {
    const metrics = await databaseMonitor.getCurrentMetrics();
    const queryTraces = databaseMonitor.getQueryTraces(parseInt(req.query.limit as string) || 100);
    const slowQueries = databaseMonitor.getSlowQueries();
    const failedQueries = databaseMonitor.getFailedQueries();
    const patterns = databaseMonitor.analyzeQueryPatterns();

    res.json({
      current: metrics,
      queries: {
        recent: queryTraces,
        slow: slowQueries,
        failed: failedQueries,
        patterns
      }
    });
  } catch (error) {
    console.error('Error getting database metrics:', error);
    res.status(500).json({ error: 'Failed to get database metrics' });
  }
});

/**
 * Get API metrics
 * GET /api/monitoring/api
 */
router.get('/api', (req: Request, res: Response) => {
  try {
    const { limit, minDuration, maxDuration, method, path, statusCode } = req.query;

    const filters: any = {};
    if (minDuration) filters.minDuration = parseInt(minDuration as string);
    if (maxDuration) filters.maxDuration = parseInt(maxDuration as string);
    if (method) filters.method = method;
    if (path) filters.path = path;
    if (statusCode) filters.statusCode = parseInt(statusCode as string);

    const requests = apiMonitor.getRequests(parseInt(limit as string), filters);
    const slowRequests = apiMonitor.getSlowRequests();
    const errorRequests = apiMonitor.getErrorRequests();
    const endpoints = apiMonitor.getEndpointMetrics();
    const health = apiMonitor.getHealthScore();
    const trends = apiMonitor.getPerformanceTrends(parseInt(req.query.hours as string) || 1);

    res.json({
      health,
      requests: {
        recent: requests,
        slow: slowRequests,
        errors: errorRequests
      },
      endpoints,
      trends
    });
  } catch (error) {
    console.error('Error getting API metrics:', error);
    res.status(500).json({ error: 'Failed to get API metrics' });
  }
});

/**
 * Get agent coordination metrics
 * GET /api/monitoring/agents
 */
router.get('/agents', async (req: Request, res: Response) => {
  try {
    const metrics = await agentCoordinationMonitor.getCurrentMetrics();
    const taskTraces = agentCoordinationMonitor.getTaskTraces(parseInt(req.query.limit as string) || 100);
    const events = agentCoordinationMonitor.getEvents(parseInt(req.query.limit as string) || 100);
    const trends = agentCoordinationMonitor.getPerformanceTrends(parseInt(req.query.hours as string) || 1);

    res.json({
      current: metrics,
      tasks: taskTraces,
      events,
      trends
    });
  } catch (error) {
    console.error('Error getting agent metrics:', error);
    res.status(500).json({ error: 'Failed to get agent metrics' });
  }
});

/**
 * Get alerts
 * GET /api/monitoring/alerts
 */
router.get('/alerts', (req: Request, res: Response) => {
  try {
    const { severity, category, source, limit } = req.query;

    const filters: any = {};
    if (severity) filters.severity = severity;
    if (category) filters.category = category;
    if (source) filters.source = source;

    const alerts = alertingSystem.getActiveAlerts(filters);
    const statistics = alertingSystem.getStatistics();

    res.json({
      alerts: limit ? alerts.slice(0, parseInt(limit as string)) : alerts,
      statistics
    });
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
});

/**
 * Create alert
 * POST /api/monitoring/alerts
 */
router.post('/alerts', (req: Request, res: Response) => {
  try {
    const alertData = req.body;
    const alertId = alertingSystem.createAlert(alertData);
    res.status(201).json({ id: alertId, message: 'Alert created successfully' });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

/**
 * Acknowledge alert
 * POST /api/monitoring/alerts/:id/acknowledge
 */
router.post('/alerts/:id/acknowledge', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { acknowledgedBy } = req.body;

    if (!acknowledgedBy) {
      return res.status(400).json({ error: 'acknowledgedBy is required' });
    }

    const success = alertingSystem.acknowledgeAlert(id, acknowledgedBy);
    if (!success) {
      return res.status(404).json({ error: 'Alert not found or not active' });
    }

    res.json({ message: 'Alert acknowledged successfully' });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

/**
 * Resolve alert
 * POST /api/monitoring/alerts/:id/resolve
 */
router.post('/alerts/:id/resolve', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolvedBy } = req.body;

    const success = alertingSystem.resolveAlert(id, resolvedBy);
    if (!success) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({ message: 'Alert resolved successfully' });
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

/**
 * Get alert rules
 * GET /api/monitoring/alerts/rules
 */
router.get('/alerts/rules', (req: Request, res: Response) => {
  try {
    const rules = alertingSystem.getRules();
    res.json(rules);
  } catch (error) {
    console.error('Error getting alert rules:', error);
    res.status(500).json({ error: 'Failed to get alert rules' });
  }
});

/**
 * Create alert rule
 * POST /api/monitoring/alerts/rules
 */
router.post('/alerts/rules', (req: Request, res: Response) => {
  try {
    const ruleData = req.body;
    const ruleId = alertingSystem.addRule(ruleData);
    res.status(201).json({ id: ruleId, message: 'Alert rule created successfully' });
  } catch (error) {
    console.error('Error creating alert rule:', error);
    res.status(500).json({ error: 'Failed to create alert rule' });
  }
});

/**
 * Update alert rule
 * PUT /api/monitoring/alerts/rules/:id
 */
router.put('/alerts/rules/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const success = alertingSystem.updateRule(id, updates);
    if (!success) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    res.json({ message: 'Alert rule updated successfully' });
  } catch (error) {
    console.error('Error updating alert rule:', error);
    res.status(500).json({ error: 'Failed to update alert rule' });
  }
});

/**
 * Delete alert rule
 * DELETE /api/monitoring/alerts/rules/:id
 */
router.delete('/alerts/rules/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = alertingSystem.removeRule(id);
    if (!success) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    res.json({ message: 'Alert rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting alert rule:', error);
    res.status(500).json({ error: 'Failed to delete alert rule' });
  }
});

/**
 * Get notification channels
 * GET /api/monitoring/alerts/channels
 */
router.get('/alerts/channels', (req: Request, res: Response) => {
  try {
    const channels = alertingSystem.getChannels();
    res.json(channels);
  } catch (error) {
    console.error('Error getting notification channels:', error);
    res.status(500).json({ error: 'Failed to get notification channels' });
  }
});

/**
 * Create notification channel
 * POST /api/monitoring/alerts/channels
 */
router.post('/alerts/channels', (req: Request, res: Response) => {
  try {
    const channelData = req.body;
    const channelId = alertingSystem.addChannel(channelData);
    res.status(201).json({ id: channelId, message: 'Notification channel created successfully' });
  } catch (error) {
    console.error('Error creating notification channel:', error);
    res.status(500).json({ error: 'Failed to create notification channel' });
  }
});

/**
 * Get monitoring configuration
 * GET /api/monitoring/config
 */
router.get('/config', (req: Request, res: Response) => {
  try {
    // Return current monitoring configuration (excluding sensitive data)
    const config = {
      enabled: true,
      interval: 5000,
      thresholds: {
        responseTime: { warning: 500, critical: 2000 },
        cpu: { warning: 70, critical: 90 },
        memory: { warning: 75, critical: 90 },
        database: { queryTimeWarning: 200, queryTimeCritical: 1000 },
        agentCoordination: { overheadWarning: 50, overheadCritical: 200 }
      },
      retention: {
        metrics: 30,
        logs: 7,
        alerts: 30
      }
    };

    res.json(config);
  } catch (error) {
    console.error('Error getting monitoring config:', error);
    res.status(500).json({ error: 'Failed to get monitoring config' });
  }
});

/**
 * Update monitoring configuration
 * PUT /api/monitoring/config
 */
router.put('/config', (req: Request, res: Response) => {
  try {
    const config = req.body;
    initializeMonitoring(config);
    res.json({ message: 'Monitoring configuration updated successfully' });
  } catch (error) {
    console.error('Error updating monitoring config:', error);
    res.status(500).json({ error: 'Failed to update monitoring config' });
  }
});

/**
 * Export monitoring data
 * GET /api/monitoring/export
 */
router.get('/export', (req: Request, res: Response) => {
  try {
    const { format, type } = req.query;

    let data;
    let filename;
    let contentType;

    switch (type) {
      case 'metrics':
        data = metricsCollector.exportMetrics();
        filename = 'metrics.json';
        contentType = 'application/json';
        break;
      case 'alerts':
        data = JSON.stringify(alertingSystem.getAllAlerts(), null, 2);
        filename = 'alerts.json';
        contentType = 'application/json';
        break;
      case 'performance':
        data = JSON.stringify(performanceAnalyzer.getAnalysisHistory(), null, 2);
        filename = 'performance.json';
        contentType = 'application/json';
        break;
      default:
        // Export all data
        data = JSON.stringify({
          timestamp: Date.now(),
          metrics: metricsCollector.getSnapshot(),
          alerts: alertingSystem.getAllAlerts(),
          performance: performanceAnalyzer.getLatestReport()
        }, null, 2);
        filename = 'monitoring-export.json';
        contentType = 'application/json';
    }

    if (format === 'csv') {
      // Convert to CSV (simplified)
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename.replace('.json', '.csv')}"`);
      return res.send('CSV export not implemented');
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(data);
  } catch (error) {
    console.error('Error exporting monitoring data:', error);
    res.status(500).json({ error: 'Failed to export monitoring data' });
  }
});

/**
 * Health check endpoint
 * GET /api/monitoring/health
 */
router.get('/health', (req: Request, res: Response) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
        metrics: 'healthy',
        performance: 'healthy',
        resources: 'healthy',
        network: 'healthy',
        database: 'healthy',
        api: 'healthy',
        agents: 'healthy',
        alerts: 'healthy'
      }
    };

    res.json(health);
  } catch (error) {
    console.error('Error in health check:', error);
    res.status(500).json({ status: 'unhealthy', error: 'Health check failed' });
  }
});

export default router;