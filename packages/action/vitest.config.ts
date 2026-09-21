import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __ACTION_VERSION__: JSON.stringify('0.0.0-test'),
    __SDK_VERSION__: JSON.stringify('0.0.0-test'),
    __RULES_VERSION__: JSON.stringify('0.0.0-test'),
  },
  resolve: {
    alias: {
      '@cloudburn/rules': fileURLToPath(new URL('../rules/src/index.ts', import.meta.url)),
      '@cloudburn/sdk': fileURLToPath(new URL('../sdk/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'test/e2e/**'],
    coverage: {
      provider: 'v8',
    },
  },
});
