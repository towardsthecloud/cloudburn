import type { Command } from 'commander';

/** Shell names supported by the CloudBurn completion script generator. */
export type SupportedShell = 'bash' | 'fish' | 'zsh';

const renderZshCompletion = (commandName: string): string => `#compdef ${commandName}

_${commandName}() {
  local -a suggestions
  suggestions=("\${(@f)$("\${words[1]}" __complete -- "\${words[@]:1:$((CURRENT - 1))}")}")
  _describe 'values' suggestions
}

compdef _${commandName} ${commandName}
`;

const renderBashCompletion = (commandName: string): string => `_${commandName}() {
  local -a args=()
  local line
  local -a suggestions=()

  args=("\${COMP_WORDS[@]:1:$COMP_CWORD}")
  if [ "$COMP_CWORD" -ge "\${#COMP_WORDS[@]}" ]; then
    args+=("")
  fi

  while IFS= read -r line; do
    suggestions+=("$line")
  done < <("\${COMP_WORDS[0]}" __complete -- "\${args[@]}")

  COMPREPLY=("\${suggestions[@]}")
}

complete -F _${commandName} ${commandName}
`;

const renderFishCompletion = (commandName: string): string => `function __fish_${commandName}_complete
  set -l words (commandline -opc)
  if test (count $words) -gt 0
    set -e words[1]
  end
  set -a words (commandline -ct)
  ${commandName} __complete -- $words
end

complete -c ${commandName} -f -a "(__fish_${commandName}_complete)"
`;

/**
 * Returns the shell completion script for the requested shell.
 *
 * @param shell - Target shell name.
 * @param program - Root CLI program used to derive the binary name.
 * @returns A shell-specific completion script.
 */
export const generateCompletionScript = (shell: SupportedShell, program: Command): string => {
  const commandName = program.name();

  switch (shell) {
    case 'zsh':
      return renderZshCompletion(commandName);
    case 'bash':
      return renderBashCompletion(commandName);
    case 'fish':
      return renderFishCompletion(commandName);
  }
};
