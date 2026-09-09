import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@cloudburn/rules': fileURLToPath(new URL('../rules/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Integration suites pace AWS admission and retries with real timers, so single cases take seconds when idle.
    // Loaded CI runners stretch them several times over; keep budgets above that instead of Vitest's 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
    },
  },
});
