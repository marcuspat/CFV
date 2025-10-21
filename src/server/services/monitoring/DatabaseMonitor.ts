/**
 * Database Performance Monitor Service
 * Monitors database query performance, connections, and health
 */

import { EventEmitter } from 'events';
import { Pool, PoolClient } from 'pg';
import { createClient } from 'redis';
import { Driver, Session } from 'neo4j-driver';
import { metricsCollector } from './MetricsCollector.js';
import { DEFAULT_MONITORING_CONFIG } from '../../../config/monitoring.js';

export interface DatabaseMetrics {
  postgres?: PostgresMetrics;
  redis?: RedisMetrics;
  neo4j?: Neo4jMetrics;
  timestamp: number;
}

export interface PostgresMetrics {
  connections: {
    active: number;
    idle: number;
    total: number;
    max: number;
    waiting: number;
  };
  queries: {
    total: number;
    active: number;
    averageDuration: number;
    slowQueries: number;
    failedQueries: number;
    callsPerSecond: number;
  };
  performance: {
    transactionsPerSecond: number;
    tuplesFetched: number;
    tuplesReturned: number;
    indexScans: number;
    sequentialScans: number;
    deadlocks: number;
  };
  size: {
    databaseSize: number;
    tableSizes: Array<{
      tableName: string;
      size: number;
      rowCount: number;
      indexSize: number;
    }>;
  };
  locks: {
    waiting: number;
    granted: number;
    deadlocks: number;
  };
}

export interface RedisMetrics {
  connections: {
    connected: number;
    blocked: number;
    maxConnections: number;
  };
  memory: {
    used: number;
    peak: number;
    rss: number;
    fragmentation: number;
  };
  operations: {
    commandsPerSecond: number;
    totalCommands: number;
    totalConnections: number;
    keyHits: number;
    keyMisses: number;
    hitRate: number;
  };
  keyspace: {
    keys: number;
    expires: number;
    avgTTL: number;
  };
  persistence: {
    lastSave: number;
    changesSinceSave: number;
    bgsaveInProgress: boolean;
  };
}

export interface Neo4jMetrics {
  connections: {
    active: number;
    idle: number;
    total: number;
    max: number;
  };
  queries: {
    total: number;
    averageDuration: number;
    slowQueries: number;
    failedQueries: number;
  };
  transactions: {
    open: number;
    committed: number;
    rolledBack: number;
    committedPerSecond: number;
  };
  database: {
    nodeCount: number;
    relationshipCount: number;
    storeSize: number;
    indexCount: number;
  };
  memory: {
    used: number;
    total: number;
    pageCacheHitRate: number;
  };
}

export interface QueryTrace {
  id: string;
  query: string;
  parameters?: any;
  duration: number;
  database: 'postgres' | 'redis' | 'neo4j';
  status: 'success' | 'error';
  timestamp: number;
  errorMessage?: string;
  stackTrace?: string;
  tags?: Record<string, string>;
}

export interface ConnectionPool {
  name: string;
  database: 'postgres' | 'redis' | 'neo4j';
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingClients: number;
  maxConnections: number;
}

export class DatabaseMonitor extends EventEmitter {
  private config = DEFAULT_MONITORING_CONFIG;
  private monitoringInterval?: NodeJS.Timeout;
  private connections: Map<string, Pool | any> = new Map();
  private queryTraces: QueryTrace[] = [];
  private maxTraces = 1000;
  private metricsHistory: DatabaseMetrics[] = [];
  private maxHistorySize = 500;

  // Query performance tracking
  private queryStats: Map<string, {
    count: number;
    totalDuration: number;
    minDuration: number;
    maxDuration: number;
    avgDuration: number;
    errors: number;
  }> = new Map();

  constructor() {
    super();
    this.setupMonitoring();
  }

  /**
   * Register a database connection for monitoring
   */
  registerConnection(name: string, database: 'postgres' | 'redis' | 'neo4j', connection: Pool | any): void {
    this.connections.set(name, { ...connection, database, name });
    this.emit('connectionRegistered', { name, database });
  }

  /**
   * Configure database monitoring
   */
  configure(config: Partial<typeof DEFAULT_MONITORING_CONFIG>): void {
    this.config = { ...this.config, ...config };
    if (this.config.enabled) {
      this.setupMonitoring();
    } else {
      this.stopMonitoring();
    }
  }

  /**
   * Get current database metrics
   */
  async getCurrentMetrics(): Promise<DatabaseMetrics> {
    const metrics: DatabaseMetrics = {
      timestamp: Date.now()
    };

    // Collect PostgreSQL metrics
    const postgresConnections = Array.from(this.connections.values())
      .filter(conn => conn.database === 'postgres');

    if (postgresConnections.length > 0) {
      metrics.postgres = await this.getPostgresMetrics(postgresConnections[0]);
    }

    // Collect Redis metrics
    const redisConnections = Array.from(this.connections.values())
      .filter(conn => conn.database === 'redis');

    if (redisConnections.length > 0) {
      metrics.redis = await this.getRedisMetrics(redisConnections[0]);
    }

    // Collect Neo4j metrics
    const neo4jConnections = Array.from(this.connections.values())
      .filter(conn => conn.database === 'neo4j');

    if (neo4jConnections.length > 0) {
      metrics.neo4j = await this.getNeo4jMetrics(neo4jConnections[0]);
    }

    return metrics;
  }

  /**
   * Trace a database query
   */
  traceQuery(
    query: string,
    parameters: any,
    duration: number,
    database: 'postgres' | 'redis' | 'neo4j',
    status: 'success' | 'error',
    errorMessage?: string,
    tags?: Record<string, string>
  ): void {
    const trace: QueryTrace = {
      id: this.generateTraceId(),
      query: this.sanitizeQuery(query),
      parameters,
      duration,
      database,
      status,
      timestamp: Date.now(),
      errorMessage,
      tags
    };

    this.queryTraces.push(trace);
    if (this.queryTraces.length > this.maxTraces) {
      this.queryTraces.shift();
    }

    // Update query statistics
    this.updateQueryStats(query, duration, status);

    // Record metrics
    this.recordQueryMetrics(trace);

    this.emit('queryTraced', trace);

    // Check for slow queries
    const threshold = this.config.thresholds.database.queryTimeWarning;
    if (duration > threshold) {
      this.emit('slowQuery', trace);
    }
  }

  /**
   * Get query traces
   */
  getQueryTraces(limit?: number, database?: string): QueryTrace[] {
    let traces = [...this.queryTraces];

    if (database) {
      traces = traces.filter(t => t.database === database);
    }

    traces.sort((a, b) => b.timestamp - a.timestamp);

    return limit ? traces.slice(0, limit) : traces;
  }

  /**
   * Get slow queries
   */
  getSlowQueries(threshold?: number): QueryTrace[] {
    const msThreshold = threshold || this.config.thresholds.database.queryTimeWarning;
    return this.queryTraces.filter(t => t.duration > msThreshold);
  }

  /**
   * Get failed queries
   */
  getFailedQueries(limit?: number): QueryTrace[] {
    const failedQueries = this.queryTraces.filter(t => t.status === 'error');
    failedQueries.sort((a, b) => b.timestamp - a.timestamp);
    return limit ? failedQueries.slice(0, limit) : failedQueries;
  }

  /**
   * Get query statistics
   */
  getQueryStats(): Map<string, {
    count: number;
    totalDuration: number;
    minDuration: number;
    maxDuration: number;
    avgDuration: number;
    errors: number;
  }> {
    return new Map(this.queryStats);
  }

  /**
   * Get connection pool information
   */
  getConnectionPools(): ConnectionPool[] {
    const pools: ConnectionPool[] = [];

    for (const [name, connection] of this.connections.entries()) {
      if (connection.database === 'postgres') {
        const pool = connection as Pool;
        pools.push({
          name,
          database: 'postgres',
          totalConnections: pool.totalCount,
          activeConnections: pool.activeCount,
          idleConnections: pool.idleCount,
          waitingClients: pool.waitingCount,
          maxConnections: pool.options.max || 10
        });
      } else if (connection.database === 'redis') {
        // Redis client info
        pools.push({
          name,
          database: 'redis',
          totalConnections: 1, // Simplified
          activeConnections: connection.status === 'ready' ? 1 : 0,
          idleConnections: connection.status === 'ready' ? 0 : 1,
          waitingClients: 0,
          maxConnections: 1
        });
      } else if (connection.database === 'neo4j') {
        // Neo4j driver info
        pools.push({
          name,
          database: 'neo4j',
          totalConnections: 1, // Simplified
          activeConnections: 1,
          idleConnections: 0,
          waitingClients: 0,
          maxConnections: 100 // Default max
        });
      }
    }

    return pools;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): DatabaseMetrics[] {
    if (limit) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  /**
   * Analyze query patterns
   */
  analyzeQueryPatterns(): {
    mostFrequent: Array<{ query: string; count: number; avgDuration: number }>;
    slowest: Array<{ query: string; avgDuration: number; count: number }>;
    mostErrors: Array<{ query: string; errors: number; count: number }>;
    trends: {
      queryCount: { trend: 'up' | 'down' | 'stable'; change: number };
      avgDuration: { trend: 'up' | 'down' | 'stable'; change: number };
      errorRate: { trend: 'up' | 'down' | 'stable'; change: number };
    };
  } {
    const stats = Array.from(this.queryStats.entries());

    // Most frequent queries
    const mostFrequent = stats
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([query, stat]) => ({
        query,
        count: stat.count,
        avgDuration: stat.avgDuration
      }));

    // Slowest queries
    const slowest = stats
      .filter(([_, stat]) => stat.count >= 5) // At least 5 executions
      .sort((a, b) => b[1].avgDuration - a[1].avgDuration)
      .slice(0, 10)
      .map(([query, stat]) => ({
        query,
        avgDuration: stat.avgDuration,
        count: stat.count
      }));

    // Most error-prone queries
    const mostErrors = stats
      .filter(([_, stat]) => stat.errors > 0)
      .sort((a, b) => b[1].errors - a[1].errors)
      .slice(0, 10)
      .map(([query, stat]) => ({
        query,
        errors: stat.errors,
        count: stat.count
      }));

    // Calculate trends (simplified)
    const recentQueries = this.queryTraces.slice(-100);
    const olderQueries = this.queryTraces.slice(-200, -100);

    const recentCount = recentQueries.length;
    const olderCount = olderQueries.length;

    const recentAvgDuration = recentQueries.length > 0
      ? recentQueries.reduce((sum, q) => sum + q.duration, 0) / recentQueries.length
      : 0;

    const olderAvgDuration = olderQueries.length > 0
      ? olderQueries.reduce((sum, q) => sum + q.duration, 0) / olderQueries.length
      : 0;

    const recentErrors = recentQueries.filter(q => q.status === 'error').length;
    const olderErrors = olderQueries.filter(q => q.status === 'error').length;

    const calculateTrend = (newValue: number, oldValue: number) => {
      if (oldValue === 0) return { trend: 'stable' as const, change: 0 };
      const change = ((newValue - oldValue) / oldValue) * 100;
      return {
        trend: Math.abs(change) > 10 ? (change > 0 ? 'up' : 'down') : 'stable',
        change
      };
    };

    return {
      mostFrequent,
      slowest,
      mostErrors,
      trends: {
        queryCount: calculateTrend(recentCount, olderCount),
        avgDuration: calculateTrend(recentAvgDuration, olderAvgDuration),
        errorRate: calculateTrend(recentErrors, olderErrors)
      }
    };
  }

  private async getPostgresMetrics(pool: Pool): Promise<PostgresMetrics> {
    let client: PoolClient | null = null;

    try {
      client = await pool.connect();

      // Get connection statistics
      const connectionQuery = `
        SELECT
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections,
          count(*) FILTER (WHERE wait_event_type = 'Lock') as waiting_connections
        FROM pg_stat_activity
        WHERE state IS NOT NULL
      `;

      const connectionResult = await client.query(connectionQuery);
      const connStats = connectionResult.rows[0];

      // Get query statistics
      const queryQuery = `
        SELECT
          sum(calls) as total_calls,
          sum(total_exec_time) as total_time,
          sum(calls) FILTER (WHERE mean_exec_time > 1000) as slow_queries,
          sum(total_exec_time) / sum(calls) as avg_duration
        FROM pg_stat_statements
      `;

      let queryStats = { total_calls: 0, total_time: 0, slow_queries: 0, avg_duration: 0 };
      try {
        const queryResult = await client.query(queryQuery);
        queryStats = queryResult.rows[0];
      } catch (error) {
        // pg_stat_statements might not be available
      }

      // Get performance metrics
      const performanceQuery = `
        SELECT
          sum(xact_commit) as transactions,
          sum(tup_fetched) as tuples_fetched,
          sum(tup_returned) as tuples_returned,
          sum(idx_scan) as index_scans,
          sum(seq_scan) as sequential_scans
        FROM pg_stat_database
      `;

      const performanceResult = await client.query(performanceQuery);
      const perfStats = performanceResult.rows[0];

      // Get table sizes
      const tableQuery = `
        SELECT
          schemaname || '.' || tablename as table_name,
          pg_total_relation_size(schemaname || '.' || tablename) as size,
          n_tup_ins + n_tup_upd + n_tup_del as row_count,
          pg_indexes_size(schemaname || '.' || tablename) as index_size
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC
        LIMIT 10
      `;

      const tableResult = await client.query(tableQuery);

      return {
        connections: {
          active: parseInt(connStats.active_connections),
          idle: parseInt(connStats.idle_connections),
          total: parseInt(connStats.total_connections),
          max: pool.options.max || 10,
          waiting: parseInt(connStats.waiting_connections)
        },
        queries: {
          total: parseInt(queryStats.total_calls) || 0,
          active: parseInt(connStats.active_connections),
          averageDuration: parseFloat(queryStats.avg_duration) || 0,
          slowQueries: parseInt(queryStats.slow_queries) || 0,
          failedQueries: this.queryTraces.filter(t => t.database === 'postgres' && t.status === 'error').length,
          callsPerSecond: 0 // Would need time-based calculation
        },
        performance: {
          transactionsPerSecond: 0, // Would need time-based calculation
          tuplesFetched: parseInt(perfStats.tuples_fetched) || 0,
          tuplesReturned: parseInt(perfStats.tuples_returned) || 0,
          indexScans: parseInt(perfStats.index_scans) || 0,
          sequentialScans: parseInt(perfStats.sequential_scans) || 0,
          deadlocks: 0 // Would need additional query
        },
        size: {
          databaseSize: 0, // Would need additional query
          tableSizes: tableResult.rows.map(row => ({
            tableName: row.table_name,
            size: parseInt(row.size),
            rowCount: parseInt(row.row_count),
            indexSize: parseInt(row.index_size)
          }))
        },
        locks: {
          waiting: parseInt(connStats.waiting_connections),
          granted: 0, // Would need additional query
          deadlocks: 0 // Would need additional query
        }
      };
    } catch (error) {
      console.error('Error getting PostgreSQL metrics:', error);
      // Return default metrics on error
      return {
        connections: { active: 0, idle: 0, total: 0, max: 10, waiting: 0 },
        queries: { total: 0, active: 0, averageDuration: 0, slowQueries: 0, failedQueries: 0, callsPerSecond: 0 },
        performance: { transactionsPerSecond: 0, tuplesFetched: 0, tuplesReturned: 0, indexScans: 0, sequentialScans: 0, deadlocks: 0 },
        size: { databaseSize: 0, tableSizes: [] },
        locks: { waiting: 0, granted: 0, deadlocks: 0 }
      };
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  private async getRedisMetrics(client: any): Promise<RedisMetrics> {
    try {
      const info = await client.info();
      const infoLines = info.split('\r\n');
      const infoMap: Record<string, string> = {};

      for (const line of infoLines) {
        if (line && !line.startsWith('#')) {
          const [key, value] = line.split(':');
          if (key && value) {
            infoMap[key] = value;
          }
        }
      }

      const connectedClients = parseInt(infoMap.connected_clients) || 0;
      const blockedClients = parseInt(infoMap.blocked_clients) || 0;
      const usedMemory = parseInt(infoMap.used_memory) || 0;
      const peakMemory = parseInt(infoMap.used_memory_peak) || 0;
      const rssMemory = parseInt(infoMap.used_memory_rss) || 0;
      const totalCommands = parseInt(infoMap.total_commands_processed) || 0;
      const totalConnections = parseInt(infoMap.total_connections_received) || 0;
      const keyHits = parseInt(infoMap.keyspace_hits) || 0;
      const keyMisses = parseInt(infoMap.keyspace_misses) || 0;
      const keys = parseInt(infoMap.db0?.split(',')[0]?.split('=')[1] || '0');
      const expires = parseInt(infoMap.db0?.split(',')[1]?.split('=')[1] || '0');

      const hitRate = (keyHits + keyMisses) > 0 ? (keyHits / (keyHits + keyMisses)) * 100 : 0;
      const fragmentation = rssMemory > 0 ? ((usedMemory / rssMemory) * 100) : 0;

      return {
        connections: {
          connected: connectedClients,
          blocked: blockedClients,
          maxConnections: 10000 // Redis default
        },
        memory: {
          used: usedMemory,
          peak: peakMemory,
          rss: rssMemory,
          fragmentation
        },
        operations: {
          commandsPerSecond: 0, // Would need time-based calculation
          totalCommands,
          totalConnections,
          keyHits,
          keyMisses,
          hitRate
        },
        keyspace: {
          keys,
          expires,
          avgTTL: 0 // Would need more detailed parsing
        },
        persistence: {
          lastSave: parseInt(infoMap.lastsave) || 0,
          changesSinceSave: parseInt(infoMap.changes_since_last_save) || 0,
          bgsaveInProgress: infoMap.rdb_bgsave_in_progress === '1'
        }
      };
    } catch (error) {
      console.error('Error getting Redis metrics:', error);
      return {
        connections: { connected: 0, blocked: 0, maxConnections: 10000 },
        memory: { used: 0, peak: 0, rss: 0, fragmentation: 0 },
        operations: { commandsPerSecond: 0, totalCommands: 0, totalConnections: 0, keyHits: 0, keyMisses: 0, hitRate: 0 },
        keyspace: { keys: 0, expires: 0, avgTTL: 0 },
        persistence: { lastSave: 0, changesSinceSave: 0, bgsaveInProgress: false }
      };
    }
  }

  private async getNeo4jMetrics(driver: Driver): Promise<Neo4jMetrics> {
    const session = driver.session();
    try {
      // Get database information
      const nodeCountResult = await session.run('MATCH (n) RETURN count(n) as count');
      const relationshipCountResult = await session.run('MATCH ()-[r]->() RETURN count(r) as count');
      const indexCountResult = await session.run('SHOW INDEXES YIELD * RETURN count(*) as count');

      return {
        connections: {
          active: 1, // Simplified
          idle: 0,
          total: 1,
          max: 100
        },
        queries: {
          total: this.queryTraces.filter(t => t.database === 'neo4j').length,
          averageDuration: this.calculateAverageDuration('neo4j'),
          slowQueries: this.queryTraces.filter(t => t.database === 'neo4j' && t.duration > this.config.thresholds.database.queryTimeWarning).length,
          failedQueries: this.queryTraces.filter(t => t.database === 'neo4j' && t.status === 'error').length
        },
        transactions: {
          open: 0, // Would need actual transaction monitoring
          committed: 0,
          rolledBack: 0,
          committedPerSecond: 0
        },
        database: {
          nodeCount: parseInt(nodeCountResult.records[0].get('count')),
          relationshipCount: parseInt(relationshipCountResult.records[0].get('count')),
          storeSize: 0, // Would need additional query
          indexCount: parseInt(indexCountResult.records[0].get('count'))
        },
        memory: {
          used: 0, // Would need JMX or admin API
          total: 0,
          pageCacheHitRate: 0
        }
      };
    } catch (error) {
      console.error('Error getting Neo4j metrics:', error);
      return {
        connections: { active: 0, idle: 0, total: 0, max: 100 },
        queries: { total: 0, averageDuration: 0, slowQueries: 0, failedQueries: 0 },
        transactions: { open: 0, committed: 0, rolledBack: 0, committedPerSecond: 0 },
        database: { nodeCount: 0, relationshipCount: 0, storeSize: 0, indexCount: 0 },
        memory: { used: 0, total: 0, pageCacheHitRate: 0 }
      };
    } finally {
      await session.close();
    }
  }

  private calculateAverageDuration(database: 'postgres' | 'redis' | 'neo4j'): number {
    const dbQueries = this.queryTraces.filter(t => t.database === database);
    if (dbQueries.length === 0) return 0;
    return dbQueries.reduce((sum, q) => sum + q.duration, 0) / dbQueries.length;
  }

  private updateQueryStats(query: string, duration: number, status: 'success' | 'error'): void {
    const key = this.sanitizeQuery(query);
    const existing = this.queryStats.get(key) || {
      count: 0,
      totalDuration: 0,
      minDuration: duration,
      maxDuration: duration,
      avgDuration: 0,
      errors: 0
    };

    existing.count++;
    existing.totalDuration += duration;
    existing.minDuration = Math.min(existing.minDuration, duration);
    existing.maxDuration = Math.max(existing.maxDuration, duration);
    existing.avgDuration = existing.totalDuration / existing.count;

    if (status === 'error') {
      existing.errors++;
    }

    this.queryStats.set(key, existing);
  }

  private sanitizeQuery(query: string): string {
    // Remove sensitive data and normalize query for grouping
    return query
      .replace(/\b\d+\b/g, '?') // Replace numbers with ?
      .replace(/'[^']*'/g, '?') // Replace string literals with ?
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 200); // Limit length
  }

  private recordQueryMetrics(trace: QueryTrace): void {
    // Record query duration metric
    const queryType = this.inferQueryType(trace.query);
    metricsCollector.setGauge(
      `database.query_duration.${trace.database}.${queryType}`,
      trace.duration,
      'ms',
      {
        status: trace.status,
        ...(trace.tags || {})
      }
    );

    // Record query count
    metricsCollector.incrementCounter(
      `database.queries.${trace.database}`,
      1,
      {
        query_type: queryType,
        status: trace.status
      }
    );

    // Record slow queries
    if (trace.duration > this.config.thresholds.database.queryTimeWarning) {
      metricsCollector.incrementCounter(
        `database.slow_queries.${trace.database}`,
        1,
        { query_type: queryType }
      );
    }
  }

  private inferQueryType(query: string): string {
    const normalized = query.trim().toLowerCase();
    if (normalized.startsWith('select')) return 'select';
    if (normalized.startsWith('insert')) return 'insert';
    if (normalized.startsWith('update')) return 'update';
    if (normalized.startsWith('delete')) return 'delete';
    if (normalized.startsWith('create')) return 'create';
    if (normalized.startsWith('drop')) return 'drop';
    if (normalized.startsWith('alter')) return 'alter';
    if (normalized.startsWith('index')) return 'index';
    if (normalized.startsWith('match')) return 'match'; // Neo4j
    if (normalized.startsWith('create')) return 'create'; // Neo4j
    return 'other';
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupMonitoring(): void {
    if (!this.config.enabled) return;

    this.monitoringInterval = setInterval(async () => {
      try {
        const metrics = await this.getCurrentMetrics();

        // Record metrics in the metrics collector
        this.recordMetrics(metrics);

        // Add to history
        this.metricsHistory.push(metrics);
        if (this.metricsHistory.length > this.maxHistorySize) {
          this.metricsHistory.shift();
        }

        this.emit('metrics', metrics);
      } catch (error) {
        console.error('Error collecting database metrics:', error);
      }
    }, this.config.interval * 3); // Database monitoring less frequent
  }

  private recordMetrics(metrics: DatabaseMetrics): void {
    if (metrics.postgres) {
      const pg = metrics.postgres;
      metricsCollector.setGauge('database.postgres.connections.active', pg.connections.active, 'count');
      metricsCollector.setGauge('database.postgres.connections.idle', pg.connections.idle, 'count');
      metricsCollector.setGauge('database.postgres.queries.average_duration', pg.queries.averageDuration, 'ms');
      metricsCollector.setGauge('database.postgres.queries.slow_queries', pg.queries.slowQueries, 'count');
      metricsCollector.setGauge('database.postgres.locks.waiting', pg.locks.waiting, 'count');
    }

    if (metrics.redis) {
      const redis = metrics.redis;
      metricsCollector.setGauge('database.redis.connections.connected', redis.connections.connected, 'count');
      metricsCollector.setGauge('database.redis.memory.used', redis.memory.used, 'bytes');
      metricsCollector.setGauge('database.redis.operations.hit_rate', redis.operations.hitRate, 'percent');
      metricsCollector.setGauge('database.redis.keyspace.keys', redis.keyspace.keys, 'count');
    }

    if (metrics.neo4j) {
      const neo4j = metrics.neo4j;
      metricsCollector.setGauge('database.neo4j.database.nodes', neo4j.database.nodeCount, 'count');
      metricsCollector.setGauge('database.neo4j.database.relationships', neo4j.database.relationshipCount, 'count');
      metricsCollector.setGauge('database.neo4j.queries.average_duration', neo4j.queries.averageDuration, 'ms');
    }
  }

  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.stopMonitoring();

    // Close all connections
    for (const [name, connection] of this.connections.entries()) {
      try {
        if (connection.database === 'postgres') {
          await (connection as Pool).end();
        } else if (connection.database === 'redis') {
          await connection.quit();
        } else if (connection.database === 'neo4j') {
          await (connection as Driver).close();
        }
      } catch (error) {
        console.error(`Error closing connection ${name}:`, error);
      }
    }

    this.connections.clear();
    this.removeAllListeners();
  }
}

// Singleton instance
export const databaseMonitor = new DatabaseMonitor();