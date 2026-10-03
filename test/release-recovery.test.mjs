import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const workflow = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8');

function step(name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  if (start < 0) return undefined;
  const end = workflow.indexOf('\n      - name:', start + 1);
  return workflow.slice(start, end < 0 ? undefined : end);
}

function shell(name) {
  return step(name).split('        run: |\n')[1].split('\n').map((line) => line.replace(/^          /, '')).join('\n');
}

function run(cwd, command, args = [], env = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function repository(t) {
  const directory = mkdtempSync(join(tmpdir(), 'cloudburn-release-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const checkout = join(directory, 'checkout');
  const remote = join(directory, 'remote.git');
  mkdirSync(checkout);
  run(directory, 'git', ['init', '--bare', remote]);
  run(checkout, 'git', ['init', '-b', 'main']);
  run(checkout, 'git', ['config', 'user.name', 'Release test']);
  run(checkout, 'git', ['config', 'user.email', 'release@example.test']);
  run(checkout, 'git', ['remote', 'add', 'origin', remote]);
  for (const name of ['rules', 'sdk', 'cloudburn', 'action']) {
    mkdirSync(join(checkout, 'packages', name), { recursive: true });
    writeFileSync(join(checkout, 'packages', name, 'package.json'), JSON.stringify({
      name: name === 'cloudburn' ? name : `@cloudburn/${name}`, version: '1.0.0', private: name === 'action',
    }, null, 2));
  }
  run(checkout, 'git', ['add', '.']);
  run(checkout, 'git', ['commit', '-m', 'Initial versions']);
  const initial = run(checkout, 'git', ['rev-parse', 'HEAD']);
  const manifest = join(checkout, 'packages/action/package.json');
  writeFileSync(manifest, readFileSync(manifest, 'utf8').replace('1.0.0', '1.0.1'));
  run(checkout, 'git', ['commit', '-am', 'Release action 1.0.1']);
  const release = run(checkout, 'git', ['rev-parse', 'HEAD']);
  return { directory, checkout, remote, initial, release };
}

test('action-only recovery creates only its released tag when older package tags are missing', (t) => {
  const { checkout, remote, release } = repository(t);
  run(checkout, 'bash', ['-euo', 'pipefail', '-c', shell('Recover missing release tags')], { RELEASED: ' action' });
  // A second run must preserve the same version tag and still ignore other packages.
  run(checkout, 'bash', ['-euo', 'pipefail', '-c', shell('Recover missing release tags')], { RELEASED: ' action' });
  const refs = run(checkout, 'git', ['ls-remote', '--tags', '--refs', remote]);
  assert.deepEqual(refs.split('\n').map((line) => line.split('\t')[1]), ['refs/tags/@cloudburn/action@1.0.1']);
  assert.equal(run(checkout, 'git', ['rev-parse', '@cloudburn/action@1.0.1^{commit}']), release);
});

for (const newerMinor of [false, true]) {
  const name = newerMinor
    ? 'older v1 recovery preserves the newer v1 floating tag'
    : 'recovers the newest v1 floating tag without moving v2 main or latest backwards';
  test(name, (t) => {
    const { directory, checkout, remote, initial, release } = repository(t);
    run(checkout, 'git', ['tag', 'v1.0.0', initial]);
    run(checkout, 'git', ['tag', 'v1', initial]);
    if (newerMinor) run(checkout, 'git', ['tag', 'v1.0.2', initial]);
    run(checkout, 'git', ['tag', 'v2.0.0', release]);
    run(checkout, 'git', ['tag', 'v2', release]);
    run(checkout, 'git', ['push', 'origin', 'main', '--tags']);
    run(remote, 'git', ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    mkdirSync(join(checkout, 'packages/action/dist'));
    writeFileSync(join(checkout, 'packages/action/dist/index.cjs'), 'synthetic v1.0.1 bundle');
    writeFileSync(join(checkout, 'packages/action/dist/main.wasm.gz'), 'synthetic parser');
    for (const file of ['action.yml', 'README.md']) writeFileSync(join(checkout, 'packages/action', file), file);
    writeFileSync(join(checkout, 'LICENSE'), 'test license');
    writeFileSync(join(checkout, 'packages/action/CHANGELOG.md'), '# Action\n\n## 1.0.1\n\nFix scan.\n');
    mkdirSync(join(checkout, 'scripts'));
    copyFileSync(join(root, 'scripts/changelog-notes.mjs'), join(checkout, 'scripts/changelog-notes.mjs'));
    const bin = join(directory, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n');
    writeFileSync(join(bin, 'gh'), `#!/bin/sh
printf '%s\\n' "$*" >> "$GH_LOG"
case "$*" in
  'release view '*) exit 1;;
  'release list '*) echo 'v2.0.0';;
esac
`);
    for (const command of ['pnpm', 'gh']) chmodSync(join(bin, command), 0o755);
    const ghLog = join(directory, 'github.log');
    // Redirect the provider URL to a local Git remote; Git itself stays real.
    const script = shell('Sync GitHub Action').replace(/^REMOTE=.*$/m, `REMOTE='${remote}'`);
    run(checkout, 'bash', ['-euo', 'pipefail', '-c', script], {
      PATH: `${bin}:${process.env.PATH}`, GH_LOG: ghLog,
    });
    const version = run(remote, 'git', ['rev-parse', 'v1.0.1^{commit}']);
    assert.equal(run(remote, 'git', ['rev-parse', 'v1^{commit}']), newerMinor ? initial : version);
    assert.equal(run(remote, 'git', ['rev-parse', 'main']), release);
    assert.equal(run(remote, 'git', ['rev-parse', 'v2^{commit}']), release);
    assert.match(readFileSync(ghLog, 'utf8'), /release create v1.0.1 .*--latest=false/);
  });
}

test('action-only recovery skips Homebrew while CLI recovery repairs the tap', () => {
  const condition = step('Update Homebrew tap').split('        if: >-\n')[1].split('        env:')[0]
    .replaceAll('inputs.published-release-ref', "inputs['published-release-ref']")
    .replaceAll('steps.changesets.outputs.published-packages', "steps.changesets.outputs['published-packages']");
  const evaluate = new Function('github', 'inputs', 'steps', 'contains', 'format', `return (${condition});`);
  const shouldRun = (packages) => evaluate(
    { ref: 'refs/heads/main' },
    { 'published-release-ref': 'released-commit' },
    { recovery: { outputs: { packages } }, changesets: { outputs: {} } },
    (value, search) => value?.includes(search) ?? false,
    (value, arg) => value.replace('{0}', arg),
  );
  assert.equal(shouldRun(' action'), false);
  assert.equal(shouldRun(' cloudburn action'), true);
});

test('recovery refuses a conflicting private action tag without overwriting it', (t) => {
  const { checkout, remote, initial } = repository(t);
  run(checkout, 'git', ['tag', '@cloudburn/action@1.0.1', initial]);
  run(checkout, 'git', ['push', 'origin', '--tags']);
  const result = spawnSync('bash', ['-euo', 'pipefail', '-c', shell('Recover missing release tags')], {
    cwd: checkout, env: { ...process.env, RELEASED: ' action' }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.equal(run(remote, 'git', ['rev-parse', '@cloudburn/action@1.0.1^{commit}']), initial);
});

function pluginRelease(t, { targetVersion, staleFile, npmReadyAfter = 0, tarballReadyAfter = 0 }) {
  const { directory, checkout } = repository(t);
  const target = join(directory, 'plugin.git');
  const seed = join(directory, 'plugin-seed');
  run(directory, 'git', ['init', '--bare', '-b', 'main', target]);
  mkdirSync(seed);
  run(seed, 'git', ['init', '-b', 'main']);
  run(seed, 'git', ['config', 'user.name', 'Release test']);
  run(seed, 'git', ['config', 'user.email', 'release@example.test']);
  writeFileSync(join(seed, staleFile), 'removed from the plugin');
  run(seed, 'git', ['add', '.']);
  run(seed, 'git', ['commit', '-m', `Plugin ${targetVersion}`]);
  run(seed, 'git', ['tag', `v${targetVersion}`]);
  run(seed, 'git', ['push', target, 'main', '--tags']);
  const targetMain = run(target, 'git', ['rev-parse', 'main']);

  mkdirSync(join(checkout, 'packages/mcp/dist/plugin/.claude-plugin'), { recursive: true });
  writeFileSync(join(checkout, 'packages/mcp/package.json'), JSON.stringify({ name: '@cloudburn/mcp', version: '0.1.0' }));
  writeFileSync(join(checkout, 'packages/mcp/CHANGELOG.md'), '# @cloudburn/mcp\n\n## 0.1.0\n\nAdd the MCP server.\n');
  writeFileSync(join(checkout, 'packages/mcp/dist/plugin/.claude-plugin/plugin.json'), '{"version":"0.1.0"}');
  writeFileSync(join(checkout, 'packages/mcp/dist/plugin/README.md'), 'plugin readme');
  mkdirSync(join(checkout, 'scripts'));
  copyFileSync(join(root, 'scripts/changelog-notes.mjs'), join(checkout, 'scripts/changelog-notes.mjs'));
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n');
  writeFileSync(join(bin, 'gh'), `#!/bin/sh
printf '%s\\n' "$*" >> "$GH_LOG"
case "$*" in
  'release view '*) exit 1;;
esac
`);
  // The registry serves version metadata after `npmReadyAfter` failed lookups and the tarball after
  // `tarballReadyAfter` failed downloads, like npm while it still propagates a new version.
  writeFileSync(join(bin, 'npm'), `#!/bin/sh
printf '%s\\n' "$*" >> "$NPM_LOG"
count=$(cat "$NPM_COUNT" 2>/dev/null || echo 0)
echo $((count + 1)) > "$NPM_COUNT"
[ "$count" -ge "$NPM_READY_AFTER" ] || { echo 'npm error code E404' >&2; exit 1; }
echo https://registry.npmjs.org/@cloudburn/mcp/-/mcp-0.1.0.tgz
`);
  writeFileSync(join(bin, 'curl'), `#!/bin/sh
printf '%s\\n' "$*" >> "$CURL_LOG"
count=$(cat "$CURL_COUNT" 2>/dev/null || echo 0)
echo $((count + 1)) > "$CURL_COUNT"
[ "$count" -ge "$TARBALL_READY_AFTER" ] || exit 22
`);
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n');
  for (const command of ['pnpm', 'gh', 'npm', 'curl', 'sleep']) chmodSync(join(bin, command), 0o755);
  const ghLog = join(directory, 'github.log');
  const npmLog = join(directory, 'npm.log');
  const curlLog = join(directory, 'curl.log');
  writeFileSync(ghLog, '');
  writeFileSync(npmLog, '');
  writeFileSync(curlLog, '');
  // Redirect the provider URL to a local Git remote; Git itself stays real.
  const script = shell('Sync agent plugin').replace(/^REMOTE=.*$/m, `REMOTE='${target}'`);
  const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
    cwd: checkout,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      GH_LOG: ghLog,
      NPM_LOG: npmLog,
      NPM_COUNT: join(directory, 'npm.count'),
      NPM_READY_AFTER: String(npmReadyAfter),
      CURL_LOG: curlLog,
      CURL_COUNT: join(directory, 'curl.count'),
      TARBALL_READY_AFTER: String(tarballReadyAfter),
    },
  });
  return {
    target,
    targetMain,
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
    ghLog: readFileSync(ghLog, 'utf8'),
    npmLog: readFileSync(npmLog, 'utf8'),
    curlLog: readFileSync(curlLog, 'utf8'),
  };
}

test('plugin sync mirrors the built plugin to the repository root and publishes its version', (t) => {
  const { target, targetMain, ghLog, status, output } = pluginRelease(t, {
    targetVersion: '0.0.9',
    staleFile: 'obsolete.md',
  });
  assert.equal(status, 0, output);
  const main = run(target, 'git', ['rev-parse', 'main']);
  assert.notEqual(main, targetMain);
  assert.equal(run(target, 'git', ['rev-parse', 'v0.1.0^{commit}']), main);
  assert.deepEqual(run(target, 'git', ['ls-tree', '-r', '--name-only', 'main']).split('\n'), [
    '.claude-plugin/plugin.json',
    'README.md',
  ]);
  assert.match(ghLog, /release create v0\.1\.0 --repo towardsthecloud\/cloudburn-plugin --verify-tag/);
  assert.doesNotMatch(ghLog, /--latest=false/);
});

test('plugin recovery of an older version tags it without moving main or the latest release', (t) => {
  const { target, targetMain, ghLog, status, output } = pluginRelease(t, { targetVersion: '0.2.0', staleFile: 'newer.md' });
  assert.equal(status, 0, output);
  assert.equal(run(target, 'git', ['rev-parse', 'main']), targetMain);
  const tagged = run(target, 'git', ['rev-parse', 'v0.1.0^{commit}']);
  assert.equal(run(target, 'git', ['show', `${tagged}:.claude-plugin/plugin.json`]), '{"version":"0.1.0"}');
  assert.match(ghLog, /release create v0\.1\.0 .*--latest=false/);
});

test('plugin sync waits until npm serves the pinned server version before publishing', (t) => {
  const { target, targetMain, npmLog, status, output } = pluginRelease(t, {
    targetVersion: '0.0.9',
    staleFile: 'obsolete.md',
    npmReadyAfter: 2,
  });
  assert.equal(status, 0, output);
  const lookups = npmLog.trim().split('\n');
  assert.equal(lookups.length, 3);
  for (const lookup of lookups) assert.match(lookup, /^view @cloudburn\/mcp@0\.1\.0 dist\.tarball/);
  assert.notEqual(run(target, 'git', ['rev-parse', 'main']), targetMain);
});

test('plugin sync keeps waiting while npm serves metadata before the tarball', (t) => {
  const { target, targetMain, curlLog, status, output } = pluginRelease(t, {
    targetVersion: '0.0.9',
    staleFile: 'obsolete.md',
    tarballReadyAfter: 2,
  });
  assert.equal(status, 0, output);
  const downloads = curlLog.trim().split('\n');
  assert.equal(downloads.length, 3);
  for (const download of downloads) assert.match(download, /https:\/\/registry\.npmjs\.org\/@cloudburn\/mcp\/-\/mcp-0\.1\.0\.tgz$/);
  assert.notEqual(run(target, 'git', ['rev-parse', 'main']), targetMain);
});

test('release runs finish instead of being cancelled by newer pushes to main', () => {
  assert.match(workflow, /^concurrency:\n  group: release-\$\{\{ github\.ref \}\}\n  cancel-in-progress: false$/m);
});

test('plugin sync fails without publishing when npm never serves the pinned server version', (t) => {
  const { target, targetMain, ghLog, status, output } = pluginRelease(t, {
    targetVersion: '0.0.9',
    staleFile: 'obsolete.md',
    npmReadyAfter: Number.MAX_SAFE_INTEGER,
  });
  assert.notEqual(status, 0);
  assert.match(output, /@cloudburn\/mcp@0\.1\.0 is not available on npm/);
  assert.equal(run(target, 'git', ['rev-parse', 'main']), targetMain);
  assert.equal(spawnSync('git', ['rev-parse', '--verify', '--quiet', 'refs/tags/v0.1.0'], { cwd: target }).status, 1);
  assert.equal(ghLog, '');
});

test('plugin sync runs for published or recovered MCP releases only', () => {
  const condition = step('Sync agent plugin').split('        if: >-\n')[1].split('        env:')[0]
    .replaceAll('inputs.published-release-ref', "inputs['published-release-ref']")
    .replaceAll('steps.changesets.outputs.published-packages', "steps.changesets.outputs['published-packages']");
  const evaluate = new Function('github', 'inputs', 'steps', 'contains', 'format', `return (${condition});`);
  const contains = (value, search) => value?.includes(search) ?? false;
  const format = (value, arg) => value.replace('{0}', arg);
  const recovered = (packages) => evaluate(
    { ref: 'refs/heads/main' },
    { 'published-release-ref': 'released-commit' },
    { recovery: { outputs: { packages } }, changesets: { outputs: {} } },
    contains,
    format,
  );
  const published = (packages) => evaluate(
    { ref: 'refs/heads/main' },
    { 'published-release-ref': '' },
    { recovery: { outputs: {} }, changesets: { outputs: { published: 'true', 'published-packages': packages } } },
    contains,
    format,
  );
  assert.equal(recovered(' sdk cloudburn'), false);
  assert.equal(recovered(' sdk mcp'), true);
  assert.equal(published('[{"name":"cloudburn","version":"1.0.0"}]'), false);
  assert.equal(published('[{"name":"@cloudburn/mcp","version":"0.1.0"}]'), true);
});

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function homebrewDownloadLoop() {
  const lines = shell('Update Homebrew tap').split('\n');
  const start = lines.findIndex((line) => line.includes('TARBALL_FILE=$(mktemp)'));
  const end = lines.findIndex((line) => line === 'done');
  assert.notEqual(start, -1, 'homebrew download loop not found in workflow');
  assert.notEqual(end, -1, 'homebrew download loop end not found in workflow');
  assert.ok(end > start, 'homebrew download loop is malformed');
  return lines.slice(start, end + 1).join('\n');
}

function homebrewStubs(t, curlBody) {
  const directory = mkdtempSync(join(tmpdir(), 'cloudburn-homebrew-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'curl'), `#!/bin/sh
count=$(cat "$CURL_COUNT" 2>/dev/null || echo 0)
echo $((count + 1)) > "$CURL_COUNT"
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then out="$arg"; fi
  prev="$arg"
done
${curlBody}
`);
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n');
  for (const command of ['curl', 'sleep']) chmodSync(join(bin, command), 0o755);
  return { directory, bin };
}

function runHomebrewLoop(t, curlBody) {
  const { directory, bin } = homebrewStubs(t, curlBody);
  const script = `EMPTY_SHA256="${EMPTY_SHA256}"
TARBALL_URL="https://registry.npmjs.org/cloudburn/-/cloudburn-0.0.0.tgz"
SHA256=""
${homebrewDownloadLoop()}
if [ -z "$SHA256" ]; then
  echo "::error::Failed to download a valid tarball after 5 attempts"
  exit 1
fi
echo "RESULT_SHA256=$SHA256"`;
  const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CURL_COUNT: join(directory, 'curl.count') },
  });
  return { ...result, output: `${result.stdout}\n${result.stderr}` };
}

test('homebrew tap never pipes a download directly into shasum', () => {
  const script = step('Update Homebrew tap');
  assert.doesNotMatch(script, /curl[^|]*\|\s*shasum/);
  assert.match(script, /TARBALL_FILE=\$\(mktemp\)/);
  assert.match(script, /\[ -s "\$TARBALL_FILE" \]/);
  assert.match(script, new RegExp(EMPTY_SHA256));
});

test('homebrew tap retries a failed tarball download instead of hashing empty stdin', (t) => {
  const { status, output } = runHomebrewLoop(t, 'if [ "$count" -eq 0 ]; then exit 22; fi\nprintf \'tarball-bytes\' > "$out"');
  assert.equal(status, 0, output);
  assert.match(output, /retrying in 15s \(attempt 1\/5\)/);
  assert.match(output, /RESULT_SHA256=[0-9a-f]{64}/);
  assert.doesNotMatch(output, new RegExp(`RESULT_SHA256=${EMPTY_SHA256}`));
});

test('homebrew tap fails instead of publishing the empty-file hash', (t) => {
  const { status, output } = runHomebrewLoop(t, ': > "$out"');
  assert.notEqual(status, 0);
  assert.match(output, /Failed to download a valid tarball after 5 attempts/);
  assert.equal(output.match(/retrying in 15s/g)?.length, 5);
});
