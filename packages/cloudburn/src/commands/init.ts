import type { Command } from 'commander';
import {
  OUTPUT_FORMAT_OPTION_DESCRIPTION,
  parseOutputFormat,
  renderResponse,
  resolveOutputFormat,
} from '../formatters/output.js';

const starterConfig = `version: 1
profile: dev

# Profiles are parsed but not applied yet, so configure the active rules block directly for now.
rules:
  ec2-instance-type-preferred:
    severity: error
`;

// Intent: scaffold starter config for new projects.
// TODO(cloudburn): write .cloudburn.yml to disk with overwrite safeguards.
export const registerInitCommand = (program: Command): void => {
  program
    .command('init')
    .description('Print a starter .cloudburn.yml configuration')
    .option('--format <format>', OUTPUT_FORMAT_OPTION_DESCRIPTION, parseOutputFormat)
    .action((options: { format?: 'json' | 'table' | 'text' }, command: Command) => {
      const output = renderResponse(
        {
          kind: 'document',
          content: starterConfig,
          contentType: 'application/yaml',
        },
        resolveOutputFormat(command, options.format, 'text'),
      );

      process.stdout.write(`${output}\n`);
    });
};
