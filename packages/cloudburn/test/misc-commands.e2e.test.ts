import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli.js';

describe('misc command e2e', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats rules list as text and json', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['rules', 'list', '--format', 'text'], { from: 'user' });
    const textOutput = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(textOutput).toContain('CLDBRN-AWS-EBS-1');

    stdout.mockClear();

    await createProgram().parseAsync(['rules', 'list', '--format', 'json'], { from: 'user' });
    const jsonOutput = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(jsonOutput).toContain('CLDBRN-AWS-EBS-1');
    expect(jsonOutput.trim().startsWith('[')).toBe(true);
  });

  it('formats rules list as a table from the global root flag', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['--format', 'table', 'rules', 'list'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('| RuleId');
    expect(output).toContain('CLDBRN-AWS-EBS-1');
  });

  it('formats estimate status in text, json, and table', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['estimate'], { from: 'user' });
    expect(stdout.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('No server configured');

    stdout.mockClear();

    await createProgram().parseAsync(['estimate', '--format', 'json', '--server', 'https://example.com'], {
      from: 'user',
    });
    expect(stdout.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('"status": "READY"');

    stdout.mockClear();

    await createProgram().parseAsync(['--format', 'table', 'estimate', '--server', 'https://example.com'], {
      from: 'user',
    });
    const tableOutput = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(tableOutput).toContain('| Field');
    expect(tableOutput).toContain('https://example.com');
  });
});
