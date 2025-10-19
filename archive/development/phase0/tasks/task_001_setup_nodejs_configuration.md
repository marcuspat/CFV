# Task 001: Setup Node.js Configuration

**Estimated Time**: 20 minutes
**Type**: Implementation
**Dependencies**: Task 000 (Initialize Project Structure)
**Status**: Ready to Start

## Context

I'm starting this task fresh with no assumptions about prior Node.js setup. The project exists with a basic directory structure from Task 000, but lacks Node.js configuration files and package management setup.

## Current System State
- Project directory structure exists at `/workspaces/cfv/`
- Basic folders: `src/`, `tests/`, `docs/`, `config/`, `scripts/`
- No `package.json` file exists
- Node.js and npm are available in the environment (verified via `node --version`)

## Your Task

Create a complete Node.js configuration with TypeScript support, development scripts, and proper dependency management for the Cognitive Fabric Visualizer project.

## Test First (RED Phase)

Create the following test file at `tests/setup/nodejs.test.js`:

```javascript
// tests/setup/nodejs.test.js
const fs = require('fs');
const path = require('path');

describe('Node.js Configuration', () => {
  const packageJsonPath = path.join(process.cwd(), 'package.json');

  test('package.json exists', () => {
    expect(fs.existsSync(packageJsonPath)).toBe(true);
  });

  test('package.json has required fields', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    expect(packageJson.name).toBe('cognitive-fabric-visualizer');
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson.main).toBeDefined();
    expect(packageJson.scripts).toBeDefined();
    expect(packageJson.devDependencies).toBeDefined();
    expect(packageJson.dependencies).toBeDefined();
  });

  test('development scripts are available', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    expect(packageJson.scripts.dev).toBeDefined();
    expect(packageJson.scripts.build).toBeDefined();
    expect(packageJson.scripts.test).toBeDefined();
    expect(packageJson.scripts.lint).toBeDefined();
    expect(packageJson.scripts.start).toBeDefined();
  });

  test('TypeScript dependencies are included', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    expect(packageJson.devDependencies.typescript).toBeDefined();
    expect(packageJson.devDependencies['@types/node']).toBeDefined();
  });
});
```

**Expected failure**: `Error: ENOENT: no such file or directory, open '/workspaces/cfv/package.json'`

## Minimal Implementation (GREEN Phase)

Create `package.json`:

```json
{
  "name": "cognitive-fabric-visualizer",
  "version": "1.0.0",
  "description": "A system for mapping multi-dimensional reasoning spaces and visualizing cognitive threads",
  "main": "dist/server/index.js",
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "nodemon --exec ts-node src/server/index.ts",
    "dev:client": "vite",
    "build": "npm run build:server && npm run build:client",
    "build:server": "tsc -p tsconfig.server.json",
    "build:client": "vite build",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "format": "prettier --write src/**/*.ts",
    "typecheck": "tsc --noEmit",
    "start": "node dist/server/index.js",
    "clean": "rimraf dist",
    "postinstall": "npm run build"
  },
  "keywords": [
    "cognitive-science",
    "visualization",
    "ai",
    "machine-learning",
    "neural-networks",
    "graph-theory"
  ],
  "author": "Cognitive Fabric Team",
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "winston": "^3.10.0",
    "dotenv": "^16.3.1",
    "pg": "^8.11.3",
    "neo4j-driver": "^5.12.0",
    "redis": "^4.6.8",
    "axios": "^1.5.0",
    "socket.io": "^4.7.2"
  },
  "devDependencies": {
    "typescript": "^5.2.2",
    "@types/node": "^20.5.9",
    "@types/express": "^4.17.17",
    "@types/cors": "^2.8.13",
    "@types/pg": "^8.10.2",
    "ts-node": "^10.9.1",
    "nodemon": "^3.0.1",
    "jest": "^29.6.4",
    "@types/jest": "^29.5.4",
    "ts-jest": "^29.1.1",
    "eslint": "^8.48.0",
    "@typescript-eslint/eslint-plugin": "^6.7.0",
    "@typescript-eslint/parser": "^6.7.0",
    "prettier": "^3.0.3",
    "concurrently": "^8.2.1",
    "rimraf": "^5.0.1",
    "vite": "^4.4.9",
    "@vitejs/plugin-react": "^4.0.4"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

**Test passage criteria**: All tests in `tests/setup/nodejs.test.js` pass without errors

## Refactored Solution (REFACTOR Phase)

Create `package.json` with optimized organization:

```json
{
  "name": "cognitive-fabric-visualizer",
  "version": "1.0.0",
  "description": "A system for mapping multi-dimensional reasoning spaces and visualizing cognitive threads",
  "main": "dist/server/index.js",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "cross-env NODE_ENV=development nodemon --exec ts-node-esm src/server/index.ts",
    "dev:client": "cross-env NODE_ENV=development vite",
    "build": "npm run clean && npm run typecheck && npm run build:server && npm run build:client",
    "build:server": "tsc -p tsconfig.server.json",
    "build:client": "tsc && vite build",
    "test": "cross-env NODE_ENV=test jest",
    "test:watch": "cross-env NODE_ENV=test jest --watch",
    "test:coverage": "cross-env NODE_ENV=test jest --coverage --coverageThreshold='{\"global\":{\"branches\":80,\"functions\":80,\"lines\":80,\"statements\":80}}'",
    "lint": "eslint src --ext .ts,.tsx --report-unused-disable-directives --max-warnings 0",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,js,jsx,json,css,md}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx,js,jsx,json,css,md}\"",
    "typecheck": "tsc --noEmit --skipLibCheck",
    "start": "cross-env NODE_ENV=production node dist/server/index.js",
    "clean": "rimraf dist coverage",
    "db:migrate": "npm run build:server && node dist/database/migrate.js",
    "db:seed": "npm run build:server && node dist/database/seed.js",
    "postinstall": "npm run build"
  },
  "keywords": [
    "cognitive-science",
    "visualization",
    "ai",
    "machine-learning",
    "neural-networks",
    "graph-theory",
    "cognitive-fabric",
    "reasoning-spaces"
  ],
  "author": {
    "name": "Cognitive Fabric Team",
    "email": "team@cognitivefabric.org",
    "url": "https://cognitivefabric.org"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/cognitivefabric/visualizer.git"
  },
  "bugs": {
    "url": "https://github.com/cognitivefabric/visualizer/issues"
  },
  "homepage": "https://cognitivefabric.org",
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "helmet-csp": "^3.4.0",
    "winston": "^3.10.0",
    "winston-daily-rotate-file": "^4.7.1",
    "dotenv": "^16.3.1",
    "pg": "^8.11.3",
    "pg-pool": "^3.6.1",
    "neo4j-driver": "^5.12.0",
    "redis": "^4.6.8",
    "axios": "^1.5.0",
    "axios-retry": "^3.6.0",
    "socket.io": "^4.7.2",
    "socket.io-client": "^4.7.2",
    "joi": "^17.9.2",
    "compression": "^1.7.4",
    "express-rate-limit": "^6.10.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.2.2",
    "@types/node": "^20.5.9",
    "@types/express": "^4.17.17",
    "@types/cors": "^2.8.13",
    "@types/pg": "^8.10.2",
    "@types/compression": "^1.7.2",
    "@types/uuid": "^9.0.3",
    "ts-node": "^10.9.1",
    "nodemon": "^3.0.1",
    "jest": "^29.6.4",
    "@types/jest": "^29.5.4",
    "ts-jest": "^29.1.1",
    "supertest": "^6.3.3",
    "@types/supertest": "^2.0.12",
    "eslint": "^8.48.0",
    "@typescript-eslint/eslint-plugin": "^6.7.0",
    "@typescript-eslint/parser": "^6.7.0",
    "eslint-config-prettier": "^9.0.0",
    "eslint-plugin-react": "^7.33.2",
    "eslint-plugin-react-hooks": "^4.6.0",
    "prettier": "^3.0.3",
    "concurrently": "^8.2.1",
    "cross-env": "^7.0.3",
    "rimraf": "^5.0.1",
    "vite": "^4.4.9",
    "@vitejs/plugin-react": "^4.0.4",
    "@vitejs/plugin-react-swc": "^3.3.2"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  },
  "volta": {
    "node": "18.17.1",
    "npm": "9.6.7"
  }
}
```

## Verification Commands

```bash
# Verify package.json exists and is valid
node -e "console.log('package.json valid:', JSON.parse(require('fs').readFileSync('package.json', 'utf8')).name)"

# Verify npm can install dependencies
npm install

# Verify scripts are available
npm run --silent

# Verify TypeScript dependencies
npm list typescript @types/node ts-node

# Verify development environment
npm run typecheck
```

## Success Criteria

- [ ] Test written and initially fails with expected error (package.json missing)
- [ ] Implementation makes test pass (package.json created with required structure)
- [ ] Code compiles without warnings (`npm run typecheck`)
- [ ] No mocks or stubs - real package.json with actual dependencies
- [ ] Integration point verified (npm install succeeds, scripts are executable)
- [ ] Dependencies are real and installable (verified via npm install)

## Dependencies Confirmed

- **Node.js version**: 18.17.1 (actually available)
- **npm version**: 9.6.7 (actually available)
- **TypeScript**: Will be installed via devDependencies
- **Project structure**: Confirmed present from Task 000

## Next Task

**Task 002: Configure TypeScript** - Set up TypeScript configuration files with strict mode, path mapping, and optimized compiler options for the Cognitive Fabric Visualizer project.

## Notes for Future Tasks

- The `package.json` includes dependencies for all phases (backend, frontend, ML components)
- Scripts are configured for ES modules support with proper cross-environment handling
- Coverage thresholds are set to 80% to meet project quality standards
- Development and production environment handling is built into all scripts
- Database migration and seeding scripts are prepared for future phases