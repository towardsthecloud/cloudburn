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
