import { copyFile } from 'node:fs/promises';
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
  onSuccess: async () => { await copyFile('../../LICENSE', 'LICENSE'); },
});
