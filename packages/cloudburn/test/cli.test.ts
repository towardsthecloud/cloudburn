import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli.js';

describe('cli exit codes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  const runCliWith = async (...args: string[]): Promise<void> => {
    const originalArgv = process.argv;
    process.argv = ['node', 'cloudburn', ...args];

    try {
      await runCli();
    } finally {
      process.argv = originalArgv;
    }
  };

  it('exits with the runtime-error code when an option argument is invalid', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await runCliWith('scan', '--service', 'not-a-service');

    expect(process.exitCode).toBe(2);
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('Unknown service');
  });

  it('exits with the runtime-error code for unknown options', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await runCliWith('scan', '--not-a-real-flag');

    expect(process.exitCode).toBe(2);
  });

  it('keeps help output on the ok exit code', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCliWith('--help');

    expect(process.exitCode ?? 0).toBe(0);
  });
});
