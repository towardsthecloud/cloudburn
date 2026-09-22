import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('the static action bundle excludes AWS SDK and Smithy packages', () => {
  const metadata = JSON.parse(readFileSync(new URL('../../dist/metafile-cjs.json', import.meta.url), 'utf8'));
  const bundledDiscoveryPackages = [
    ...new Set(
      Object.keys(metadata.inputs).flatMap((input) => {
        const match = input.match(/(?:^|[/\\])((?:@aws-sdk|@smithy)[/\\][^/\\]+)/);
        return match ? [match[1]] : [];
      }),
    ),
  ];

  assert.deepEqual(bundledDiscoveryPackages, []);
});
