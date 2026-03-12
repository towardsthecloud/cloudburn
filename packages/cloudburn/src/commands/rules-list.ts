import { builtInRuleMetadata } from '@cloudburn/sdk';
import type { Command } from 'commander';
import { renderResponse, resolveOutputFormat } from '../formatters/output.js';
import { registerParentCommand } from '../help.js';

// Intent: expose built-in rules so users can inspect shipped policy metadata.
// TODO(cloudburn): include configured custom rule discovery when the SDK registry supports it.
export const registerRulesListCommand = (program: Command): void => {
  const rulesCommand = registerParentCommand(program, 'rules', 'Inspect built-in CloudBurn rules');

  rulesCommand
    .command('list')
    .description('List built-in CloudBurn rules')
    .action(function (this: Command) {
      const output = renderResponse(
        {
          kind: 'rule-list',
          emptyMessage: 'No built-in rules are available.',
          rules: builtInRuleMetadata,
        },
        resolveOutputFormat(this, undefined, 'text'),
      );

      process.stdout.write(`${output}\n`);
    });
};
