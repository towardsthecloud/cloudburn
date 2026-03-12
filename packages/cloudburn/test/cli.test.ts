import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli.js';

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

    expect(help).toContain('--format <format>');
    expect(help).toContain('completion <shell>');
    expect(help).toContain('table: human-readable terminal output');
    expect(help).toContain('text: tab-delimited output for grep, sed, and awk');
    expect(help).toContain('json: machine-readable output for automation and');
    expect(help).toContain('downstream systems');
    expect(help).not.toContain('__complete');
  });
});
