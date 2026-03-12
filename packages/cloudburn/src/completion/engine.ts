import type { Command, Option } from 'commander';

type CompletionOption = {
  expectsValue: boolean;
  tokens: string[];
};

type CompletionNode = {
  commands: CompletionNode[];
  name: string;
  options: CompletionOption[];
};

const buildCompletionTree = (command: Command): CompletionNode => {
  const help = command.createHelp();

  return {
    commands: help.visibleCommands(command).map((childCommand) => buildCompletionTree(childCommand)),
    name: command.name(),
    options: collectVisibleOptions([...help.visibleOptions(command), ...help.visibleGlobalOptions(command)]),
  };
};

const collectVisibleOptions = (options: readonly Option[]): CompletionOption[] =>
  options.map((option) => ({
    expectsValue: option.required || option.optional,
    tokens: [option.short, option.long].filter((token): token is string => token !== undefined),
  }));

const flattenOptionTokens = (options: readonly CompletionOption[]): string[] => {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const option of options) {
    for (const token of option.tokens) {
      if (seen.has(token)) {
        continue;
      }

      seen.add(token);
      tokens.push(token);
    }
  }

  return tokens;
};

const findOption = (options: readonly CompletionOption[], token: string): CompletionOption | undefined =>
  options.find((option) => option.tokens.includes(token));

const parseOptionToken = (token: string): { hasInlineValue: boolean; name: string } => {
  const separatorIndex = token.indexOf('=');

  if (separatorIndex === -1) {
    return { hasInlineValue: false, name: token };
  }

  return {
    hasInlineValue: true,
    name: token.slice(0, separatorIndex),
  };
};

/**
 * Builds a completion tree from the visible Commander command surface.
 *
 * @param command - Root command to inspect.
 * @returns A normalized tree used by the completion resolver.
 */
export const createCompletionTree = (command: Command): CompletionNode => buildCompletionTree(command);

/**
 * Resolves command and option suggestions for the current argv-like token list.
 *
 * @param root - Completion tree for the CLI program.
 * @param words - Tokens after the binary name, including the current partial token when available.
 * @returns Matching completion candidates in declaration order.
 */
export const resolveCompletionSuggestions = (root: CompletionNode, words: readonly string[]): string[] => {
  const committedWords = words.length === 0 ? [] : words.slice(0, -1);
  const partialWord = words.at(-1) ?? '';
  let currentNode = root;
  let expectsOptionValue = false;

  for (const word of committedWords) {
    if (expectsOptionValue) {
      expectsOptionValue = false;
      continue;
    }

    if (word.startsWith('-')) {
      const parsedOption = parseOptionToken(word);
      const option = findOption(currentNode.options, parsedOption.name);

      if (option?.expectsValue && !parsedOption.hasInlineValue) {
        expectsOptionValue = true;
      }

      continue;
    }

    const nextNode = currentNode.commands.find((command) => command.name === word);
    if (nextNode !== undefined) {
      currentNode = nextNode;
    }
  }

  if (expectsOptionValue) {
    return [];
  }

  if (partialWord.startsWith('-')) {
    const parsedOption = parseOptionToken(partialWord);

    if (parsedOption.hasInlineValue && findOption(currentNode.options, parsedOption.name) !== undefined) {
      return [];
    }

    return flattenOptionTokens(currentNode.options).filter((token) => token.startsWith(partialWord));
  }

  const commandSuggestions = currentNode.commands
    .map((command) => command.name)
    .filter((commandName) => commandName.startsWith(partialWord));

  if (partialWord.length > 0) {
    return commandSuggestions;
  }

  return [...commandSuggestions, ...flattenOptionTokens(currentNode.options)];
};
