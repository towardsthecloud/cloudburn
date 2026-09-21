import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Options } from 'tsup';

type EsbuildPlugin = NonNullable<Options['esbuildPlugins']>[number];

const require = createRequire(import.meta.url);
const { version: actionVersion } = require('./package.json') as { version: string };
const { version: sdkVersion } = require('../sdk/package.json') as { version: string };
const { version: rulesVersion } = require('../rules/package.json') as { version: string };

// Resolve the WASM asset through the SDK so the bundled bridge code and the
// sidecar binary always come from the same installed version.
const sdkRequire = createRequire(new URL('../sdk/package.json', import.meta.url));
const hcl2jsonWasm = join(dirname(sdkRequire.resolve('@cdktf/hcl2json/package.json')), 'main.wasm.gz');
const outDir = fileURLToPath(new URL('./dist', import.meta.url));

// @cdktf/hcl2json reads main.wasm.gz one directory above its compiled module.
// The single-file bundle ships the asset next to dist/index.js instead.
const wasmSidecar: EsbuildPlugin = {
  name: 'hcl2json-wasm-sidecar',
  setup(build) {
    // bridge_wasm_exec.js has a dead `require("performance")` behind a
    // globalThis.performance guard that node24 always satisfies.
    build.onResolve({ filter: /^performance$/ }, () => ({ path: 'performance', external: true }));
    build.onLoad({ filter: /@cdktf[\\/]hcl2json[\\/]lib[\\/]bridge\.js$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8');
      const rewritten = source.replace(/__dirname,\s*"[^"]*",\s*"main\.wasm\.gz"/, '__dirname, "main.wasm.gz"');
      if (rewritten === source) {
        throw new Error('Could not relocate @cdktf/hcl2json main.wasm.gz lookup; check the upstream bridge.');
      }
      return { contents: rewritten, loader: 'js' };
    });
    build.onEnd(async (result) => {
      if (result.errors.length > 0) {
        return;
      }
      await mkdir(outDir, { recursive: true });
      await copyFile(hcl2jsonWasm, join(outDir, 'main.wasm.gz'));
    });
  },
};

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node24',
  dts: false,
  clean: true,
  noExternal: [/(.*)/],
  removeNodeProtocol: false,
  // Live-discovery AWS clients are only reachable through deferred imports the
  // action never calls, so they stay external instead of inflating the bundle.
  // "performance" is a dead require behind a globalThis.performance guard.
  external: ['@aws-sdk/*', '@smithy/*'],
  define: {
    __ACTION_VERSION__: JSON.stringify(actionVersion),
    __SDK_VERSION__: JSON.stringify(sdkVersion),
    __RULES_VERSION__: JSON.stringify(rulesVersion),
  },
  esbuildPlugins: [wasmSidecar],
});
