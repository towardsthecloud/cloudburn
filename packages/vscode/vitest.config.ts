import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', exclude: [...configDefaults.exclude, 'test/e2e/**'] },
});
