import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the web UI's pure logic layers (markdown renderer, module
 * definitions, SSE/session API client) run in the Node environment.
 * Component-level rendering tests live under tests/components and run in
 * jsdom via @testing-library/react.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/components/**', 'jsdom'],
    ],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
