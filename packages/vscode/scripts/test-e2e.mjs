import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

if (process.platform === 'linux' && !process.env.DISPLAY) {
  const result = spawnSync('xvfb-run', ['-a', process.execPath, fileURLToPath(import.meta.url)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const cachePath = resolve(packageRoot, 'node_modules/.cache/vscode-test');
await mkdir(cachePath, { recursive: true });
const scratch = await mkdtemp(resolve(tmpdir(), 'cloudburn-vscode-'));
const workspace = resolve(scratch, 'workspace with spaces; $()');
await mkdir(workspace);
await writeFile(resolve(workspace, 'startup.yaml'), 'Resources: {}\n');
const sibling = resolve(scratch, 'second workspace');
await mkdir(sibling);
const workspaceFile = resolve(scratch, 'test.code-workspace');
await writeFile(workspaceFile, JSON.stringify({ folders: [{ path: workspace }, { path: sibling }] }));
try {
  await runTests({
    version: '1.100.3',
    cachePath,
    vscodeExecutablePath: process.env.CLOUDBURN_VSCODE_EXECUTABLE,
    extensionDevelopmentPath: packageRoot,
    extensionTestsPath: resolve(packageRoot, 'dist/e2e-suite.cjs'),
    extensionTestsEnv: {
      CLOUDBURN_TEST_NODE: process.execPath,
      CLOUDBURN_TEST_CLI: resolve(packageRoot, '../cloudburn/dist/cli.js'),
    },
    launchArgs: [workspaceFile, '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--no-sandbox', '--user-data-dir', resolve(scratch, 'profile'), '--extensions-dir', resolve(scratch, 'extensions')],
  });
} finally {
  await rm(scratch, { recursive: true, force: true });
}
