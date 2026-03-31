import type { Command } from 'commander';

/**
 * Resolves the effective CLI debug flag, including inherited global options.
 *
 * @param command - Active Commander command.
 * @returns Whether debug output is enabled.
 */
export const isDebugEnabled = (command: Command): boolean => {
  const options = command.optsWithGlobals() as { debug?: boolean };

  return options.debug === true;
};

/**
 * Creates a stderr debug logger for the active command when requested.
 *
 * @param command - Active Commander command.
 * @returns Logger callback, or `undefined` when debug mode is off.
 */
export const resolveCliDebugLogger = (command: Command): ((message: string) => void) | undefined => {
  if (!isDebugEnabled(command)) {
    return undefined;
  }

  return (message: string) => {
    process.stderr.write(`[debug] ${message}\n`);
  };
};
