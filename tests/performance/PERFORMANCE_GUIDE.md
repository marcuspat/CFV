# Performance Testing Guide

## Overview

This guide provides comprehensive instructions for running and interpreting performance tests for the Cognitive Fabric Visualizer system.

## Prerequisites

### System Requirements

- **Node.js**: 18+ with `--expose-gc` flag for memory profiling
- **RAM**: Minimum 4GB, recommended 8GB+
- **CPU**: Multi-core processor recommended
- **Disk**: At least 10GB free space for test data and reports

### Environment Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Database Setup** (optional for database tests):
   - PostgreSQL running on localhost:5432
   - Neo4j running on localhost:7687
   - Redis running on localhost:6379

3. **Server Running**:
   ```bash
   npm run dev
   ```

4. **Environment Variables** (optional):
   ```bash
   export TEST_BASE_URL="http://localhost:3000"
   export TEST_WS_URL="ws://localhost:3000"
   export POSTGRES_HOST="localhost"
   export POSTGRES_PORT="5432"
   export POSTGRES_DB="cfv_test"
   export POSTGRES_USER="postgres"
   export POSTGRES_PASSWORD="password"
   export NEO4J_URI="bolt://localhost:7687"
   export NEO4J_USER="neo4j"
   export NEO4J_PASSWORD="password"
   export REDIS_URL="redis://localhost:6379"
   export OUTPUT_DIR="./tests/performance/reports"
   ```

## Running Performance Tests

### Quick Start

```bash
# Run comprehensive performance test suite
npm run test:performance:comprehensive

# Run only load testing
npm run test:performance:load

# Run only stress testing
npm run test:performance:stress

# Run only database performance tests
npm run test:performance:database

# Run only memory profiling
npm run test:performance:memory

# Run only Artillery tests
npm run test:performance:artillery
```

### Advanced Usage

#### Custom Configuration

```bash
# Custom base URL
tsx tests/performance/run-performance-tests.ts --base-url "http://localhost:8080"

# Custom output directory
tsx tests/performance/run-performance-tests.ts --output-dir "./custom-reports"

# Skip specific test categories
tsx tests/performance/run-performance-tests.ts --skip-memory --skip-artillery
```

#### Individual Test Execution

```bash
# Memory profiling with Node.js GC enabled
node --expose-gc tests/performance/run-performance-tests.ts --skip-load --skip-stress --skip-database --skip-artillery

# Database performance only
tsx tests/performance/run-performance-tests.ts --skip-load --skip-stress --skip-memory --skip-artillery

# Stress testing with custom configuration
TEST_BASE_URL="http://production-server" tsx tests/performance/run-performance-tests.ts --skip-load --skip-memory --skip-database --skip-artillery
```

## Test Categories

### 1. Load Testing

**Purpose**: Measure system performance under expected and peak user loads

**Scenarios**:
- **Light Load**: 10 concurrent users, 30 seconds
- **Moderate Load**: 50 concurrent users, 60 seconds
- **Heavy Load**: 100 concurrent users, 60 seconds

**Metrics Collected**:
- Response times (avg, p95, p99)
- Throughput (requests/second)
- Error rates
- Resource utilization

**Interpretation**:
- ✅ **Good**: p95 < 200ms, error rate < 1%
- ⚠️ **Warning**: p95 200-500ms, error rate 1-5%
- ❌ **Critical**: p95 > 500ms, error rate > 5%

### 2. Stress Testing

**Purpose**: Find system limits and failure points

**Scenarios**:
- HTTP connection stress (up to 500 concurrent connections)
- WebSocket stress (up to 100 concurrent connections)
- Memory pressure tests
- CPU intensive operations
- Database connection exhaustion

**Metrics Collected**:
- Maximum sustainable load
- System degradation patterns
- Recovery capabilities
- Resource exhaustion points

**Interpretation**:
- ✅ **Resilient**: System degrades gracefully, recovers automatically
- ⚠️ **Concerning**: System shows performance degradation but recovers
- ❌ **Fragile**: System crashes or fails to recover

### 3. Database Performance Testing

**Purpose**: Evaluate database query performance and connection handling

**Tests**:
- PostgreSQL query performance
- Neo4j graph traversal performance
- Redis caching performance
- Connection pool efficiency
- Concurrent database operations

**Metrics Collected**:
- Query execution times
- Connection pool utilization
- Database-specific metrics
- Concurrent operation performance

**Targets**:
- PostgreSQL queries: < 100ms average
- Neo4j traversals: < 200ms average
- Redis operations: < 10ms average
- Connection pool: > 90% efficiency

### 4. Memory Profiling

**Purpose**: Detect memory leaks and analyze memory usage patterns

**Tests**:
- Memory growth monitoring
- Garbage collection analysis
- Heap snapshot analysis
- Memory leak detection

**Metrics Collected**:
- Heap usage trends
- Object count growth
- GC pause times
- Memory leak indicators

**Interpretation**:
- ✅ **Healthy**: Stable memory usage, minimal leaks
- ⚠️ **Warning**: Gradual memory growth, minor leaks
- ❌ **Critical**: Rapid memory growth, significant leaks

### 5. Artillery Load Testing

**Purpose**: Professional HTTP load testing with realistic scenarios

**Configuration**: Located in `tests/performance/scenarios/load-test-config.yml`

**Features**:
- Realistic user behavior simulation
- Multiple API endpoint testing
- Authentication flow testing
- Custom load patterns

**Usage**:
```bash
# Edit configuration as needed
vim tests/performance/scenarios/load-test-config.yml

# Run Artillery test
npm run test:load

# View detailed report
artillery report tests/performance/scenarios/load-test-config.yml
```

## Understanding Results

### Report Locations

All performance test reports are generated in `./tests/performance/reports/`:

- **HTML Reports**: Interactive visualizations (`.html`)
- **JSON Data**: Machine-readable metrics (`.json`)
- **CSV Export**: Spreadsheet analysis (`.csv`)
- **Markdown Summary**: Textual overview (`.md`)

### Key Performance Indicators

#### Response Time Percentiles
- **P50**: Median response time
- **P95**: 95th percentile (95% of requests faster than this)
- **P99**: 99th percentile (worst-case performance)

#### Throughput Metrics
- **RPS**: Requests per second
- **Concurrent Users**: Simultaneous active users
- **Success Rate**: Percentage of successful requests

#### Resource Metrics
- **CPU Usage**: System processor utilization
- **Memory Usage**: RAM consumption
- **Database Connections**: Active database connections

### Performance Scoring System

The performance test suite calculates an overall score (0-100):

- **90-100**: Excellent performance
- **75-89**: Good performance with minor issues
- **60-74**: Acceptable performance with concerns
- **< 60**: Poor performance requiring optimization

### Exit Codes

- **0**: All tests passed
- **1**: Tests failed (system needs optimization)
- **2**: Tests completed with warnings
- **3**: Fatal error during testing
- **4**: Unhandled promise rejection
- **5**: Uncaught exception
- **130**: User interruption
- **143**: Process termination

## Troubleshooting

### Common Issues

#### "Server not running" Error
```bash
# Start the development server
npm run dev

# Or check if server is running on different port
curl http://localhost:3000/health
```

#### Database Connection Errors
```bash
# Check PostgreSQL
psql -h localhost -U postgres -d cfv_test

# Check Neo4j
cypher-shell -u neo4j -p password

# Check Redis
redis-cli ping
```

#### Permission Errors
```bash
# Ensure output directory exists and is writable
mkdir -p tests/performance/reports
chmod 755 tests/performance/reports
```

#### Memory Issues
```bash
# Run with increased Node.js memory limit
node --max-old-space-size=4096 tests/performance/run-performance-tests.ts

# Enable garbage collection for better memory profiling
node --expose-gc tests/performance/run-performance-tests.ts
```

### Performance Issues

#### High Response Times
1. Check system resource utilization
2. Review database query performance
3. Analyze memory usage patterns
4. Check network latency

#### High Error Rates
1. Review server logs for errors
2. Check database connectivity
3. Verify authentication configuration
4. Analyze request patterns

#### Memory Leaks
1. Run memory profiling with `--expose-gc`
2. Review heap snapshots
3. Check for event listener leaks
4. Analyze object retention patterns

## Best Practices

### Before Running Tests
1. Ensure system meets minimum requirements
2. Close unnecessary applications
3. Verify server and database connectivity
4. Set appropriate environment variables

### During Testing
1. Monitor system resources
2. Avoid interrupting tests prematurely
3. Check test logs for warnings/errors
4. Allow adequate time for completion

### After Testing
1. Review all generated reports
2. Analyze performance trends
3. Address identified issues
4. Schedule regular performance tests

### Continuous Integration
1. Include performance tests in CI/CD pipeline
2. Set performance thresholds and alerts
3. Track performance over time
4. Optimize based on test results

## Performance Optimization

Based on test results, consider these optimization strategies:

### Database Optimization
- Add appropriate indexes
- Optimize query patterns
- Implement connection pooling
- Use caching strategies

### Application Optimization
- Implement response caching
- Optimize algorithms and data structures
- Reduce memory allocations
- Improve error handling

### Infrastructure Optimization
- Scale horizontally (load balancers)
- Scale vertically (more resources)
- Use CDNs for static assets
- Implement monitoring and alerting

### Code Optimization
- Profile hot paths
- Optimize critical loops
- Reduce object creation
- Implement lazy loading

## Support

For issues or questions about performance testing:

1. Check this guide for common solutions
2. Review generated test reports for details
3. Check server and application logs
4. Consult the development team

---

**Note**: Performance testing should be run regularly to catch regressions and ensure optimal system performance.