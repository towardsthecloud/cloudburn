import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram, runCli } from '../src/cli.js';

describe('cli', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the cloudburn command tree', () => {
    const program = createProgram();
    const visibleCommands = program
      .createHelp()
      .visibleCommands(program)
      .map((command) => command.name());

    expect(program.name()).toBe('cloudburn');
    expect(visibleCommands).toContain('scan');
    expect(visibleCommands).toContain('config');
    expect(visibleCommands).toContain('completion');
    expect(visibleCommands).not.toContain('__complete');
  });

  it('exposes a semver version that is not the hardcoded placeholder', () => {
    const program = createProgram();

    expect(program.version()).toMatch(/^\d+\.\d+\.\d+/);
    expect(program.version()).not.toBe('0.0.0');
  });

  it('documents the global format option and what each format is for', () => {
    const program = createProgram();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    program.outputHelp();

    const help = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(help).toContain('--debug');
    expect(help).toContain('--format <format>');
    expect(help).toContain('completion');
    expect(help).toContain('table: human-readable terminal output');
    expect(help).toContain('json: machine-readable output for automation and');
    expect(help).toContain('downstream systems');
    expect(help).not.toContain('__complete');
  });
});

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
