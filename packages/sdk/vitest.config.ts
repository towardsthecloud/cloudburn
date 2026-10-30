import { availableParallelism } from 'node:os';
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
    // Those suites mostly wait on timers, so more workers than CPUs keep the other files moving beside them. Vitest caps
    // percentage values at the CPU count, so compute the number.
    maxWorkers: Math.ceil(availableParallelism() * 1.5),
    coverage: {
      provider: 'v8',
    },
  },
});
