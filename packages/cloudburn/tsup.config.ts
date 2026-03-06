import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  dts: false,
  target: 'node24',
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
