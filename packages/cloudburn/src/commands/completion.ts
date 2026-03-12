import { type Command, InvalidArgumentError } from 'commander';
import { createCompletionTree, resolveCompletionSuggestions } from '../completion/engine.js';
import { generateCompletionScript, type SupportedShell } from '../completion/shell.js';

const parseSupportedShell = (value: string): SupportedShell => {
  switch (value) {
    case 'zsh':
    case 'bash':
    case 'fish':
      return value;
    default:
      throw new InvalidArgumentError(`Unsupported shell "${value}". Allowed shells: zsh, bash, fish.`);
  }
};

const getRootCommand = (command: Command): Command => {
  let currentCommand = command;

  while (currentCommand.parent !== null) {
    currentCommand = currentCommand.parent;
  }

  return currentCommand;
};

/**
 * Registers public and internal shell completion commands.
 *
 * @param program - Root CLI program that owns the command tree.
 * @returns Nothing. Commander mutates the program in place.
 */
export const registerCompletionCommand = (program: Command): void => {
  program
    .command('completion')
    .description('Print shell completion scripts')
    .argument('<shell>', 'Shell to generate a completion script for', parseSupportedShell)
    .action(function (this: Command, shell: SupportedShell) {
      const output = generateCompletionScript(shell, getRootCommand(this));

      process.stdout.write(output);
    });

  program
    .command('__complete', { hidden: true })
    .argument('[words...]')
    .allowUnknownOption()
    .action(function (this: Command, words: string[] | undefined) {
      const suggestions = resolveCompletionSuggestions(createCompletionTree(getRootCommand(this)), words ?? []);

      if (suggestions.length === 0) {
        return;
      }

      process.stdout.write(`${suggestions.join('\n')}\n`);
    });
};
