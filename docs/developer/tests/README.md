# Cognitive Fabric Visualizer - Backend Testing Framework

This directory contains a comprehensive testing framework for the Cognitive Fabric Visualizer backend API, covering all aspects of functionality, performance, and reliability.

## 📁 Test Structure

```
tests/
├── api/                    # API endpoint tests
│   ├── auth.test.js        # Authentication endpoints
│   ├── conversations.test.js # Conversation CRUD operations
│   ├── analysis.test.js     # Cognitive analysis endpoints
│   ├── visualizations.test.js # Visualization API
│   └── exports.test.js      # Data export functionality
├── integration/            # Integration tests
│   ├── database.test.js    # Database integration
│   └── external-apis.test.js # External API integration
├── websocket/              # WebSocket tests
│   ├── websocket.test.js   # Real-time communication
│   └── websocketHelpers.js # WebSocket testing utilities
├── performance/            # Performance tests
│   ├── api.performance.test.js # API performance benchmarks
│   └── cognitive-analysis.performance.test.js # ML model performance
├── mocks/                  # Mock implementations
│   └── services.mock.js    # External service mocks
├── utils/                  # Test utilities
│   └── apiTestHelpers.js   # API testing helpers
├── setup/                  # Test setup files
│   ├── jest.setup.js      # Jest global setup
│   ├── database.setup.js  # Database test setup
│   ├── server.setup.js    # Server test setup
│   └── mocks.setup.js     # Mock service setup
├── unit/                   # Unit tests (when added)
├── ml/                     # ML component tests (when added)
├── conftest.py            # Pytest configuration
├── jest.config.js          # Jest configuration
├── pytest.ini              # Pytest configuration
├── tsconfig.json           # TypeScript configuration for tests
└── README.md               # This file
```

## 🚀 Quick Start

### Running All Tests

```bash
# Run all tests with coverage
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:api
npm run test:performance
npm run test:ml
```

### Running Individual Test Files

```bash
# Run API tests
npx jest tests/api/

# Run performance tests
npx jest tests/performance/

# Run with coverage
npx jest tests/api/ --coverage
```

### Running Tests in Watch Mode

```bash
# Watch mode for development
npm run test:watch

# Watch specific test files
npx jest tests/api/auth.test.js --watch
```

## 📊 Test Coverage Requirements

### Global Coverage Targets
- **Branch Coverage**: ≥ 80%
- **Function Coverage**: ≥ 85%
- **Line Coverage**: ≥ 85%
- **Statement Coverage**: ≥ 85%

### Component-Specific Targets
- **Server Components**: ≥ 90% across all metrics
- **Services**: ≥ 95% across all metrics
- **API Routes**: ≥ 90% across all metrics
- **Middleware**: ≥ 85% across all metrics

## 🧪 Test Categories

### 1. Unit Tests (`tests/unit/`)
- Individual component testing
- Function-level testing
- Mock dependencies
- Fast execution (< 100ms per test)

### 2. Integration Tests (`tests/integration/`)
- Database integration
- External API integration
- Cross-component interaction
- Medium execution time (< 5s per test)

### 3. API Tests (`tests/api/`)
- Complete endpoint testing
- Authentication/authorization
- Request/response validation
- Error handling
- Medium execution time (< 2s per test)

### 4. WebSocket Tests (`tests/websocket/`)
- Real-time communication
- Connection management
- Message broadcasting
- Performance under load
- Variable execution time

### 5. Performance Tests (`tests/performance/`)
- Response time benchmarks
- Throughput testing
- Load testing
- Memory usage analysis
- Longer execution time (30s-5min per test)

### 6. ML Tests (`tests/ml/`)
- Model accuracy validation
- Cognitive dimension analysis
- Performance targets
- Integration with external ML services

## 🔧 Configuration

### Jest Configuration (`jest.config.js`)
- TypeScript support with `ts-jest`
- Multiple test projects
- Coverage reporting
- Parallel execution
- Custom matchers

### Pytest Configuration (`pytest.ini`)
- Python ML testing
- Performance markers
- Coverage reporting
- Timeout handling

### Environment Setup
- Test database configuration
- Mock service initialization
- Test data seeding
- Cleanup procedures

## 📋 Testing Standards

### Test Naming Conventions
- **Files**: `*.test.js` or `*.spec.js`
- **Describe Blocks**: Clear, descriptive names
- **Test Cases**: `should [expected behavior] when [condition]`
- **Hooks**: Use `beforeAll`, `afterAll`, `beforeEach`, `afterEach`

### Test Structure
```javascript
describe('Feature Being Tested', () => {
  describe('Specific Scenario', () => {
    test('should behave correctly when condition is met', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### Assertions
- Use specific matchers (`toBeValidUUID`, `toBeValidDate`, `toHaveValidCognitiveScores`)
- Test both positive and negative cases
- Validate error messages and status codes
- Check edge cases and boundary conditions

## 🎯 Performance Benchmarks

### API Response Times
- **Health Checks**: < 50ms
- **Authentication**: < 200ms
- **Conversation CRUD**: < 300ms
- **Analysis Initiation**: < 200ms
- **Data Export**: < 1s (queued)

### Throughput Targets
- **Read Operations**: ≥ 50 RPS
- **Write Operations**: ≥ 20 RPS
- **Mixed Workload**: ≥ 30 RPS
- **WebSocket Messages**: ≥ 20 msg/s

### Cognitive Analysis Targets
- **Factual Retrieval**: ≥ 92% accuracy, < 1s processing
- **Logical Inference**: ≥ 85% precision, < 1.5s processing
- **Creative Synthesis**: ≥ 0.60 ROUGE-L, < 2s processing
- **Meta-Cognition**: ≥ 0.96 F1-score, < 1.75s processing

## 🔄 CI/CD Integration

### GitHub Actions
```yaml
name: Backend Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:ci
```

### Coverage Reporting
- HTML reports in `coverage/html-report/`
- JUnit XML for CI integration
- Coverage thresholds enforced
- Trend tracking over time

## 🛠️ Mock Services

### External Service Mocks
- **OpenAI API**: MockGPTService class
- **Claude API**: MockClaudeService class
- **Database**: MockDatabaseService class
- **Redis**: MockRedisService class

### Mock Scenarios
- **Successful Analysis**: Normal operation
- **Service Failures**: Error handling
- **High Latency**: Performance testing
- **Rate Limiting**: Resilience testing

### Usage Example
```javascript
import { mockServiceFactory } from '../mocks/services.mock';

const mockOpenAI = mockServiceFactory.createOpenAIService({
  responseDelay: 100,
  errorRate: 0.1
});
global.openaiService = mockOpenAI;
```

## 📈 Performance Monitoring

### Metrics Collection
- Response time tracking
- Memory usage monitoring
- Request rate limiting
- Error rate tracking

### Benchmark Reporting
- Automated performance reports
- Regression detection
- Trend analysis
- Alert thresholds

## 🔍 Debugging and Troubleshooting

### Common Issues
1. **Test Database Connection**: Check `TEST_*` environment variables
2. **Mock Service Setup**: Ensure proper mock initialization
3. **Async Test Timeouts**: Increase test timeouts for complex operations
4. **Memory Leaks**: Monitor test memory usage in CI

### Debug Commands
```bash
# Run tests with verbose output
npx jest --verbose

# Run tests with node inspector
node --inspect-brk node_modules/.bin/jest tests/api/auth.test.js

# Generate coverage report
npm run test:coverage
```

## 📝 Test Data Management

### Test Data Factories
- `createTestData()` in `database.setup.js`
- `generateTestData()` in `apiTestHelpers.js`
- Automated cleanup procedures
- Isolated test data per test suite

### Database State
- Transaction rollback for isolation
- Seed data for consistent testing
- Cleanup hooks for data removal
- Migration testing support

## 🚀 Best Practices

### Test Organization
- Group related tests in describe blocks
- Use descriptive test names
- Keep tests focused and independent
- Use setup/teardown hooks efficiently

### Mock Management
- Reset mocks between tests
- Use consistent mock data
- Test both success and failure scenarios
- Validate mock interactions

### Performance Testing
- Use realistic data volumes
- Test under various load conditions
- Monitor resource usage
- Establish performance baselines

### Error Handling
- Test all error conditions
- Validate error messages
- Test recovery scenarios
- Ensure graceful degradation

## 🔮 Future Enhancements

### Planned Additions
- [ ] E2E test integration with Playwright
- [ ] Visual regression testing for visualizations
- [ ] Load testing with Artillery or K6
- [ ] Contract testing with external APIs
- [ ] Security testing integration
- [ ] Accessibility testing

### Test Metrics Improvement
- Code complexity analysis
- Test effectiveness metrics
- Coverage quality assessment
- Performance trend analysis

## 📞 Support and Contributing

### Adding New Tests
1. Follow existing naming conventions
2. Use established test patterns
3. Include both positive and negative cases
4. Add appropriate documentation
5. Update coverage requirements if needed

### Test Maintenance
- Regular mock service updates
- Performance benchmark adjustments
- Test data refresh procedures
- CI/CD pipeline optimization

For questions or contributions, please refer to the project documentation or create an issue in the repository.