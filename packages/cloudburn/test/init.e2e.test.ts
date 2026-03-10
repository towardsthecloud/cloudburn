import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli.js';

describe('init command e2e', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints a starter config without legacy live discovery settings', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['init'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output.startsWith('version: 1')).toBe(true);
    expect(output).toContain('version: 1');
    expect(output).toContain('rules:');
    expect(output).not.toContain('| Field');
    expect(output).not.toContain('\nlive:\n');
    expect(output).not.toContain('regions:');
    expect(output).not.toContain('tags:');
  });

  it('formats the starter config as structured json', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['init', '--format', 'json'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('"contentType": "application/yaml"');
    expect(output).toContain('"content": "version: 1');
  });

  it('formats the starter config as a table from the global root flag', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['--format', 'table', 'init'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('| Field       | Value');
    expect(output).toContain('application/yaml');
    expect(output).toContain('version: 1\\nprofile: dev');
  });
});
