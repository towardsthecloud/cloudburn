import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bundlePath = fileURLToPath(new URL('../../dist/index.cjs', import.meta.url));
const cliFixtures = fileURLToPath(new URL('../../../cloudburn/test/e2e/fixtures/', import.meta.url));

/**
 * Copies a CLI fixture to an isolated directory and runs the bundled action the
 * way the node24 runner would: inputs through INPUT_* environment variables,
 * outputs collected through GITHUB_OUTPUT and GITHUB_STEP_SUMMARY files.
 * @param t - Test context responsible for cleanup.
 * @param fixture - Fixture directory relative to the CLI's e2e fixtures.
 * @returns The workspace directory and a bundle runner.
 */
export const setupAction = (t, fixture) => {
  const directory = mkdtempSync(join(tmpdir(), 'cloudburn-action-e2e-'));
  const runnerTemp = mkdtempSync(join(tmpdir(), 'cloudburn-action-temp-'));
  t.after(() => {
    rmSync(directory, { recursive: true, force: true });
    rmSync(runnerTemp, { recursive: true, force: true });
  });
  cpSync(join(cliFixtures, fixture), directory, { recursive: true });

  const outputFile = join(runnerTemp, 'github-output');
  const summaryFile = join(runnerTemp, 'github-summary');
  writeFileSync(outputFile, '');
  writeFileSync(summaryFile, '');

  return {
    directory,
    outputFile,
    summaryFile,
    runnerTemp,
    run: (inputs = {}, environment = {}) => {
      const inputEnv = Object.fromEntries(
        Object.entries(inputs).map(([name, value]) => [`INPUT_${name.toUpperCase()}`, String(value)]),
      );
      const result = spawnSync(process.execPath, [bundlePath], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          PATH: [dirname(process.execPath), process.env.PATH].join(delimiter),
          CI: 'true',
          GITHUB_WORKSPACE: directory,
          GITHUB_OUTPUT: outputFile,
          GITHUB_STEP_SUMMARY: summaryFile,
          GITHUB_EVENT_NAME: 'push',
          RUNNER_TEMP: runnerTemp,
          INPUT_PATH: '.',
          INPUT_ANNOTATIONS: 'true',
          INPUT_COMMENT: 'false',
          INPUT_HEADER: '## CloudBurn scan',
          INPUT_TOKEN: '',
          ...inputEnv,
          ...environment,
        },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.signal, null);
      return result;
    },
  };
};

/**
 * Parses the `name<<delimiter` blocks the toolkit writes to GITHUB_OUTPUT.
 * @param file - Path of the captured GITHUB_OUTPUT file.
 * @returns Output name to string value.
 */
export const readOutputs = (file) => {
  const lines = readFileSync(file, 'utf8').split('\n');
  const outputs = {};
  for (let index = 0; index < lines.length; index += 1) {
    const marker = lines[index].match(/^([^\s<]+)<<(.+)$/);
    if (!marker) {
      const simple = lines[index].match(/^([^\s=]+)=(.*)$/);
      if (simple) outputs[simple[1]] = simple[2];
      continue;
    }
    const value = [];
    index += 1;
    while (index < lines.length && lines[index] !== marker[2]) {
      value.push(lines[index]);
      index += 1;
    }
    outputs[marker[1]] = value.join('\n');
  }
  return outputs;
};
