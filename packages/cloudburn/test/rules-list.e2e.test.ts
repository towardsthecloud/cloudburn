import { afterEach, describe, expect, it, vi } from 'vitest';

describe('rules list e2e', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock('@cloudburn/sdk');
  });

  it('renders the empty message when no built-in rules are available', async () => {
    vi.doMock('@cloudburn/sdk', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@cloudburn/sdk')>();

      return {
        ...actual,
        builtInRuleMetadata: [],
      };
    });

    const { createProgram } = await import('../src/cli.js');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['rules', 'list'], { from: 'user' });

    expect(stdout.mock.calls.map(([chunk]) => String(chunk)).join('')).toBe('No built-in rules are available.\n');
  });
});
