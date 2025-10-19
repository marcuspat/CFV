# Cognitive Fabric Visualizer - Setup Guide

## Overview

The Cognitive Fabric Visualizer (CFV) is a sophisticated four-dimensional cognitive analysis framework that processes conversations and generates real-time cognitive visualizations. This guide will help you set up the development environment and resolve common issues.

## ✅ Issues Resolved

### 1. ✅ NPM Security Vulnerabilities
- **Status**: FIXED
- **Solution**: All npm security vulnerabilities have been resolved
- **Command**: `npm audit` shows 0 vulnerabilities

### 2. ✅ Missing dev:all Script
- **Status**: FIXED
- **Solution**: Added comprehensive development startup script
- **Usage**: `npm run dev:all` starts all services concurrently

### 3. ✅ WebSocket Type Definitions
- **Status**: FIXED
- **Solution**: Updated MessageType enum and WebSocket service compatibility
- **Files Modified**:
  - `/src/types/cognitive.ts`
  - `/src/types/api.ts`
  - `/src/server/services/websocket.ts`

### 4. ✅ Node.js Types and Buffer Global
- **Status**: FIXED
- **Solution**: Added proper Node.js type declarations
- **Files Modified**: `/src/types/global.d.ts`

### 5. ✅ Visualization Type Mismatches
- **Status**: FIXED
- **Solution**: Updated VisualizationConfig interface with missing properties
- **Files Modified**: `/src/types/cognitive.ts`

### 6. ✅ API Import/Export Issues
- **Status**: FIXED
- **Solution**: Fixed import paths and added missing type exports
- **Files Modified**: `/src/types/index.ts`, `/src/client/src/services/apiService.ts`

### 7. ✅ Zod Configuration Type Issues
- **Status**: FIXED
- **Solution**: Updated Zod schemas to use proper preprocessing for type conversions
- **Files Modified**: `/src/config/environment.ts`, `/src/server/config/index.ts`

## 🚧 Remaining Issues

### 1. Client-side Component Errors
**Status**: NEEDS ATTENTION
**Files Affected**:
- `src/client/components/ExplainabilityPanel.tsx`
- `src/client/src/components/CognitiveTimeline.tsx`
- `src/client/src/components/CognitiveVisualization3D.tsx`

**Issues**:
- Type mismatches in D3.js visualizations
- Missing Three.js component properties
- React component prop type issues

### 2. Server-side Route Import Issues
**Status**: NEEDS ATTENTION
**Files Affected**:
- `src/server/routes/analysis.ts`
- `src/server/routes/auth.ts`
- `src/server/routes/export.ts`
- `src/server/routes/visualization.ts`

**Issues**:
- AuthenticatedRequest import inconsistencies
- Missing properties in API request types
- Type conversion issues for string enums

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- PostgreSQL, Neo4j, and Redis (or use Docker)

### Development Setup

1. **Install Dependencies**
```bash
npm install
cd src/client && npm install && cd ../..
```

2. **Environment Configuration**
```bash
cp .env.example .env
# Edit .env with your database configurations
```

3. **Start Development Services**
```bash
# Start all services concurrently
npm run dev:all

# Or start individual services
npm run dev:api    # Backend API server
npm run dev:client # Frontend React app
```

### Docker Deployment

1. **Build Docker Image**
```bash
npm run docker:build
```

2. **Run Development Environment**
```bash
npm run docker:dev
```

3. **Run Production Environment**
```bash
npm run docker:prod
```

## 📁 Project Structure

```
cfv/
├── src/
│   ├── client/              # React frontend
│   │   ├── src/
│   │   │   ├── components/  # React components
│   │   │   ├── services/    # API services
│   │   │   └── types/       # TypeScript types
│   │   └── package.json
│   ├── server/              # Express backend
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── middleware/      # Express middleware
│   │   └── config/          # Configuration
│   ├── types/               # Shared TypeScript types
│   └── config/              # Environment configuration
├── tests/                   # Test suites
├── docs/                    # Documentation
├── docker-compose.yml       # Docker configuration
└── package.json            # Main package.json
```

## 🔧 Configuration

### Environment Variables
Key environment variables in `.env`:

```bash
# Server
NODE_ENV=development
PORT=3001

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cognitive_fabric
DB_USER=postgres
DB_PASSWORD=password

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key-at-least-32-characters-long
JWT_EXPIRES_IN=7d

# External APIs
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

### Database Setup

#### PostgreSQL
```bash
# Using Docker
docker run --name postgres-cfv \
  -e POSTGRES_DB=cognitive_fabric \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:15
```

#### Neo4j
```bash
# Using Docker
docker run --name neo4j-cfv \
  -e NEO4J_AUTH=neo4j/password \
  -e NEO4J_PLUGINS=["apoc"] \
  -p 7474:7474 -p 7687:7687 \
  neo4j:5
```

#### Redis
```bash
# Using Docker
docker run --name redis-cfv \
  -p 6379:6379 \
  redis:7
```

## 🧪 Testing

### Available Test Scripts
```bash
# Run all tests
npm test

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests (Playwright)
npm run test:e2e

# Performance tests
npm run test:performance

# Test coverage
npm run test:coverage
```

### TypeScript Validation
```bash
# Type checking
npm run typecheck

# Build validation
npm run build
```

## 🐛 Troubleshooting

### Common Issues and Solutions

1. **TypeScript Compilation Errors**
   - Run `npm run typecheck` to identify specific errors
   - Most errors are related to component prop types and API interfaces
   - Check the "Remaining Issues" section above for known problems

2. **Docker Build Failures**
   - Ensure all dependencies are installed locally first
   - Check that TypeScript compilation passes before building
   - Node.js client-side components are currently blocking Docker builds

3. **Database Connection Issues**
   - Verify all database services are running
   - Check connection strings in `.env` file
   - Ensure proper network connectivity between containers

4. **Missing Dependencies**
   - Run `npm install` in both root and `src/client` directories
   - Check for missing packages in error messages
   - Install missing packages with `npm install [package-name]`

## 📊 Development Status

### ✅ Completed Tasks
- [x] Security vulnerabilities resolved
- [x] WebSocket type compatibility fixed
- [x] Development scripts added
- [x] Core infrastructure types updated
- [x] Environment configuration validated
- [x] API request/response types synchronized

### 🚧 In Progress Tasks
- [ ] Client-side component TypeScript errors
- [ ] Server-side route import issues
- [ ] Docker build optimization
- [ ] Complete test coverage

### 📋 Next Steps
1. Fix remaining client-side component TypeScript errors
2. Resolve server-side route import inconsistencies
3. Complete Docker build setup
4. Add comprehensive error handling
5. Implement missing component features

## 📞 Support

For issues and questions:
1. Check this guide for known solutions
2. Review error logs carefully
3. Test changes locally before Docker builds
4. Refer to project documentation in `/docs/`

---

**Last Updated**: 2025-10-19
**Version**: 1.0.0
**Status**: Development - Partially Functional