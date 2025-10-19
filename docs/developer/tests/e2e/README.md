# Cognitive Fabric Visualizer - E2E Testing Framework

This comprehensive E2E testing framework validates the entire Cognitive Fabric Visualizer application, from user workflows to performance metrics and visual regression.

## 🎯 Testing Coverage

### **User Workflows**
- Complete conversation analysis pipeline
- Real-time cognitive graph updates
- 3D visualization interactions
- Export functionality (JSON, PNG, SVG)
- Error recovery and retry mechanisms

### **3D Visualization Interactions**
- Orbit camera controls (rotation, zoom, pan)
- Node selection and hover states
- Context menus and detailed panels
- Multiple visualization modes (sphere, 2D, tree, circular)
- Advanced rendering options (lighting, materials, effects)

### **Performance Validation**
- **240 FPS target** for small graphs
- **180 FPS target** for medium graphs
- **120 FPS target** for large graphs
- Memory usage monitoring and leak detection
- Frame timing consistency analysis
- Performance optimization modes

### **Real-time Features**
- WebSocket communication testing
- Live cognitive updates (nodes, edges, attributes)
- Dynamic dimension filtering
- Temporal analysis controls
- Performance under continuous updates

### **Mobile Responsiveness**
- Touch interactions and gestures
- Portrait/landscape orientation handling
- Device-specific optimizations (iPhone, Android, Tablet)
- Battery saver mode
- Mobile accessibility features

### **Visual Regression**
- Screenshot comparison across breakpoints
- Theme variations (light/dark)
- Interactive states (hover, selected, focus)
- Error and loading states
- High-DPI display support

### **Browser Compatibility**
- Chrome (primary testing browser)
- Firefox WebGL support
- Safari WebKit compatibility
- Edge Chromium support

## 🚀 Quick Start

### **Install Dependencies**
```bash
npm install
npm run playwright:install
```

### **Run All Tests**
```bash
# Run all E2E tests
npm run test:e2e

# Run with coverage
npm run test:ci

# Run specific test suites
npm run test:e2e -- --grep "Performance"
npm run test:e2e -- --grep "Mobile"
npm run test:e2e -- --grep "Visual"
```

### **Run Individual Test Files**
```bash
# Setup validation
npx playwright test tests/e2e/setup/setup.spec.ts

# Complete workflows
npx playwright test tests/e2e/workflows/complete-user-workflow.spec.ts

# Performance validation
npx playwright test tests/e2e/performance/240-fps-validation.spec.ts

# Mobile responsiveness
npx playwright test tests/e2e/mobile/mobile-responsiveness.spec.ts

# Visual regression
npx playwright test tests/e2e/visual/visual-regression.spec.ts
```

### **Run Tests on Specific Browsers**
```bash
# Chrome (default)
npx playwright test --project=chromium-desktop

# Firefox
npx playwright test --project=firefox-desktop

# Safari (WebKit)
npx playwright test --project=webkit-desktop

# Mobile Chrome
npx playwright test --project=mobile-chrome

# Mobile Safari
npx playwright test --project=mobile-safari
```

## 📊 Performance Testing

### **Performance Baselines**
- **Small Graph (5 nodes)**: 240 FPS target, 128MB memory
- **Medium Graph (25 nodes)**: 180 FPS target, 256MB memory
- **Large Graph (100 nodes)**: 120 FPS target, 384MB memory

### **Performance Monitoring**
The framework includes comprehensive performance monitoring:
- Real-time FPS tracking
- Memory usage analysis
- Frame timing consistency
- WebGL context validation
- CPU throttling simulation

### **Performance Test Results**
Results are saved to `test-results/performance/`:
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "averageFPS": 185.3,
  "averageMemory": 234.7,
  "performanceGoals": {
    "fpsTarget": 240,
    "fpsAchieved": 42,
    "memoryTarget": 512,
    "memoryAchieved": 98
  }
}
```

## 📱 Mobile Testing

### **Device Coverage**
- **iPhone 12** (390×844 portrait, 844×390 landscape)
- **Pixel 5** (412×892 portrait, 892×412 landscape)
- **iPad** (768×1024 portrait, 1024×768 landscape)
- **Small screens** (320×568 portrait, 568×320 landscape)

### **Touch Interaction Testing**
- Tap interactions on cognitive nodes
- Swipe gestures for navigation
- Pinch-to-zoom functionality
- Long press context menus
- Multi-touch gestures

### **Mobile-Specific Features**
- Battery saver mode optimization
- Offline functionality
- Responsive control layouts
- Touch-optimized UI elements
- Performance throttling

## 🎨 Visual Regression Testing

### **Screenshot Coverage**
- Full page layouts at all breakpoints
- Individual component states
- Interactive hover and selection states
- Error and loading states
- Theme variations (light/dark)
- High-DPI display rendering

### **Visual Test Configuration**
```typescript
// Screenshot comparison options
toHaveScreenshot('name.png', {
  fullPage: true,
  animations: 'disabled',
  caret: 'hide',
  maxDiffPixels: 100,
  threshold: 0.2
});
```

### **Baseline Management**
- Baseline images stored in `test-results/baseline/`
- Automatic generation on first run
- Diff images created on failures
- Manual approval workflow for intentional changes

## 🔧 Test Configuration

### **Playwright Configuration**
The `playwright.config.ts` includes:
- Multi-browser testing setup
- Performance monitoring initialization
- Custom reporters for metrics
- Device-specific configurations
- WebSocket mocking for real-time testing

### **Test Fixtures**
Custom test fixtures provide:
- `performanceMonitor`: FPS and memory tracking
- `cognitiveUtils`: 3D visualization interactions
- `mobileUtils`: Touch and gesture testing

### **Mock Data**
Comprehensive test fixtures include:
- Small, medium, and large cognitive graphs
- Realistic conversation data
- API response mocks
- WebSocket message simulations

## 📋 Test Reports

### **HTML Report**
```bash
npx playwright show-report
```
Interactive HTML report with:
- Test results and screenshots
- Performance metrics
- Video recordings of failures
- Detailed error messages

### **Performance Report**
Custom performance reporter generates:
- FPS metrics across test suites
- Memory usage analysis
- Performance goal achievement rates
- Detailed breakdown by test

### **Visual Report**
Visual regression tests generate:
- Baseline vs actual comparisons
- Diff images highlighting changes
- Thumbnail galleries for quick review
- Accept/reject workflow for updates

## 🐛 Debugging Tests

### **Debug Mode**
```bash
# Run tests with browser UI
npx playwright test --debug

# Run tests headed
npx playwright test --headed

# Run with trace viewer
npx playwright test --trace on
```

### **Code Generation**
```bash
# Generate test code from interactions
npx playwright codegen http://localhost:3000
```

### **Trace Viewer**
```bash
# View test execution traces
npx playwright show-trace trace.zip
```

## 📁 File Structure

```
tests/e2e/
├── playwright.config.ts          # Main configuration
├── helpers/
│   ├── test-utilities.ts         # Testing utilities
│   ├── test-fixtures.ts          # Custom fixtures
│   ├── performance-reporter.ts   # Performance reporting
│   ├── global-setup.ts           # Test initialization
│   └── global-teardown.ts        # Cleanup
├── fixtures/
│   ├── cognitive-graph-data.ts   # Mock graph data
│   └── api-responses.ts          # Mock API responses
├── setup/
│   └── setup.spec.ts             # Environment validation
├── workflows/
│   ├── complete-user-workflow.spec.ts
│   └── real-time-filtering.spec.ts
├── desktop/
│   └── 3d-interaction.spec.ts    # Desktop 3D interactions
├── mobile/
│   └── mobile-responsiveness.spec.ts
├── performance/
│   └── 240-fps-validation.spec.ts # Performance testing
├── visual/
│   └── visual-regression.spec.ts  # Visual comparisons
└── README.md                      # This file
```

## 🎯 Success Metrics

### **Quality Gates**
- ✅ All tests pass across all browsers
- ✅ Performance targets met for all graph sizes
- ✅ Mobile responsive design validated
- ✅ Visual regression tests pass
- ✅ Accessibility features functional

### **Performance Targets**
- **FPS**: ≥240 (small), ≥180 (medium), ≥120 (large)
- **Memory**: ≤128MB (small), ≤256MB (medium), ≤384MB (large)
- **Load Time**: ≤1s (small), ≤2s (medium), ≤3s (large)
- **Interaction Response**: ≤100ms

### **Coverage Goals**
- **User Workflows**: 100% critical paths covered
- **3D Interactions**: All major controls tested
- **Mobile Devices**: Primary devices fully tested
- **Browsers**: Chrome, Firefox, Safari, Edge compatibility
- **Visual States**: Key UI states validated

## 🔗 Integration

### **CI/CD Pipeline**
```yaml
# Example GitHub Actions
- name: Run E2E Tests
  run: npm run test:ci
- name: Upload Performance Report
  uses: actions/upload-artifact@v3
  with:
    name: performance-report
    path: test-results/performance/
- name: Upload Visual Report
  uses: actions/upload-artifact@v3
  with:
    name: visual-report
    path: playwright-report/
```

### **Performance Monitoring**
Test results integrate with:
- Application performance monitoring (APM)
- Real user monitoring (RUM)
- CI/CD performance gates
- Alerting for performance regressions

---

**Testing Strategy**: This framework ensures the Cognitive Fabric Visualizer delivers a high-quality, performant, and accessible experience across all devices and browsers while maintaining the target 240 FPS rendering performance for optimal user experience.