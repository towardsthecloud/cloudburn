import type { Command } from 'commander';
import {
  OUTPUT_FORMAT_OPTION_DESCRIPTION,
  parseOutputFormat,
  renderResponse,
  resolveOutputFormat,
} from '../formatters/output.js';

type EstimateOptions = {
  format?: 'json' | 'table' | 'text';
  server?: string;
};

// Intent: keep an OSS-to-paid bridge command without hard dashboard coupling.
// TODO(cloudburn): call dashboard API for pricing estimates when server is provided.
export const registerEstimateCommand = (program: Command): void => {
  program
    .command('estimate')
    .description('Request optional pricing estimates from a self-hosted dashboard')
    .option('--format <format>', OUTPUT_FORMAT_OPTION_DESCRIPTION, parseOutputFormat)
    .option('--server <url>', 'Dashboard API base URL')
    .action((options: EstimateOptions, command: Command) => {
      const format = resolveOutputFormat(command, options.format);

      if (!options.server) {
        const output = renderResponse(
          {
            kind: 'status',
            data: {
              message: 'No server configured. This command is optional and requires a dashboard URL.',
              server: '',
              status: 'NOT_CONFIGURED',
            },
            text: 'No server configured. This command is optional and requires a dashboard URL.',
          },
          format,
        );

        process.stdout.write(`${output}\n`);
        return;
      }

      const output = renderResponse(
        {
          kind: 'status',
          data: {
            message: `Estimate request scaffold ready for server: ${options.server}`,
            server: options.server,
            status: 'READY',
          },
          text: `Estimate request scaffold ready for server: ${options.server}`,
        },
        format,
      );

      process.stdout.write(`${output}\n`);
    });
};
