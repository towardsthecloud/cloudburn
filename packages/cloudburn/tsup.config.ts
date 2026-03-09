import { createRequire } from 'node:module';
import { defineConfig } from 'tsup';

const require = createRequire(import.meta.url);
const { version } = require('./package.json') as { version: string };

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  dts: false,
  target: 'node24',
  clean: true,
  define: {
    __VERSION__: JSON.stringify(version),
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
});
