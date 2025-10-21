/**
 * Performance Monitoring Dashboard
 * Real-time visualization of system performance metrics and alerts
 */

import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface MonitoringData {
  timestamp: number;
  health: {
    overall: number;
    availability: number;
    performance: number;
    status: string;
  };
  metrics: {
    system: any;
    network: any;
    database: any;
    agents: any;
    api: any;
  };
  performance: any;
  alerts: {
    active: number;
    critical: number;
    warning: number;
    recent: any[];
  };
  trends: {
    performance: any[];
    resource: any;
    network: any;
    agents: any;
  };
}

const MonitoringDashboard: React.FC = () => {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'system' | 'api' | 'database' | 'agents'>('overview');
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h');
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchMonitoringData();

    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchMonitoringData, 30000); // Refresh every 30 seconds
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, timeRange]);

  const fetchMonitoringData = async () => {
    try {
      const response = await fetch('/api/monitoring/overview');
      if (!response.ok) {
        throw new Error('Failed to fetch monitoring data');
      }
      const monitoringData = await response.json();
      setData(monitoringData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = (score: number): string => {
    if (score >= 90) return '#10b981'; // green
    if (score >= 75) return '#f59e0b'; // yellow
    if (score >= 60) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'excellent': return '#10b981';
      case 'good': return '#3b82f6';
      case 'fair': return '#f59e0b';
      case 'poor': return '#f97316';
      case 'critical': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading monitoring data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="text-red-400">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading monitoring data</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <button
              onClick={fetchMonitoringData}
              className="mt-2 bg-red-100 text-red-800 px-3 py-1 rounded text-sm hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Performance Monitoring</h1>
        <div className="flex items-center space-x-4">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1 rounded text-sm ${
              autoRefresh
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            Auto Refresh: {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={fetchMonitoringData}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
          >
            Refresh Now
          </button>
        </div>
      </div>

      {/* Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">Overall Health</p>
              <div className="flex items-center mt-2">
                <div
                  className="text-2xl font-bold"
                  style={{ color: getHealthColor(data.health.overall) }}
                >
                  {data.health.overall}%
                </div>
                <span
                  className="ml-2 px-2 py-1 rounded text-xs font-medium"
                  style={{ backgroundColor: getStatusColor(data.health.status) + '20', color: getStatusColor(data.health.status) }}
                >
                  {data.health.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <p className="text-sm font-medium text-gray-600">Availability</p>
          <div className="flex items-center mt-2">
            <div
              className="text-2xl font-bold"
              style={{ color: getHealthColor(data.health.availability) }}
            >
              {data.health.availability}%
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <p className="text-sm font-medium text-gray-600">Performance</p>
          <div className="flex items-center mt-2">
            <div
              className="text-2xl font-bold"
              style={{ color: getHealthColor(data.health.performance) }}
            >
              {data.health.performance}%
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <p className="text-sm font-medium text-gray-600">Active Alerts</p>
          <div className="flex items-center mt-2">
            <div className="text-2xl font-bold text-red-600">{data.alerts.active}</div>
            <div className="ml-4 text-sm">
              <div className="text-red-600">{data.alerts.critical} Critical</div>
              <div className="text-yellow-600">{data.alerts.warning} Warning</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {['overview', 'system', 'api', 'database', 'agents'].map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                selectedTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {selectedTab === 'overview' && (
        <div className="space-y-6">
          {/* Performance Trends */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Trends</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.trends.performance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTime}
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleString()}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="Performance Score"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Resource Usage */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-4">System Resources</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'CPU', value: data.metrics.system.cpu?.usage || 0 },
                      { name: 'Memory', value: data.metrics.system.memory?.usage || 0 },
                      { name: 'Disk', value: data.metrics.system.disk?.usage || 0 }
                    ]}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value.toFixed(1)}%`}
                  >
                    <Cell fill="#3b82f6" />
                    <Cell fill="#10b981" />
                    <Cell fill="#f59e0b" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Alert Distribution</h3>
              <ResponsiveContainer width="100%" height={250}>
              <BarChart data={[
                { name: 'Critical', value: data.alerts.critical, fill: '#ef4444' },
                { name: 'Warning', value: data.alerts.warning, fill: '#f59e0b' },
                { name: 'Info', value: data.alerts.active - data.alerts.critical - data.alerts.warning, fill: '#3b82f6' }
              ]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Alerts */}
        {data.alerts.recent.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Alerts</h3>
            <div className="space-y-2">
              {data.alerts.recent.map((alert, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                  style={{ borderColor: getStatusColor(alert.severity) + '30' }}
                >
                  <div className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-3"
                      style={{ backgroundColor: getStatusColor(alert.severity) }}
                    />
                    <div>
                      <div className="font-medium text-gray-900">{alert.title}</div>
                      <div className="text-sm text-gray-500">{alert.description}</div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(alert.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )}

    {selectedTab === 'system' && (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">CPU Usage</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm">
                  <span>Current Usage</span>
                  <span>{data.metrics.system.cpu?.usage?.toFixed(1) || 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${data.metrics.system.cpu?.usage || 0}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Load Average:</span>
                  <span className="ml-2">{data.metrics.system.cpu?.loadAverage?.[0]?.toFixed(2) || 0}</span>
                </div>
                <div>
                  <span className="text-gray-600">Cores:</span>
                  <span className="ml-2">{data.metrics.system.cpu?.cores || 0}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Memory Usage</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm">
                  <span>Memory Usage</span>
                  <span>{data.metrics.system.memory?.usage?.toFixed(1) || 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{ width: `${data.metrics.system.memory?.usage || 0}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Used:</span>
                  <span className="ml-2">{formatBytes(data.metrics.system.memory?.used || 0)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Total:</span>
                  <span className="ml-2">{formatBytes(data.metrics.system.memory?.total || 0)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Disk Usage</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm">
                <span>Disk Usage</span>
                <span>{data.metrics.system.disk?.usage?.toFixed(1) || 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-yellow-600 h-2 rounded-full"
                  style={{ width: `${data.metrics.system.disk?.usage || 0}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Used:</span>
                <span className="ml-2">{formatBytes(data.metrics.system.disk?.used || 0)}</span>
              </div>
              <div>
                <span className="text-gray-600">Free:</span>
                <span className="ml-2">{formatBytes(data.metrics.system.disk?.free || 0)}</span>
              </div>
              <div>
                <span className="text-gray-600">Total:</span>
                <span className="ml-2">{formatBytes(data.metrics.system.disk?.total || 0)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

    {selectedTab === 'api' && (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">API Performance</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-gray-600">Requests/sec</div>
              <div className="text-2xl font-bold">{data.metrics.api?.requests?.perSecond?.toFixed(1) || 0}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Avg Response Time</div>
              <div className="text-2xl font-bold">{(data.metrics.api?.responses?.averageTime || 0).toFixed(0)}ms</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Error Rate</div>
              <div className="text-2xl font-bold text-red-600">{(data.metrics.api?.errors?.rate || 0).toFixed(1)}%</div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Response Time Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={[
              { percentile: 'P50', time: data.metrics.api?.responses?.timeDistribution?.p50 || 0 },
              { percentile: 'P75', time: data.metrics.api?.responses?.timeDistribution?.p75 || 0 },
              { percentile: 'P90', time: data.metrics.api?.responses?.timeDistribution?.p90 || 0 },
              { percentile: 'P95', time: data.metrics.api?.responses?.timeDistribution?.p95 || 0 },
              { percentile: 'P99', time: data.metrics.api?.responses?.timeDistribution?.p99 || 0 }
            ]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="percentile" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="time" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    )}

    {selectedTab === 'database' && (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Database Performance</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.metrics.database?.postgres && (
              <div>
                <h4 className="font-medium text-gray-700 mb-3">PostgreSQL</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Active Connections:</span>
                    <span>{data.metrics.database.postgres.connections.active}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Query Time (avg):</span>
                    <span>{data.metrics.database.postgres.queries.averageDuration.toFixed(1)}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Slow Queries:</span>
                    <span className="text-red-600">{data.metrics.database.postgres.queries.slowQueries}</span>
                  </div>
                </div>
              </div>
            )}
            {data.metrics.database?.redis && (
              <div>
                <h4 className="font-medium text-gray-700 mb-3">Redis</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Connected Clients:</span>
                    <span>{data.metrics.database.redis.connections.connected}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Memory Used:</span>
                    <span>{formatBytes(data.metrics.database.redis.memory.used)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Hit Rate:</span>
                    <span>{data.metrics.database.redis.operations.hitRate.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {selectedTab === 'agents' && (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Agent Coordination</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <div className="text-sm text-gray-600">Active Agents</div>
              <div className="text-2xl font-bold">{data.metrics.agents?.agents?.filter((a: any) => a.status === 'active' || a.status === 'busy').length || 0}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Coordination Overhead</div>
              <div className="text-2xl font-bold">{(data.metrics.agents?.coordination?.overhead?.average || 0).toFixed(1)}ms</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Tasks/sec</div>
              <div className="text-2xl font-bold">{(data.metrics.agents?.performance?.throughput?.tasksPerSecond || 0).toFixed(1)}</div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Agent Status</h3>
          <div className="space-y-2">
            {data.metrics.agents?.agents?.map((agent: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center">
                  <div
                    className={`w-3 h-3 rounded-full mr-3 ${
                      agent.status === 'active' ? 'bg-green-500' :
                      agent.status === 'busy' ? 'bg-yellow-500' :
                      agent.status === 'error' ? 'bg-red-500' : 'bg-gray-500'
                    }`}
                  />
                  <div>
                    <div className="font-medium">{agent.type} - {agent.id}</div>
                    <div className="text-sm text-gray-500">
                      Tasks: {agent.tasksCompleted} completed, {agent.tasksFailed} failed
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  Avg Time: {agent.averageTaskTime.toFixed(0)}ms
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
  </div>
);
};

export default MonitoringDashboard;