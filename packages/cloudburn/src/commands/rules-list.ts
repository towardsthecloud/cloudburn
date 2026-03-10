import { awsCorePreset } from '@cloudburn/sdk';
import type { Command } from 'commander';
import {
  OUTPUT_FORMAT_OPTION_DESCRIPTION,
  parseOutputFormat,
  renderResponse,
  resolveOutputFormat,
} from '../formatters/output.js';

// Intent: expose built-in rules so users can inspect what ships by default.
// TODO(cloudburn): print richer metadata and include custom rule discovery.
export const registerRulesListCommand = (program: Command): void => {
  const rulesCommand = program.command('rules').description('Inspect built-in and custom rules');

  rulesCommand
    .command('list')
    .description('List built-in CloudBurn rule IDs')
    .option('--format <format>', OUTPUT_FORMAT_OPTION_DESCRIPTION, parseOutputFormat)
    .action((options: { format?: 'json' | 'table' | 'text' }, command: Command) => {
      const output = renderResponse(
        {
          kind: 'string-list',
          columnHeader: 'RuleId',
          emptyMessage: 'No built-in rules are available.',
          values: awsCorePreset.ruleIds,
        },
        resolveOutputFormat(command, options.format),
      );

      process.stdout.write(`${output}\n`);
    });
};
