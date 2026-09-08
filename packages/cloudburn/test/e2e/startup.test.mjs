import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { setupCli } from './helpers.mjs';

test('help and version work without loading AWS dependencies', (t) => {
  const { run } = setupCli(t, 'healthy');
  const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const result = run('--version');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${version}\n`);
  assert.equal(result.stderr, '');

  for (const command of [
    [],
    ['scan'],
    ['discover'],
    ['discover', 'init'],
    ['discover', 'status'],
    ['discover', 'supported-resource-types'],
    ['rules'],
    ['completion'],
  ]) {
    const help = run(...command, '--help');
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage: cloudburn/);
    assert.equal(help.stderr, '');
  }
});
