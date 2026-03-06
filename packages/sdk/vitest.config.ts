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
    coverage: {
      provider: 'v8',
    },
  },
});
