import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import { registerCompletionCommand } from './commands/completion.js';
import { registerConfigCommand } from './commands/config.js';
import { registerDiscoverCommand } from './commands/discover.js';
import { registerEstimateCommand } from './commands/estimate.js';
import { registerRulesListCommand } from './commands/rules-list.js';
import { registerScanCommand } from './commands/scan.js';
import { OUTPUT_FORMAT_OPTION_DESCRIPTION, parseOutputFormat } from './formatters/output.js';
import { configureCliHelp, createCliCommand } from './help.js';

declare const __VERSION__: string;

const resolveEntrypointPath = (entrypointPath: string): string => {
  try {
    return realpathSync.native(entrypointPath);
  } catch {
    return resolve(entrypointPath);
  }
};

/**
 * Determines whether the current module was invoked as the CLI entrypoint.
 *
 * @param moduleUrl - The `import.meta.url` value for the current module.
 * @param argvEntry - The executed script path, typically `process.argv[1]`.
 * @returns `true` when both paths resolve to the same file, including symlinked npm shims.
 */
export const isCliEntrypoint = (moduleUrl: string, argvEntry: string | undefined = process.argv[1]): boolean => {
  if (argvEntry === undefined) {
    return false;
  }

  return resolveEntrypointPath(fileURLToPath(moduleUrl)) === resolveEntrypointPath(argvEntry);
};

// Intent: construct the CloudBurn CLI command tree.
// TODO(cloudburn): add global flags for profile, config path, and debug logging.
export const createProgram = (): Command => {
  const program = createCliCommand();
  program
    .name('cloudburn')
    .usage('[command]')
    .description('Know what you spend. Fix what you waste.')
    .version(__VERSION__)
    .option('--format <format>', OUTPUT_FORMAT_OPTION_DESCRIPTION, parseOutputFormat);
  configureCliHelp(program);

  registerCompletionCommand(program);
  registerConfigCommand(program);
  registerDiscoverCommand(program);
  registerScanCommand(program);
  registerRulesListCommand(program);
  registerEstimateCommand(program);

  return program;
};

export const runCli = async (): Promise<void> => {
  await createProgram().parseAsync(process.argv);
};

if (isCliEntrypoint(import.meta.url)) {
  await runCli();
}
