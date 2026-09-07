import { type ChildProcess, fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'tsup';
import type { AwsRequestAttemptTelemetry } from '../../../src/providers/aws/request.js';
import type { AwsQuotaOverrides } from '../../../src/providers/aws/request-policy.js';

/** Synthetic collector work performed in one independent scan process. */
export type RequestProcessConfig = {
  accountId: string;
  dataset: string;
  requests?: number;
  service?: string;
  operation?: string;
  region?: string;
  timeoutMs?: number;
  mode?: 'hold' | 'throttle';
  overrides?: AwsQuotaOverrides;
};

/** Observable worker lifecycle, transport dispatches, and request telemetry. */
export type RequestProcessEvent =
  | { type: 'ready' }
  | { type: 'submitted' }
  | { type: 'dispatch'; at: number; request: number; attempt: number; dataset: string }
  | { type: 'attempt'; event: AwsRequestAttemptTelemetry }
  | { type: 'done'; results: string[]; error?: string };

/**
 * Builds the real request wrapper for independent offline Node processes.
 * @returns A worker factory and cleanup operation for its children and temporary files.
 */
export const createRequestProcessFixture = async () => {
  const directory = mkdtempSync(fileURLToPath(new URL('../../../node_modules/.aws-request-fixture-', import.meta.url)));
  const children = new Set<ChildProcess>();
  try {
    await build({
      entry: { request: fileURLToPath(new URL('./request-process.ts', import.meta.url)) },
      outDir: directory,
      format: ['esm'],
      target: 'node24',
      platform: 'node',
      removeNodeProtocol: false,
      config: false,
      silent: true,
      dts: false,
      outExtension: () => ({ js: '.mjs' }),
    });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }

  return {
    /**
     * Starts one scan with a shared state directory; dispatch waits for `go`.
     * @param config - Synthetic account, collector, quota, and response behavior.
     * @param state - Fixture-local coordinator directory shared by selected scans.
     * @returns Worker lifecycle controls and its ordered observations.
     */
    start(config: RequestProcessConfig, state = 'shared') {
      const child = fork(join(directory, 'request.mjs'), [JSON.stringify(config)], {
        env: { ...process.env, CLOUDBURN_AWS_ADMISSION_DIR: join(directory, state) },
        execArgv: [],
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      });
      children.add(child);
      const events: RequestProcessEvent[] = [];
      const listeners = new Set<() => void>();
      let stderr = '';
      let exited = false;
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      child.on('message', (message) => {
        events.push(message as RequestProcessEvent);
        for (const listener of listeners) listener();
      });
      const completion = new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => {
          exited = true;
          children.delete(child);
          if (code === 0 || signal === 'SIGKILL') resolve();
          else reject(new Error(`Request fixture exited ${code}: ${stderr}`));
          for (const listener of listeners) listener();
        });
      });
      // A test may intentionally kill a child before awaiting its completion.
      void completion.catch(() => undefined);
      const waitFor = (predicate: (events: RequestProcessEvent[]) => boolean): Promise<void> =>
        new Promise((resolve, reject) => {
          const check = () => {
            if (predicate(events)) {
              listeners.delete(check);
              resolve();
            } else if (exited) {
              listeners.delete(check);
              reject(new Error(`Request fixture exited before its expected event: ${stderr}`));
            }
          };
          listeners.add(check);
          check();
        });
      return {
        child,
        events,
        completion,
        waitFor,
        ready: waitFor((seen) => seen.some((event) => event.type === 'ready')),
      };
    },
    /**
     * Terminates remaining children and removes all fixture state and bundled output.
     * @returns Resolves after every child has exited and its temporary files are removed.
     */
    async dispose() {
      await Promise.all(
        [...children].map(
          (child) =>
            new Promise<void>((resolve) => {
              child.once('exit', () => resolve());
              child.kill('SIGKILL');
            }),
        ),
      );
      rmSync(directory, { recursive: true, force: true });
    },
  };
};
