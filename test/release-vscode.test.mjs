import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function releaseShell() {
  const path = join(root, '.github/workflows/vscode-release.yml');
  assert.ok(existsSync(path), 'The extension needs a tag-triggered publishing workflow');
  const workflow = readFileSync(path, 'utf8');
  const start = workflow.indexOf('      - name: Check release version and main ancestry\n');
  assert.notEqual(start, -1, 'Release validation must precede packaging and publishing');
  const run = workflow.slice(start).match(/        run: \|\n((?:          .*\n|[ \t]*\n)+)/);
  assert.ok(run, 'The release guard must be executable');
  return run[1].replace(/^          /gm, '');
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

for (const scenario of ['released main commit', 'wrong version', 'off main', 'branch dispatch', 'wrong tag target']) {
  test(`extension release guard checks ${scenario}`, (t) => {
    const script = releaseShell();
    const cwd = mkdtempSync(join(tmpdir(), 'cloudburn-vscode-release-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    git(cwd, 'init', '-b', 'main');
    git(cwd, 'config', 'user.name', 'Release test');
    git(cwd, 'config', 'user.email', 'release@example.test');
    mkdirSync(join(cwd, 'packages/vscode'), { recursive: true });
    writeFileSync(join(cwd, 'packages/vscode/package.json'), '{"name":"@cloudburn/vscode","version":"0.2.0","private":true}');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-m', 'Released extension');
    git(cwd, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    const tag = scenario === 'wrong version' ? '@cloudburn/vscode@0.3.0' : '@cloudburn/vscode@0.2.0';
    if (scenario === 'wrong tag target') git(cwd, 'tag', '-a', tag, '-m', 'Release');
    if (scenario === 'off main' || scenario === 'wrong tag target') {
      git(cwd, 'commit', '--allow-empty', '-m', 'Unreleased commit');
    }
    if (scenario === 'wrong tag target') git(cwd, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    if (scenario !== 'wrong tag target') git(cwd, 'tag', '-a', tag, '-m', 'Release');
    const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
      cwd, encoding: 'utf8',
      env: { ...process.env, RELEASE_TAG: tag, RELEASE_REF_TYPE: scenario === 'branch dispatch' ? 'branch' : 'tag' },
    });
    if (scenario === 'released main commit') assert.equal(result.status, 0, result.stderr);
    else assert.notEqual(result.status, 0, 'An invalid release must fail before using publishing credentials');
  });
}
