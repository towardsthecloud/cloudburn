import { execFileSync, spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/cli.js';

const toLines = (output: string): string[] => (output.trim().length === 0 ? [] : output.trim().split('\n'));

const runCompletion = async (...words: string[]): Promise<string> => {
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

  await createProgram().parseAsync(['__complete', '--', ...words], { from: 'user' });

  return stdout.mock.calls.map(([chunk]) => String(chunk)).join('');
};

const renderCompletionScript = async (shell: 'zsh' | 'bash' | 'fish'): Promise<string> => {
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

  await createProgram().parseAsync(['completion', shell], { from: 'user' });

  return stdout.mock.calls.map(([chunk]) => String(chunk)).join('');
};

const findShell = (shell: string): string | undefined => {
  const result = spawnSync('sh', ['-c', `command -v ${shell}`], { encoding: 'utf8' });

  return result.status === 0 ? result.stdout.trim() : undefined;
};

const zshPath = findShell('zsh');
const bashPath = findShell('bash') ?? 'bash';

describe('completion command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('suggests root commands and flags without exposing the hidden completer', async () => {
    const suggestions = toLines(await runCompletion(''));

    expect(suggestions).toEqual(
      expect.arrayContaining([
        'scan',
        'discover',
        'config',
        'rules',
        'estimate',
        'completion',
        '--format',
        '-h',
        '--help',
      ]),
    );
    expect(suggestions).not.toContain('__complete');
  });

  it('suggests discover subcommands and flags', async () => {
    const suggestions = toLines(await runCompletion('discover', ''));

    expect(suggestions).toEqual(
      expect.arrayContaining([
        'init',
        'list-enabled-regions',
        'supported-resource-types',
        '--config',
        '--disabled-rules',
        '--enabled-rules',
        '--region',
        '--format',
        '--exit-code',
        '-h',
        '--help',
      ]),
    );
  });

  it('suggests only flags for nested discover init contexts', async () => {
    const suggestions = toLines(await runCompletion('discover', 'init', '--'));

    expect(suggestions).toEqual(expect.arrayContaining(['--region', '--format', '--help']));
    expect(suggestions).not.toContain('list-enabled-regions');
  });

  it('does not suggest completions while the cursor is positioned on an option value', async () => {
    expect(await runCompletion('scan', '--format', '')).toBe('');
  });

  it('filters command suggestions by the current token prefix', async () => {
    expect(toLines(await runCompletion('ru'))).toEqual(['rules']);
  });

  it('suggests config flags', async () => {
    const suggestions = toLines(await runCompletion('config', ''));

    expect(suggestions).toEqual(
      expect.arrayContaining(['--init', '--print', '--print-template', '--path', '--format', '-h', '--help']),
    );
  });

  it('prints a zsh completion script', async () => {
    const script = await renderCompletionScript('zsh');

    expect(script).toContain('compdef _cloudburn cloudburn');
    expect(script).toContain('__complete --');
    expect(script).toContain(`"\${words[@]:1:$((CURRENT - 1))}"`);
  });

  const itWithZsh = zshPath ? it : it.skip;

  itWithZsh('passes nested zsh words through to the hidden completer', async () => {
    const script = await renderCompletionScript('zsh');
    const runnableScript = script.replace("_describe 'values' suggestions", `print -l -- "\${suggestions[@]}"`);
    const output = execFileSync(
      zshPath ?? 'zsh',
      [
        '-c',
        `
compdef() { :; }
cloudburn() { printf '%s\\n' "$@"; }
${runnableScript}
words=(cloudburn discover init "")
CURRENT=4
_cloudburn
`,
      ],
      { encoding: 'utf8' },
    );

    expect(output).toContain('discover');
    expect(output).toContain('init');
  });

  itWithZsh('limits zsh completion input to the current word', async () => {
    const script = await renderCompletionScript('zsh');
    const runnableScript = script.replace("_describe 'values' suggestions", `print -l -- "\${suggestions[@]}"`);
    const output = execFileSync(
      zshPath ?? 'zsh',
      [
        '-c',
        `
compdef() { :; }
cloudburn() { printf '%s\\n' "$@"; }
${runnableScript}
words=(cloudburn discover init --region eu-west-1)
CURRENT=3
_cloudburn
`,
      ],
      { encoding: 'utf8' },
    );

    expect(output).toContain('discover');
    expect(output).toContain('init');
    expect(output).not.toContain('--region');
    expect(output).not.toContain('eu-west-1');
  });

  it('prints a bash completion script', async () => {
    const script = await renderCompletionScript('bash');

    expect(script).toContain('complete -F _cloudburn cloudburn');
    expect(script).toContain('__complete --');
    expect(script).toContain(`args=("\${COMP_WORDS[@]:1:$COMP_CWORD}")`);
    expect(script).not.toContain('-o nosort');
  });

  it('limits bash completion input to the cursor position', async () => {
    const script = await renderCompletionScript('bash');
    const output = execFileSync(
      bashPath,
      [
        '-c',
        `
cloudburn() { printf '%s\\n' "$@"; }
${script}
COMP_WORDS=(cloudburn discover init --r --format json)
COMP_CWORD=3
_cloudburn
printf '%s\\n' "\${COMPREPLY[@]}"
`,
      ],
      { encoding: 'utf8' },
    );

    expect(output).toContain('discover');
    expect(output).toContain('init');
    expect(output).toContain('--r');
    expect(output).not.toContain('--format');
    expect(output).not.toContain('json');
  });

  it('preserves an empty current bash word at word boundaries', async () => {
    const script = await renderCompletionScript('bash');
    const output = execFileSync(
      bashPath,
      [
        '-c',
        `
cloudburn() { printf '%s\\n' "$@"; }
${script}
COMP_WORDS=(cloudburn discover)
COMP_CWORD=2
COMP_LINE='cloudburn discover '
COMP_POINT=\${#COMP_LINE}
_cloudburn
printf '%s\\n' "\${COMPREPLY[@]}"
`,
      ],
      { encoding: 'utf8' },
    );

    expect(output).toContain('__complete');
    expect(output).toContain('--');
    expect(output).toContain('discover');
    expect(output.endsWith('\n\n')).toBe(true);
  });

  it('prints a fish completion script', async () => {
    const script = await renderCompletionScript('fish');

    expect(script).toContain('complete -c cloudburn');
    expect(script).toContain('__complete --');
  });

  it('rejects unsupported completion shell usage', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const program = createProgram();
    const completionCommand = program.commands.find((command) => command.name() === 'completion');

    program.exitOverride();
    completionCommand?.exitOverride();

    await expect(program.parseAsync(['completion', 'powershell'], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.unknownCommand',
      exitCode: 1,
      message: expect.stringContaining("unknown command 'powershell'"),
    });
    expect(stderr).toHaveBeenCalled();
    expect(stderr.mock.calls.map(([chunk]) => String(chunk)).join('')).toContain('Available Commands:');
  });
});
