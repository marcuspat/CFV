import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Only files explicitly named *.test.ts / *.spec.ts are tests. This avoids
  // picking up helper modules such as src/types/test.ts.
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.spec.ts',
    '<rootDir>/src/server/**/*.test.ts',
    '<rootDir>/src/server/**/*.spec.ts',
  ],

  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    // The client has its own (jsdom/Vite) test toolchain.
    '/src/client/',
    '/tests/e2e/',
    '/tests/load/',
    // Legacy integration suites written against a `new App()` API that no
    // longer exists. They were previously non-functional (failed to load on a
    // config-parse error) and must be rewritten once the live HTTP path is
    // migrated onto the bounded contexts (roadmap Phase C/E).
    '/tests/chaos-engineering/',
    '/tests/error-handling/file-system-errors.test.ts',
  ],

  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.simple.cjs'],

  moduleNameMapper: {
    '^@/server/(.*)$': '<rootDir>/src/server/$1',
    '^@/client/(.*)$': '<rootDir>/src/client/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  clearMocks: true,
  testTimeout: 30000,
};

export default config;
