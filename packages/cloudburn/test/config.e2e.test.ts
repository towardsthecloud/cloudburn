import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli.js';

const tempDirectories: string[] = [];
const originalCwd = process.cwd();

const createTempDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'cloudburn-config-'));
  tempDirectories.push(directory);
  return directory;
};

describe('config command e2e', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    process.exitCode = undefined;

    await Promise.all(
      tempDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      }),
    );
  });

  it('prints the current discovered config file with comments by default', async () => {
    const directory = await createTempDirectory();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await mkdir(join(directory, '.git'));
    await writeFile(
      join(directory, '.cloudburn.yml'),
      '# My config\niac:\n  enabled-rules:\n    - CLDBRN-AWS-EBS-1\n',
      'utf8',
    );
    process.chdir(directory);

    await createProgram().parseAsync(['config', '--print'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('# My config');
    expect(output).toContain('iac:');
    expect(output).not.toContain('| Field');
  });

  it('formats the current config file as structured json', async () => {
    const directory = await createTempDirectory();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await mkdir(join(directory, '.git'));
    await writeFile(join(directory, '.cloudburn.yml'), 'discovery:\n  format: json\n', 'utf8');
    process.chdir(directory);

    await createProgram().parseAsync(['config', '--print', '--format', 'json'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('"contentType": "application/yaml"');
    expect(output).toContain('"content": "discovery:\\n  format: json\\n"');
  });

  it('prints the starter template when requested', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['config', '--print-template'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('# Static IaC scan configuration.');
    expect(output).toContain('iac:');
    expect(output).toContain('discovery:');
  });

  it('formats the starter template as a table when requested', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['config', '--print-template', '--format', 'table'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('| Field');
    expect(output).toContain('ContentType');
    expect(output).toContain('application/yaml');
  });

  it('writes .cloudburn.yml to the repository root by default', async () => {
    const directory = await createTempDirectory();
    const nestedDirectory = join(directory, 'packages', 'cloudburn');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await mkdir(join(directory, '.git'));
    await mkdir(nestedDirectory, { recursive: true });
    process.chdir(nestedDirectory);

    await createProgram().parseAsync(['config', '--init'], { from: 'user' });

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

    await createProgram().parseAsync(['config', '--init'], { from: 'user' });

    expect(stdout).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('.cloudburn.yaml');
  });

  it('fails when no config file can be discovered for --print', async () => {
    const directory = await createTempDirectory();
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await mkdir(join(directory, '.git'));
    process.chdir(directory);

    await createProgram().parseAsync(['config', '--print'], { from: 'user' });

    expect(stdout).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('cloudburn config --init');
  });

  it('fails when config is invoked without an action flag', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['config'], { from: 'user' });

    expect(process.exitCode).toBe(2);
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('Choose exactly one action');
  });

  it('supports explicit config paths for --init and --print', async () => {
    const directory = await createTempDirectory();
    const configPath = join(directory, 'custom-config.yml');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    process.chdir(directory);

    await createProgram().parseAsync(['config', '--init', '--path', configPath], { from: 'user' });

    expect(await readFile(configPath, 'utf8')).toContain('iac:');

    stdout.mockClear();

    await createProgram().parseAsync(['config', '--print', '--path', configPath], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('# Static IaC scan configuration.');
    expect(output).toContain('discovery:');
  });

  it('fails for --init --path when a companion config file already exists', async () => {
    const directory = await createTempDirectory();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const configPath = join(directory, '.cloudburn.yaml');

    await writeFile(join(directory, '.cloudburn.yml'), 'iac: {}\n', 'utf8');
    process.chdir(directory);

    await createProgram().parseAsync(['config', '--init', '--path', configPath], { from: 'user' });

    expect(process.exitCode).toBe(2);
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('.cloudburn.yml');
  });

  it('fails when multiple config actions are requested at once', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['config', '--init', '--print'], { from: 'user' });

    expect(process.exitCode).toBe(2);
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('Choose exactly one action');
  });
});
