import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { extension: 'src/extension.ts', 'e2e-suite': 'test/e2e/suite.ts' },
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  target: 'node18',
  external: ['vscode'],
  clean: true,
  sourcemap: true,
  dts: false,
  onSuccess: 'node scripts/prepare-extension.mjs',
});
