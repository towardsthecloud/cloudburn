import type { Command } from 'commander';
import { createCompletionTree, resolveCompletionSuggestions } from '../completion/engine.js';
import { generateCompletionScript, type SupportedShell } from '../completion/shell.js';
import { registerParentCommand, setCommandUsageGuidance } from '../help.js';

const getRootCommand = (command: Command): Command => {
  let currentCommand = command;

  while (currentCommand.parent !== null) {
    currentCommand = currentCommand.parent;
  }

  return currentCommand;
};

const getCompletionHelpText = (shell: SupportedShell): string => {
  switch (shell) {
    case 'bash':
      return `
To load completions in your current shell session:

  source <(cloudburn completion bash)

To load completions for every new session, add this to your shell config:

  source <(cloudburn completion bash)
`;
    case 'fish':
      return `
To load completions in your current shell session:

  cloudburn completion fish | source

To load completions for every new session, add this to your shell config:

  cloudburn completion fish | source
`;
    case 'zsh':
      return `
If shell completion is not already enabled in your environment you will need
to enable it. You can execute the following once:

  echo "autoload -U compinit; compinit" >> ~/.zshrc

To load completions in your current shell session:

  source <(cloudburn completion zsh)

To load completions for every new session, add this to your shell config:

  source <(cloudburn completion zsh)
`;
  }
};

/**
 * Registers public and internal shell completion commands.
 *
 * @param program - Root CLI program that owns the command tree.
 * @returns Nothing. Commander mutates the program in place.
 */
export const registerCompletionCommand = (program: Command): void => {
  const completionCommand = registerParentCommand(
    program,
    'completion',
    'Generate shell completion scripts for CloudBurn.',
  );

  for (const shell of ['bash', 'fish', 'zsh'] satisfies SupportedShell[]) {
    setCommandUsageGuidance(
      completionCommand
        .command(shell)
        .description(`Generate the autocompletion script for the ${shell} shell.`)
        .option('--no-descriptions', 'disable completion descriptions')
        .action(function (this: Command) {
          const output = generateCompletionScript(shell, getRootCommand(this));

          process.stdout.write(output);
        }),
      getCompletionHelpText(shell),
    );
  }

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
