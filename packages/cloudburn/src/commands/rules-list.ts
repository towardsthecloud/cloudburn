import { builtInRuleMetadata } from '@cloudburn/sdk';
import type { Command } from 'commander';
import {
  OUTPUT_FORMAT_OPTION_DESCRIPTION,
  parseOutputFormat,
  renderResponse,
  resolveOutputFormat,
} from '../formatters/output.js';

// Intent: expose built-in rules so users can inspect shipped policy metadata.
// TODO(cloudburn): include configured custom rule discovery when the SDK registry supports it.
export const registerRulesListCommand = (program: Command): void => {
  const rulesCommand = program.command('rules').description('Inspect built-in CloudBurn rules');

  rulesCommand
    .command('list')
    .description('List built-in CloudBurn rules')
    .option('--format <format>', OUTPUT_FORMAT_OPTION_DESCRIPTION, parseOutputFormat)
    .action((options: { format?: 'json' | 'table' | 'text' }, command: Command) => {
      const output = renderResponse(
        {
          kind: 'rule-list',
          emptyMessage: 'No built-in rules are available.',
          rules: builtInRuleMetadata,
        },
        resolveOutputFormat(command, options.format, 'text'),
      );

      process.stdout.write(`${output}\n`);
    });
};
