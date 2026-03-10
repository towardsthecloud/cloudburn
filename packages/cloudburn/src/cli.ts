import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import { registerDiscoverCommand } from './commands/discover.js';
import { registerEstimateCommand } from './commands/estimate.js';
import { registerInitCommand } from './commands/init.js';
import { registerRulesListCommand } from './commands/rules-list.js';
import { registerScanCommand } from './commands/scan.js';

declare const __VERSION__: string;

// Intent: construct the CloudBurn CLI command tree.
// TODO(cloudburn): add global flags for profile, config path, and debug logging.
export const createProgram = (): Command => {
  const program = new Command();
  program.name('cloudburn').description('Know what you spend. Fix what you waste.').version(__VERSION__);

  registerDiscoverCommand(program);
  registerScanCommand(program);
  registerInitCommand(program);
  registerRulesListCommand(program);
  registerEstimateCommand(program);

  return program;
};

export const runCli = async (): Promise<void> => {
  await createProgram().parseAsync(process.argv);
};

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) {
  await runCli();
}
