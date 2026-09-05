import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
const fixturesPath = fileURLToPath(new URL('./fixtures/', import.meta.url));

/**
 * Copies a fixture to an isolated directory and runs the built CLI as a consumer would.
 * @param t - Test context responsible for cleanup.
 * @param fixture - Fixture directory relative to fixtures/.
 * @returns The temporary directory and a command runner without ambient AWS credentials or config.
 */
export const setupCli = (t, fixture) => {
  const directory = mkdtempSync(join(tmpdir(), 'cloudburn-cli-e2e-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  cpSync(join(fixturesPath, fixture), directory, { recursive: true });
  return {
    directory,
    run: (...args) => {
      const result = spawnSync(process.execPath, [cliPath, ...args], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 15_000,
        env: {
          PATH: [dirname(process.execPath), process.env.PATH].join(delimiter),
          CI: 'true',
          NO_COLOR: '1',
          AWS_EC2_METADATA_DISABLED: 'true',
          AWS_CONFIG_FILE: join(directory, 'absent-aws-config'),
          AWS_SHARED_CREDENTIALS_FILE: join(directory, 'absent-aws-credentials'),
        },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      return result;
    },
  };
};

/**
 * Extracts stable finding identities and locations without discarding meaningful scan evidence.
 * @param output - Parsed CLI JSON response.
 * @returns Findings sorted independently of provider/rule traversal order.
 */
export const findingIdentities = (output) =>
  output.providers
    .flatMap((provider) =>
      provider.rules.flatMap((rule) =>
        rule.findings.map((finding) => ({
          ruleId: rule.ruleId,
          resourceId: finding.resourceId,
          location: finding.location,
        })),
      ),
    )
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
