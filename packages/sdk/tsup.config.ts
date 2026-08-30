import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'unused-resources': 'src/unused-resources-contract.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  target: 'node24',
  clean: true,
});
