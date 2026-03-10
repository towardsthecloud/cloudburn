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

    expect(output).toContain('version: 1');
    expect(output).toContain('rules:');
    expect(output).not.toContain('\nlive:\n');
    expect(output).not.toContain('regions:');
    expect(output).not.toContain('tags:');
  });
});
