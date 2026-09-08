import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  // Keep live imports deferred for CommonJS consumers as well as ESM.
  splitting: true,
  target: 'node24',
  removeNodeProtocol: false,
  clean: true,
});
