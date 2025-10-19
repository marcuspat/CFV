# Contributing to Cognitive Fabric Visualizer

Thank you for your interest in contributing to the Cognitive Fabric Visualizer! This document provides guidelines and instructions for contributing to the project.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Neo4j 4+
- Redis 6+
- Git

### Development Setup

1. **Fork the repository**
   ```bash
   # Fork the repository on GitHub
   git clone https://github.com/your-username/CFV.git
   cd CFV
   ```

2. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/marcuspat/CFV.git
   ```

3. **Install dependencies**
   ```bash
   npm install
   cd src/client
   npm install
   cd ../..
   ```

4. **Set up environment**
   ```bash
   cp .env.example .env
   # Configure your local environment variables
   ```

5. **Start development servers**
   ```bash
   # Backend server (terminal 1)
   npm run dev

   # Frontend server (terminal 2)
   cd src/client
   npm start
   ```

## 🏗️ Development Workflow

### Branch Strategy

- **main**: Production-ready code
- **develop**: Integration branch
- **feature/***: New features
- **bugfix/***: Bug fixes
- **hotfix/***: Critical fixes for production

### Commit Guidelines

#### Commit Message Format
```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code formatting
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

**Examples:**
```
feat(visualization): Add 3D node interaction

Implement hover states and click events for cognitive nodes
in the 3D visualization, showing detailed tooltips and
enabling node selection for analysis.

Closes #123
```

### Pull Request Process

1. **Create feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

2. **Make changes and commit**
   ```bash
   # Make your changes
   git add .
   git commit -m "feat(feature): Add amazing feature"
   ```

3. **Push to your fork**
   ```bash
   git push origin feature/amazing-feature
   ```

4. **Create Pull Request**
   - Use descriptive title
   - Fill out PR template
   - Link relevant issues
   - Request appropriate reviewers

5. **Address feedback**
   - Respond to reviewer comments
   - Make requested changes
   - Keep PR updated

6. **Merge**
   - Ensure all checks pass
   - Maintain clean commit history
   - Squash commits if needed

## 📝 Code Standards

### TypeScript Guidelines

#### Type Safety
- Use strict TypeScript mode
- Avoid `any` type when possible
- Prefer interfaces over types for objects
- Use type guards for runtime validation

```typescript
// ✅ Good
interface CognitiveElement {
  id: string;
  type: CognitiveDimension;
  confidence: number;
}

// ❌ Avoid
const element: any = {};
```

#### Naming Conventions
- **PascalCase**: Classes, interfaces, enums
- **camelCase**: Variables, functions, methods
- **UPPER_SNAKE_CASE**: Constants, environment variables
- **kebab-case**: File names, CSS classes

### Code Style

#### General Guidelines
- Use meaningful variable and function names
- Keep functions small and focused (< 50 lines)
- Use early returns for clarity
- Document complex logic with comments

#### React Component Guidelines
```typescript
// ✅ Good component structure
interface ComponentProps {
  data: CognitiveData;
  onAction: (action: string) => void;
}

export const CognitiveComponent: React.FC<ComponentProps> = ({
  data,
  onAction,
}) => {
  // Hooks at the top
  const [state, setState] = useState<DataType>(initialValue);

  // Event handlers
  const handleClick = useCallback((event: React.MouseEvent) => {
    onAction('clicked');
  }, [onAction]);

  // Effects
  useEffect(() => {
    // Side effects
  }, [data]);

  // Render
  return (
    <div className="cognitive-component">
      {/* JSX */}
    </div>
  );
};
```

#### Error Handling
```typescript
// ✅ Good error handling
const processData = async (data: unknown): Promise<Result> => {
  try {
    const validatedData = validateInput(data);
    const result = await api.process(validatedData);
    return result;
  } catch (error) {
    logger.error('Processing failed', { error, data });
    throw new ProcessingError('Failed to process data', error);
  }
};
```

### Database Guidelines

#### Query Optimization
- Use parameterized queries
- Add appropriate indexes
- Avoid N+1 query problems
- Use transactions for consistency

#### Migration Rules
- Always write rollback migration
- Test migrations on sample data
- Use descriptive migration names
- Document breaking changes

### Testing Guidelines

#### Test Structure
```typescript
// Unit test example
describe('CognitiveAnalysis', () => {
  let service: CognitiveAnalysisService;

  beforeEach(() => {
    service = new CognitiveAnalysisService();
  });

  describe('analyzeConversation', () => {
    it('should analyze conversation with four dimensions', async () => {
      const conversation = createMockConversation();

      const result = await service.analyzeConversation(conversation);

      expect(result).toBeDefined();
      expect(result.dimensions).toHaveLength(4);
      expect(result.accuracy.factualRetrieval).toBeGreaterThanOrEqual(0.92);
    });

    it('should handle empty conversation gracefully', async () => {
      const emptyConversation = { transcript: [] };

      await expect(
        service.analyzeConversation(emptyConversation)
      ).rejects.toThrow(ValidationError);
    });
  });
});
```

#### Coverage Requirements
- **Unit Tests**: >80% line coverage
- **Integration Tests**: Critical paths covered
- **E2E Tests**: User workflows covered
- **Performance Tests**: 240 FPS target validated

#### Test Categories
- **Unit Tests**: Individual function/component testing
- **Integration Tests**: API and database testing
- **E2E Tests**: Full user journey testing
- **Performance Tests**: Rendering and API performance
- **Accuracy Tests**: Cognitive dimension validation

## 🧪 Testing

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e

# Performance tests
npm run test:performance

# Coverage report
npm run test:coverage
```

### Writing Tests

#### Best Practices
- **AAA Pattern**: Arrange, Act, Assert
- **Descriptive names**: Test names describe behavior
- **Mock dependencies**: Isolate units under test
- **Edge cases**: Test boundary conditions
- **Error scenarios**: Test failure modes

#### Test Data Management
```typescript
// Test fixtures
const mockConversation: Conversation = {
  id: 'test-conversation',
  title: 'Test Conversation',
  transcript: ['Hello', 'World'],
  // ...
};

// Test helpers
const createMockAnalysis = (overrides?: Partial<Analysis>) => ({
  id: 'test-analysis',
  conversationId: 'test-conversation',
  status: 'completed',
  result: generateMockResult(),
  ...overrides,
});
```

## 📚 Documentation

### Code Documentation
- Use JSDoc for function documentation
- Document complex algorithms
- Explain business logic decisions
- Add usage examples for public APIs

### README Updates
- Update README for new features
- Document breaking changes
- Include setup instructions
- Provide usage examples

### API Documentation
- Maintain API specification
- Document request/response formats
- Include error scenarios
- Provide example requests

## 🎯 Feature Development

### Feature Proposal Process

1. **Discussion**: Open issue for discussion
2. **Specification**: Create detailed specification
3. **Design**: Review architecture implications
4. **Implementation**: Create PR following guidelines
5. **Review**: Peer review process
6. **Testing**: Comprehensive test coverage
7. **Documentation**: Update relevant docs

### Cognitive Dimension Development

When adding new cognitive dimensions:

1. **Research**: Understand cognitive science basis
2. **Target Metrics**: Define accuracy/precision goals
3. **Implementation**: Create analysis module
4. **Visualization**: Add 3D representation
5. **Testing**: Validate against targets
6. **Documentation**: Explain methodology

### Visualization Improvements

When enhancing visualization:

1. **Performance**: Maintain 240 FPS target
2. **Accessibility**: Ensure usability for all users
3. **Interactivity**: Design intuitive controls
4. **Responsiveness**: Support various screen sizes
5. **Testing**: Performance and usability tests

## 🐛 Bug Reporting

### Bug Report Template

```markdown
## Bug Description
Brief description of the issue

## Steps to Reproduce
1. Go to...
2. Click on...
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: [e.g., Windows 10, macOS 12.0]
- Browser: [e.g., Chrome 108, Firefox 107]
- Node.js: [e.g., 18.12.0]
- Application Version: [e.g., 1.2.0]

## Additional Context
Any other relevant information
```

### Bug Fix Process

1. **Reproduce**: Confirm bug exists
2. **Isolate**: Identify root cause
3. **Test**: Write failing test
4. **Fix**: Implement minimal fix
5. **Verify**: Ensure test passes
6. **Document**: Explain fix in PR

## 🔍 Code Review

### Review Guidelines

#### What to Look For
- **Functionality**: Does the code work as intended?
- **Performance**: Is it efficient and scalable?
- **Security**: Are there any security concerns?
- **Testing**: Is there adequate test coverage?
- **Documentation**: Is the code well documented?
- **Style**: Does it follow project conventions?

#### Review Process
1. **Automated Checks**: CI pipeline validation
2. **Peer Review**: At least one reviewer approval
3. **Design Review**: Architecture implications considered
4. **Testing Review**: Test coverage verified
5. **Documentation Review**: Updates completed

### Review Comments

#### Constructive Feedback
- **Specific**: Point to exact issues
- **Explain**: Why something is problematic
- **Suggest**: How to improve
- **Positive**: Acknowledge good practices

#### Example Comments
```markdown
**Suggestion**: Consider using useCallback for this event handler to prevent unnecessary re-renders.

**Issue**: The error handling here could be more specific. Consider catching specific error types.

**Good**: Great use of TypeScript interfaces! The type safety really helps with understanding the data flow.
```

## 🚀 Release Process

### Version Management
- **Semantic Versioning**: Follow SemVer guidelines
- **Changelog**: Document all changes
- **Tagging**: Use Git tags for releases
- **Branching**: Maintain stable release branch

### Release Checklist
- [ ] All tests passing
- [ ] Code coverage target met
- [ ] Documentation updated
- [ ] Performance benchmarks met
- [ ] Security review completed
- [ ] Changelog updated
- [ ] Version bumped
- [ ] Git tag created

### Deployment
1. **Staging**: Deploy to staging environment
2. **Testing**: Run integration tests on staging
3. **Production**: Deploy to production
4. **Monitoring**: Verify deployment health
5. **Rollback**: Plan for rollback if needed

## 💬 Community

### Getting Help
- **Discussions**: GitHub Discussions for questions
- **Issues**: Bug reports and feature requests
- **Documentation**: Check existing docs first
- **Code Review**: Request reviews on complex changes

### Communication Channels
- **GitHub**: Primary development platform
- **Discord**: Real-time discussion (if available)
- **Email**: For security issues and private matters

## 📋 Resources

### Development Tools
- **IDE Setup**: VS Code with recommended extensions
- **Linting**: ESLint configuration
- **Formatting**: Prettier configuration
- **Type Checking**: Strict TypeScript setup

### Learning Resources
- **Cognitive Science**: Relevant research papers
- **Visualization**: Information visualization principles
- **Three.js**: 3D graphics documentation
- **React**: Component architecture patterns

### External Links
- **Three.js Documentation**: https://threejs.org/docs/
- **React Documentation**: https://react.dev/
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **WebGL Fundamentals**: https://webglfundamentals.org/

---

Thank you for contributing to the Cognitive Fabric Visualizer! Your contributions help advance the understanding of cognitive processes through innovative visualization technology.