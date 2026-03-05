import { awsCorePreset } from '@cloudburn/sdk';
import type { Command } from 'commander';

// Intent: expose built-in rules so users can inspect what ships by default.
// TODO(cloudburn): print richer metadata and include custom rule discovery.
export const registerRulesListCommand = (program: Command): void => {
  const rulesCommand = program.command('rules').description('Inspect built-in and custom rules');

  rulesCommand
    .command('list')
    .description('List built-in CloudBurn rule IDs')
    .action(() => {
      process.stdout.write(`${awsCorePreset.ruleIds.join('\n')}\n`);
    });
};
