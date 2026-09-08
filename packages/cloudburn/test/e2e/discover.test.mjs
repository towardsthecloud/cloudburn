import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupCli } from './helpers.mjs';

test('invalid evidence cache modes exit with a usage error before AWS discovery', (t) => {
  const { run } = setupCli(t, 'healthy');
  const result = run('discover', '--cache', 'stale');

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Cache mode must be normal, refresh, or off\./);
});
