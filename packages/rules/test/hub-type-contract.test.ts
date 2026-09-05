import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('preserves exhaustive purchase actions and resource-specific rightsizing types', () => {
  const result = spawnSync(
    process.execPath,
    [
      createRequire(import.meta.url).resolve('typescript/bin/tsc'),
      '--noEmit',
      '--skipLibCheck',
      '--strict',
      '--module',
      'NodeNext',
      '--target',
      'ES2022',
      fileURLToPath(new URL('./fixtures/hub-purchase-contract.ts', import.meta.url)),
    ],
    { encoding: 'utf8' },
  );
  expect(result.stdout + result.stderr).toBe('');
  expect(result.status).toBe(0);
}, 15000);
