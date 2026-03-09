import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify('0.0.0-test'),
  },
  resolve: {
    alias: {
      '@cloudburn/rules': fileURLToPath(new URL('../rules/src/index.ts', import.meta.url)),
      '@cloudburn/sdk': fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
    },
  },
});
