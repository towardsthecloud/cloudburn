import type { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli.js';
import { setCommandExamples } from '../src/help.js';

type CapturedOutput = {
  stderr: string;
  stdout: string;
};

const captureHelpOutput = async (
  args: string[],
): Promise<CapturedOutput & { error: Error & { code?: string; exitCode?: number } }> => {
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const program = createProgram();

  applyExitOverride(program);

  try {
    await program.parseAsync(args, { from: 'user' });
    throw new Error(`Expected command ${args.join(' ')} to fail.`);
  } catch (error) {
    return {
      error: error as Error & { code?: string; exitCode?: number },
      stderr: stderr.mock.calls.map(([chunk]) => String(chunk)).join(''),
      stdout: stdout.mock.calls.map(([chunk]) => String(chunk)).join(''),
    };
  }
};

const applyExitOverride = (command: Command): void => {
  command.exitOverride();
  command.commands.forEach((subcommand) => {
    applyExitOverride(subcommand);
  });
};

describe('cli help e2e', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('renders Cobra-style root help headings and global flags', () => {
    const program = createProgram();

    const help = program.helpInformation();

    expect(help.indexOf('Know what you spend. Fix what you waste.')).toBeLessThan(help.indexOf('Usage: cloudburn'));
    expect(help).toContain('Usage: cloudburn');
    expect(help).toContain('Available Commands:');
    expect(help).toContain('Global Flags:');
    expect(help).toContain('--debug');
    expect(help).toContain('completion');
    expect(help).not.toContain('__complete');
    expect(help).not.toContain('Use "cloudburn [command] --help" for more information about a command.');
    expect(help.endsWith('\n')).toBe(true);
  });

  it('prints scoped parent help when rules is invoked without a subcommand', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProgram().parseAsync(['rules'], { from: 'user' });

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(output).toContain('Usage: cloudburn rules [command]');
    expect(output).toContain('Available Commands:');
    expect(output).toContain('list');
    expect(output).toContain('Global Flags:');
    expect(output.indexOf('Available Commands:')).toBeLessThan(output.indexOf('Global Flags:'));
    expect(output.indexOf('Global Flags:')).toBeLessThan(output.indexOf('Specify one of the available subcommands'));
    expect(output).toContain('Specify one of the available subcommands to continue.');
    expect(output).toContain('Try: cloudburn rules list');
    expect(output).not.toContain('Use "cloudburn rules [command] --help" for more information about a command.');
  });

  it('shows scoped help after invalid completion subcommand usage', async () => {
    const { error, stderr } = await captureHelpOutput(['completion', 'powershell']);

    expect(error.code).toBe('commander.unknownCommand');
    expect(stderr).toContain(`error: unknown command 'powershell'`);
    expect(stderr).not.toContain('Generate shell completion scripts for CloudBurn.');
    expect(stderr).toContain('Usage: cloudburn completion [command]');
    expect(stderr).toContain('Available Commands:');
    expect(stderr).toContain('bash');
    expect(stderr).toContain('zsh');
    expect(stderr).toContain('Global Flags:');
    expect(stderr).toContain('Use "cloudburn completion [command] --help" for more information about a command.');
    expect(stderr).not.toContain('Specify one of the available subcommands to continue.');
  });

  it('shows local and global flags on nested shell help and places usage guidance below usage', async () => {
    const program = createProgram();
    const completionCommand = program.commands.find((command) => command.name() === 'completion');
    const zshCommand = completionCommand?.commands.find((command) => command.name() === 'zsh');

    const help = zshCommand?.helpInformation() ?? '';

    expect(help).toContain('Usage: cloudburn completion zsh [options]');
    expect(help).toContain('If shell completion is not already enabled in your environment you will need');
    expect(help.indexOf('Usage: cloudburn completion zsh [options]')).toBeLessThan(
      help.indexOf('If shell completion is not already enabled in your environment you will need'),
    );
    expect(help.indexOf('If shell completion is not already enabled in your environment you will need')).toBeLessThan(
      help.indexOf('Flags:'),
    );
    expect(help).toContain('Flags:');
    expect(help).toContain('--no-descriptions');
    expect(help).toContain('Global Flags:');
    expect(help).toContain('--debug');
    expect(help).toContain('--format <format>');
    expect(help).toContain('Options: table: human-readable terminal output.');
    expect(help).toContain('json: machine-readable output for automation and downstream systems.');
    expect(help).not.toContain('Use "cloudburn completion zsh [command] --help"');
  });

  it('does not label parent command flags as global flags on nested help', () => {
    const program = createProgram();
    const discoverCommand = program.commands.find((command) => command.name() === 'discover');
    const initCommand = discoverCommand?.commands.find((command) => command.name() === 'init');
    const help = initCommand?.helpInformation() ?? '';

    expect(help).toContain('Usage: cloudburn discover init [options]');
    expect(help).toContain('Flags:');
    expect(help).toContain('Requested aggregator region to create or reuse');
    expect(help).toContain('during setup.');
    expect(help).toContain('Global Flags:');
    expect(help).toContain('--debug');
    expect(help).toContain('--format <format>');
    expect(help).not.toContain('Discovery region to use. Defaults to the current AWS region from AWS_REGION');
    expect(help).not.toContain('--config <path>');
    expect(help).not.toContain('--enabled-rules <ruleIds>');
    expect(help).not.toContain('--disabled-rules <ruleIds>');
    expect(help).not.toContain('--exit-code');
  });

  it('shows command descriptions before usage for leaf command help', () => {
    const program = createProgram();
    const scanCommand = program.commands.find((command) => command.name() === 'scan');
    const help = scanCommand?.helpInformation() ?? '';

    expect(help.indexOf('Run an autodetected static IaC scan')).toBeLessThan(
      help.indexOf('Usage: cloudburn scan [options] [path]'),
    );
    expect(help.indexOf('Examples:')).toBeGreaterThan(help.indexOf('Usage: cloudburn scan [options] [path]'));
    expect(help.indexOf('Examples:')).toBeLessThan(help.indexOf('Arguments:'));
    expect(help).toContain('cloudburn scan ./main.tf');
    expect(help).toContain('cloudburn scan ./template.yaml');
    expect(help).toContain('cloudburn scan ./iac');
  });

  it('shows the command description only once for parent command help', () => {
    const program = createProgram();
    const completionCommand = program.commands.find((command) => command.name() === 'completion');

    const help = completionCommand?.helpInformation() ?? '';
    const descriptionMatches = help.match(/Generate shell completion scripts for CloudBurn\./g) ?? [];

    expect(descriptionMatches).toHaveLength(1);
  });

  it('keeps explicit help distinct from incomplete parent command usage', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const program = createProgram();

    program.exitOverride();
    program.commands.forEach((command) => {
      command.exitOverride();
    });

    await program.parseAsync(['completion'], { from: 'user' });
    const bareOutput = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    stdout.mockClear();

    await expect(program.parseAsync(['completion', '--help'], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.helpDisplayed',
      exitCode: 0,
    });
    const explicitHelpOutput = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(bareOutput).toContain('Usage: cloudburn completion [command]');
    expect(explicitHelpOutput).toContain('Usage: cloudburn completion [command]');
    expect(bareOutput).toContain('Specify one of the available subcommands to continue.');
    expect(bareOutput).toContain('Try: cloudburn completion bash');
    expect(explicitHelpOutput).not.toContain('Specify one of the available subcommands to continue.');
    expect(explicitHelpOutput).not.toContain('Try: cloudburn completion bash');
    expect(explicitHelpOutput).not.toContain(
      'Use "cloudburn completion [command] --help" for more information about a command.',
    );
  });

  it('uses the first example as recovery guidance for missing required arguments', async () => {
    const program = createProgram();

    setCommandExamples(
      program.command('require-target').description('Require a target path').argument('<path>', 'Target path to use'),
      ['cloudburn require-target ./fixtures/example.tf'],
    );

    applyExitOverride(program);

    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(program.parseAsync(['require-target'], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.missingArgument',
      exitCode: 1,
    });

    const stdoutOutput = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');
    const stderrOutput = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');

    expect(stdoutOutput).toBe('');
    expect(stderrOutput).toContain("error: missing required argument 'path'");
    expect(stderrOutput).not.toContain('Require a target path');
    expect(stderrOutput).toContain('Usage: cloudburn require-target [options] <path>');
    expect(stderrOutput).toContain('Arguments:');
    expect(stderrOutput).toContain('Try: cloudburn require-target ./fixtures/example.tf');
  });
});
