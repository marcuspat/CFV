# Cognitive Fabric Visualizer - Demo System

This comprehensive demo system provides end-to-end validation of the Cognitive Fabric Visualizer with real data processing, performance metrics, and success criteria validation.

## Quick Start

### Prerequisites
- Node.js 18+
- Running Cognitive Fabric Visualizer server (localhost:3000)
- Database connectivity
- ML pipeline availability

### Installation
```bash
cd scripts
npm install
```

### Running Demos

#### Quick Demo (1 conversation)
```bash
npm run demo:quick
```

#### Standard Demo (3 conversations)
```bash
npm run demo
```

#### Full Demo (5 conversations with verbose logging)
```bash
npm run demo:full
```

#### Benchmark Demo (10 conversations)
```bash
npm run demo:benchmark
```

## Demo Components

### 1. Main Demo Script (`demo.js`)
Orchestrates the complete demo workflow:
- System health verification
- Sample data generation
- Conversation processing through API
- Visualization generation
- Results export
- Performance metrics collection
- Validation against success criteria

### 2. Health Check System (`demo/health-check.js`)
Verifies all system components:
- Server connectivity and response times
- Database availability
- ML pipeline status
- WebSocket connectivity
- API endpoint accessibility
- File system permissions

### 3. Sample Data Generator (`data/sample-generator.js`)
Generates realistic conversations with:
- Multiple cognitive dimensions (factual, logical, creative, metacognitive)
- Configurable complexity levels
- Realistic dialogue patterns
- Measurable cognitive analysis scores
- Diverse topics and contexts

### 4. Metrics Collector (`metrics/metrics-collector.js`)
Collects comprehensive performance metrics:
- Processing time measurements
- Memory and CPU usage tracking
- API response times
- Cognitive accuracy scores
- Visualization performance
- System resource utilization

### 5. Validation System (`validation/demo-validator.js`)
Validates results against project specifications:
- Performance threshold compliance
- Cognitive accuracy targets (≥92% factual, ≥85% logical, ≥0.60 creative, ≥0.96 metacognitive)
- Output file validation
- End-to-end integration verification

### 6. Logging System (`utils/demo-logger.js`)
Provides comprehensive logging:
- Multiple output levels (error, warn, info, debug)
- Console and file output
- Performance tracking
- Structured metadata
- Export capabilities

## Configuration

Demo behavior is controlled by `config/demo-config.js`:

### Performance Thresholds
```javascript
performanceThresholds: {
  maxProcessingTime: 5000,        // ms - cognitive decomposition
  minRenderingFPS: 120,           // FPS for 3D visualization
  maxApiResponseTime: 100,        // ms for API calls
  maxMemoryUsage: '2GB'          // Maximum memory usage
}
```

### Cognitive Accuracy Targets
```javascript
cognitiveTargets: {
  factualAccuracy: 0.92,          // ≥92% accuracy
  logicalPrecision: 0.85,         // ≥85% precision
  creativeRougeL: 0.60,           // ≥0.60 ROUGE-L
  metacognitiveF1: 0.96           // ≥0.96 F1-score
}
```

## Command Line Options

```bash
node demo.js [options]

Options:
  -c, --config <path>     Configuration file path
  -o, --output <path>     Output directory for reports
  -n, --conversations <num>  Number of conversations to process
  -v, --verbose           Enable verbose logging
  --skip-validation       Skip final validation step
  --help                  Show help
```

## Demo Output

The demo generates comprehensive output:

### Console Output
Real-time progress with:
- Phase completion status
- Performance metrics
- Cognitive analysis results
- Validation outcomes
- Error reporting

### Reports
- **JSON Report**: Complete detailed results (`demo-report-{timestamp}.json`)
- **Markdown Summary**: Human-readable summary (`demo-summary-{timestamp}.md`)
- **Log Files**: Detailed execution logs (`demo.log`)

### Exported Files
- Conversation data in JSON format
- Cognitive analysis results
- Visualization metadata
- Performance metrics
- Validation reports

## Success Criteria

The demo validates against project specifications:

### Performance Targets
- ✅ Processing time: ≤5 seconds per conversation
- ✅ API response time: ≤100ms
- ✅ Visualization rendering: ≥120 FPS
- ✅ Memory usage: ≤2GB

### Cognitive Accuracy
- ✅ Factual retrieval: ≥92% accuracy
- ✅ Logical inference: ≥85% precision
- ✅ Creative synthesis: ≥0.60 ROUGE-L
- ✅ Meta-cognition: ≥0.96 F1-score

### System Integration
- ✅ All API endpoints functional
- ✅ Database connectivity maintained
- ✅ ML pipeline operational
- ✅ File exports successful

## Example Output

```
🚀 Starting Cognitive Fabric Visualizer Demo
Configuration: {"conversations": 3, "verbose": true}

🔄 Starting Phase: System Health Check
🔍 Performing comprehensive system health check...
  📡 Checking server connectivity...
    ✅ Server healthy (45ms response time)
  🗄️  Checking database connectivity...
    ✅ Database connected (23ms)
  🧠 Checking ML pipeline availability...
    ✅ ML pipeline available (5 models loaded)
  🔌 Checking WebSocket connectivity...
    ✅ WebSocket connected
✅ Phase completed: System Health Check

🔄 Starting Phase: Sample Data Generation
Generating 3 sample conversations...
Generated 3 conversations
Cognitive Analysis Targets:
  Factual: 0.915 (target: ≥0.92)
  Logical: 0.862 (target: ≥0.85)
  Creative: 0.634 (target: ≥0.60)
  Metacognitive: 0.958 (target: ≥0.96)
✅ Phase completed: Sample Data Generation

[... additional phases ...]

📋 Validation Report
==================================================
Overall Status: ✅ PASSED
Validated At: 2024-01-18T10:30:45.123Z

Summary:
  Total Checks: 15
  Passed: 14
  Failed: 0
  Warnings: 1
  Success Rate: 93%

Categories:
  ✅ Performance: 5/5 passed
  ✅ Cognitive: 4/4 passed
  ⚠️  Outputs: 3/4 passed
  ✅ Integration: 3/3 passed
==================================================

📊 Reports generated:
  Detailed: /workspaces/cfv/scripts/reports/demo-report-1705566645123.json
  Summary:  /workspaces/cfv/scripts/reports/demo-summary-1705566645123.md

✅ Demo completed successfully
```

## Troubleshooting

### Common Issues

1. **Server Unavailable**
   ```
   ❌ Server unavailable: connect ECONNREFUSED 127.0.0.1:3000
   ```
   - Start the server: `npm run dev` from project root
   - Check port 3000 is available

2. **Database Connection Failed**
   ```
   ❌ Database unavailable: Connection timeout
   ```
   - Verify database server is running
   - Check database configuration

3. **ML Pipeline Unavailable**
   ```
   ❌ ML pipeline unavailable: Service not found
   ```
   - Start ML service: check ML pipeline startup script
   - Verify model files are available

4. **Permission Errors**
   ```
   ❌ File system error: EACCES: permission denied
   ```
   - Check file system permissions
   - Ensure output directory is writable

### Debug Mode

Run with verbose logging for detailed debugging:
```bash
npm run demo:full
```

### Health Check Only

Check system health without running full demo:
```bash
npm run health
```

## Development

### Adding New Validation Checks

1. Add check method to `validation/demo-validator.js`
2. Update configuration thresholds
3. Test with sample data

### Extending Sample Data

1. Add new templates to `data/sample-generator.js`
2. Update cognitive analysis logic
3. Validate score distributions

### Custom Metrics

1. Extend `metrics/metrics-collector.js`
2. Add new collection methods
3. Update reporting format

## Architecture

```
scripts/
├── demo.js                    # Main orchestrator
├── config/
│   └── demo-config.js        # Configuration settings
├── demo/
│   └── health-check.js       # System health verification
├── data/
│   └── sample-generator.js   # Conversation generation
├── metrics/
│   └── metrics-collector.js  # Performance monitoring
├── validation/
│   └── demo-validator.js     # Success criteria validation
├── utils/
│   └── demo-logger.js        # Logging system
├── reports/                  # Generated reports
├── logs/                     # Log files
└── exports/                  # Exported data
```

## Contributing

1. Follow the existing code style
2. Add comprehensive error handling
3. Include performance metrics
4. Update documentation
5. Test with various configurations

---

**Generated by Cognitive Fabric Visualizer Demo System v1.0.0**