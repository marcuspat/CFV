/**
 * Dedicated Jest config for supertest API integration tests.
 *
 * Separate from the root jest.config.ts (which uses a `projects` array that
 * only matches compiled .js suites). This config compiles .ts directly with
 * ts-jest in CommonJS mode and maps the explicit ".js" import specifiers used
 * across the server (for the tsx/ESM runtime) back to their .ts sources.
 */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    // Server source imports siblings with explicit .js extensions (e.g.
    // './services/monitoring/index.js'); strip them so ts-jest resolves .ts.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          esModuleInterop: true,
          allowJs: true,
          skipLibCheck: true,
        },
        diagnostics: false,
      },
    ],
  },
  testTimeout: 30000,
  forceExit: true,
  clearMocks: true,
};
