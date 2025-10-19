# Testing Strategy - Cognitive Fabric Visualizer

This document outlines the comprehensive testing strategy for the Cognitive Fabric Visualizer project, designed to ensure system reliability, performance, and accuracy across all components.

## Overview

The testing suite provides **>80% code coverage** and validates all critical aspects of the system including cognitive accuracy targets, rendering performance (240 FPS), API response times (<100ms), and system reliability under load.

## Test Structure

```
tests/
├── unit/                    # Unit tests (>80% coverage)
│   ├── cognitive/          # Cognitive dimension analyzers
│   ├── api/               # API endpoints
│   ├── components/        # Frontend components
│   ├── ml/                # ML model validation
│   └── performance/       # Performance benchmarks
├── integration/            # Integration tests
│   └── cognitive-pipeline/
├── e2e/                    # End-to-end tests (Playwright)
│   ├── user-workflows.spec.ts
│   └── visualization-performance.spec.ts
├── performance/            # Performance validation
│   ├── rendering-performance.test.ts
│   └── api-performance.test.ts
├── ml/                     # ML model accuracy tests
│   └── model-accuracy.test.ts
├── load/                   # Load testing (Artillery)
│   ├── load-test.yml
│   ├── stress-test.yml
│   └── load-test-runner.js
├── fixtures/               # Test data
│   └── cognitive-data.ts
└── helpers/               # Test utilities
    └── setup.ts
```

## Performance Targets

### Cognitive Analysis Accuracy
- **Factual Retrieval**: ≥92% accuracy with knowledge graph integration
- **Logical Inference**: ≥85% precision with causal link identification
- **Creative Synthesis**: ≥0.60 ROUGE-L with neuro-symbolic AI
- **Meta-Cognition**: ≥0.96 F1-score with multi-modal processing

### System Performance
- **API Response Time**: <100ms for most queries
- **Cognitive Decomposition**: <5 seconds per conversation
- **Graph Generation**: <3 seconds for 100-node graphs
- **Visualization Rendering**: 120-240 FPS for complex cognitive maps

### Rendering Performance
- **Small Graphs**: 240 FPS target, 120 FPS minimum
- **Medium Graphs** (100 nodes): 120 FPS target, 60 FPS minimum
- **Large Graphs** (500+ nodes): 60 FPS minimum with optimization

## Running Tests

### Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test categories
npm run test:unit          # Unit tests only
npm run test:integration    # Integration tests only
npm run test:e2e           # End-to-end tests only
npm run test:performance   # Performance tests only
npm run test:ml            # ML model tests only
npm run test:load          # Load tests
```

### With Coverage

```bash
# Run tests with coverage report
npm run test:coverage

# Coverage targets by component
- Overall: 80%
- Cognitive components: 90%
- ML components: 85%
```

### CI/CD Pipeline

```bash
# Full CI test suite (used by GitHub Actions)
npm run test:ci

# Production build test
npm run test:prod
```

## Test Categories

### 1. Unit Tests

**Purpose**: Test individual functions and components in isolation.

**Coverage**: >80% statements, branches, functions, lines

**Key Test Files**:
- `tests/unit/cognitive/factual-retrieval.test.ts` - Validates 92% accuracy target
- `tests/unit/cognitive/logical-inference.test.ts` - Validates 85% precision target
- `tests/unit/cognitive/creative-synthesis.test.ts` - Validates 0.60 ROUGE-L target
- `tests/unit/cognitive/metacognition.test.ts` - Validates 0.96 F1-score target
- `tests/unit/components/CognitiveVisualization.test.tsx` - React component tests
- `tests/unit/api/cognitive-api.test.ts` - API endpoint tests

**Example Usage**:
```bash
npm run test:unit -- --testNamePattern="accuracy"
npm run test:unit -- --testPathPattern="factual-retrieval"
```

### 2. Integration Tests

**Purpose**: Test interaction between components and external dependencies.

**Key Areas**:
- End-to-end cognitive analysis pipeline
- Database integration (PostgreSQL + Neo4j)
- LLM API integration and fallback handling
- Real-time WebSocket connections
- Multi-service communication

**Example**:
```bash
npm run test:integration
```

### 3. End-to-End Tests (Playwright)

**Purpose**: Test complete user workflows in browser environment.

**Browser Support**: Chrome, Firefox, Safari, Mobile Chrome, Mobile Safari

**Key Workflows**:
- User registration and authentication
- Complete cognitive analysis process
- Interactive 3D graph exploration
- Dashboard analytics and reporting
- Mobile responsive design

**Example**:
```bash
npm run test:e2e
npm run playwright:install  # Install browsers
```

### 4. Performance Tests

**Purpose**: Validate performance targets and identify bottlenecks.

**Rendering Performance**:
- Frame rate measurement (240 FPS target)
- Memory usage optimization
- WebGL vs Canvas2D performance
- Level-of-detail rendering

**API Performance**:
- Response time validation (<100ms)
- Concurrent request handling
- Memory leak detection
- Database query optimization

**Example**:
```bash
npm run test:performance
```

### 5. ML Model Accuracy Tests

**Purpose**: Validate cognitive dimension accuracy against ground truth.

**Accuracy Validation**:
- Factual Retrieval: 92% accuracy on validation dataset
- Logical Inference: 85% precision on argument mining
- Creative Synthesis: 0.60 ROUGE-L on abstractive summarization
- Meta-Cognition: 0.96 F1-score on multi-modal detection

**Continuous Learning**:
- Model improvement tracking
- Cross-validation testing
- Performance degradation monitoring

**Example**:
```bash
npm run test:ml
npm run test:accuracy  # Focus on accuracy metrics only
```

### 6. Load Tests

**Purpose**: Validate system behavior under high concurrent load.

**Load Testing Scenarios**:
- 50-1000 concurrent users
- Sustained load testing (10+ minutes)
- Spike testing (sudden traffic increases)
- Stress testing (system breaking points)

**Performance Thresholds**:
- P99 latency < 5 seconds
- Error rate < 5%
- Memory usage < 500MB
- CPU usage < 80%

**Example**:
```bash
# Run standard load test
npm run test:load

# Run stress test
cd tests/load
node load-test-runner.js stress-test.yml

# Custom load test
artillery run tests/load/load-test.yml --target http://localhost:3000
```

## Quality Gates

### Automated Quality Checks

The CI/CD pipeline includes automated quality gates that block merging if:

1. **Code Coverage < 80%**: Insufficient test coverage
2. **Performance Targets Not Met**: Fails FPS or latency thresholds
3. **Security Vulnerabilities**: High/critical vulnerabilities detected
4. **Cognitive Accuracy < Targets**: ML models don't meet accuracy requirements
5. **Build Failures**: Tests fail to pass

### Quality Gate Configuration

The quality gate is configured in `.github/workflows/quality-gate.yml` and includes:

- **Coverage Check**: Minimum 80% code coverage
- **Performance Check**: 120+ FPS average, <16.67ms render time
- **Security Check**: Zero high/critical vulnerabilities
- **Code Quality Check**: Zero errors, maximum 10 warnings

### Manual Quality Reviews

For major releases, manual reviews include:

1. **Cognitive Accuracy Review**: Validate against human-expert labeled datasets
2. **Performance Review**: Verify real-world performance meets targets
3. **Security Review**: Third-party security assessment
4. **Usability Review**: User experience testing and feedback

## Test Data and Fixtures

### Test Data Structure

Test fixtures are organized in `tests/fixtures/cognitive-data.ts`:

```typescript
export const sampleConversations = {
  factualRetrieval: {
    text: "Based on research from MIT...",
    expectedDimensions: { factualRetrieval: 0.92, ... }
  },
  logicalInference: {
    text: "If all cognitive systems require...",
    expectedDimensions: { logicalInference: 0.85, ... }
  }
  // ... more test cases
};
```

### Performance Benchmarks

Performance targets are defined in `tests/fixtures/cognitive-data.ts`:

```typescript
export const performanceTargets = {
  factualRetrieval: { accuracy: 0.92, precision: 0.90, ... },
  logicalInference: { accuracy: 0.85, precision: 0.83, ... },
  // ... more targets
};

export const performanceBenchmarks = {
  rendering: { targetFPS: 240, minAcceptableFPS: 120, ... },
  api: { maxResponseTime: 100, ... }
};
```

## Continuous Integration

### GitHub Actions Workflow

The CI pipeline (`.github/workflows/ci-cd.yml`) runs:

1. **Code Quality**: ESLint, TypeScript checking, security audit
2. **Unit Tests**: All unit tests with coverage reporting
3. **Integration Tests**: Database and service integration
4. **E2E Tests**: Browser-based user workflow testing
5. **Performance Tests**: Rendering and API performance validation
6. **ML Validation**: Cognitive accuracy model testing
7. **Load Tests**: System behavior under load (main branch only)

### Test Reporting

- **Coverage Reports**: Uploaded to Codecov
- **Test Results**: JSON and HTML reports
- **Performance Metrics**: Artifacts with detailed performance data
- **Load Test Results**: Artillery reports with visualizations

## Local Development

### Test Environment Setup

```bash
# Install dependencies
npm install

# Setup test databases
docker-compose -f docker-compose.test.yml up -d

# Run database migrations
npm run db:migrate:test

# Install Playwright browsers
npx playwright install

# Run tests
npm test
```

### Debugging Tests

```bash
# Run tests in watch mode
npm run test:watch

# Run specific test with debugging
node --inspect-brk node_modules/.bin/jest --testNamePattern="factual-retrieval"

# Run E2E tests with debugging
npx playwright test --debug
```

### Performance Profiling

```bash
# Run performance tests with profiling
npm run test:performance -- --profile

# Generate performance report
npm run test:performance -- --report
```

## Best Practices

### Writing Tests

1. **Arrange-Act-Assert Pattern**: Structure tests clearly
2. **Descriptive Names**: Test names should explain what and why
3. **Independent Tests**: No test should depend on another
4. **Mock External Dependencies**: Keep tests fast and reliable
5. **Test Edge Cases**: Include boundary conditions and error scenarios

### Performance Testing

1. **Set Clear Targets**: Define acceptable performance thresholds
2. **Measure Consistently**: Use consistent measurement methods
3. **Test Realistic Scenarios**: Use realistic data and user patterns
4. **Monitor Resources**: Track memory, CPU, and network usage
5. **Regression Testing**: Prevent performance degradation

### CI/CD Integration

1. **Fast Feedback**: Quick test results for developers
2. **Comprehensive Validation**: Full testing on merge/PR
3. **Quality Gates**: Automated blocking of low-quality code
4. **Monitoring**: Track test metrics and trends over time
5. **Documentation**: Clear test results and failure explanations

## Troubleshooting

### Common Issues

1. **Test Database Connection**: Ensure test databases are running
2. **Browser Tests**: Check Playwright browser installation
3. **Performance Tests**: Verify system resources are adequate
4. **Load Tests**: Ensure target server is running and accessible
5. **Coverage Reports**: Check for configuration issues in Jest

### Debug Commands

```bash
# Check test environment
npm run test:env

# Validate test configuration
npm run test:validate

# Run tests with verbose output
npm test -- --verbose

# Generate test report
npm run test:report
```

This comprehensive testing strategy ensures the Cognitive Fabric Visualizer meets all performance, accuracy, and reliability targets while maintaining high code quality and developer productivity.