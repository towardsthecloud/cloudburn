import { afterEach, describe, expect, it, vi } from 'vitest';

describe('rules list e2e', { timeout: 30_000 }, () => {
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

  it('defaults to table output and applies service and source filters', async () => {
    const { createProgram } = await import('../src/cli.js');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['rules', 'list', '--service', 'ec2', '--source', 'discovery'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('| RuleId');
    expect(output).toContain('CLDBRN-AWS-EC2-3');
    expect(output).toContain('CLDBRN-AWS-EC2-5');
    expect(output).not.toContain('CLDBRN-AWS-EC2-2');
    expect(output).not.toContain('CLDBRN-AWS-S3-1');
  });

  it('rejects text output as an invalid format', async () => {
    const { createProgram } = await import('../src/cli.js');
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const program = createProgram();
    const rulesCommand = program.commands.find((command) => command.name() === 'rules');
    const listCommand = rulesCommand?.commands.find((command) => command.name() === 'list');

    program.exitOverride();
    rulesCommand?.exitOverride();
    listCommand?.exitOverride();

    await expect(
      program.parseAsync(['rules', 'list', '--format', 'text', '--service', 'ebs'], { from: 'user' }),
    ).rejects.toMatchObject({
      code: 'commander.invalidArgument',
      exitCode: 1,
      message: expect.stringContaining('text'),
    });
    expect(stderr).toHaveBeenCalled();
  });

  it('renders the empty message when filters exclude all built-in rules', async () => {
    vi.doMock('@cloudburn/sdk', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@cloudburn/sdk')>();

      return {
        ...actual,
        builtInRuleMetadata: [
          {
            description: 'Only EC2 IaC rule in this test.',
            id: 'CLDBRN-AWS-EC2-1',
            name: 'EC2 Test Rule',
            provider: 'aws',
            service: 'ec2',
            supports: ['iac'],
          },
        ],
      };
    });

    const { createProgram } = await import('../src/cli.js');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['rules', 'list', '--service', 'ec2', '--source', 'discovery'], { from: 'user' });

    expect(stdout.mock.calls.map(([chunk]) => String(chunk)).join('')).toBe('No built-in rules are available.\n');
  });

  it('rejects invalid source filters as commander argument errors', async () => {
    const { createProgram } = await import('../src/cli.js');
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const program = createProgram();
    const rulesCommand = program.commands.find((command) => command.name() === 'rules');
    const listCommand = rulesCommand?.commands.find((command) => command.name() === 'list');

    program.exitOverride();
    rulesCommand?.exitOverride();
    listCommand?.exitOverride();

    await expect(program.parseAsync(['rules', 'list', '--source', 'invalid'], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.invalidArgument',
      exitCode: 1,
      message: expect.stringContaining('Unknown source "invalid"'),
    });
    expect(stderr).toHaveBeenCalled();
  });
});
