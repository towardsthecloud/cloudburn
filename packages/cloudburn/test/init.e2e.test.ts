import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli.js';

const tempDirectories: string[] = [];
const originalCwd = process.cwd();

const createTempDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'cloudburn-init-'));
  tempDirectories.push(directory);
  return directory;
};

describe('init command e2e', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);

    await Promise.all(
      tempDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      }),
    );
  });

  it('prints the starter config when init is invoked without a subcommand', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['init'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('# Static IaC scan configuration.');
    expect(output).toContain('iac:');
    expect(output).toContain('discovery:');
    expect(output).not.toContain('Usage: cloudburn init [command]');
  });

  it('formats the starter config as a table when a format override is provided', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['init', '--format', 'table'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('| Field');
    expect(output).toContain('ContentType');
    expect(output).toContain('application/yaml');
  });

  it('prints the starter config with comments when --print is used', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['init', 'config', '--print'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('# Static IaC scan configuration.');
    expect(output).toContain('iac:');
    expect(output).toContain('enabled-rules:');
    expect(output).toContain('disabled-rules:');
    expect(output).toContain('discovery:');
    expect(output).not.toContain('| Field');
  });

  it('formats the printed starter config as structured json', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['init', 'config', '--print', '--format', 'json'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('"contentType": "application/yaml"');
    expect(output).toContain('"content": "# Static IaC scan configuration.');
  });

  it('formats the printed starter config as a table when requested', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['init', 'config', '--print', '--format', 'table'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('| Field');
    expect(output).toContain('Content');
    expect(output).toContain('# Static IaC scan configuration.');
  });

  it('writes .cloudburn.yml to the repository root by default', async () => {
    const directory = await createTempDirectory();
    const nestedDirectory = join(directory, 'packages', 'cloudburn');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await mkdir(join(directory, '.git'));
    await mkdir(nestedDirectory, { recursive: true });
    process.chdir(nestedDirectory);

    await createProgram().parseAsync(['init', 'config'], { from: 'user' });

    expect(await readFile(join(directory, '.cloudburn.yml'), 'utf8')).toContain('iac:');
    expect(stdout.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('.cloudburn.yml');
  });

  it('fails when a config file already exists in the repository root', async () => {
    const directory = await createTempDirectory();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await mkdir(join(directory, '.git'));
    await writeFile(join(directory, '.cloudburn.yaml'), 'discovery: {}\n', 'utf8');
    process.chdir(directory);

    await createProgram().parseAsync(['init', 'config'], { from: 'user' });

    expect(stdout).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('.cloudburn.yaml');
  });
});
