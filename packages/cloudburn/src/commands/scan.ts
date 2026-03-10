import { CloudBurnClient } from '@cloudburn/sdk';
import type { Command } from 'commander';
import { EXIT_CODE_OK, EXIT_CODE_POLICY_VIOLATION, EXIT_CODE_RUNTIME_ERROR } from '../exit-codes.js';
import { formatError } from '../formatters/error.js';
import {
  OUTPUT_FORMAT_OPTION_DESCRIPTION,
  parseOutputFormat,
  renderResponse,
  resolveOutputFormat,
} from '../formatters/output.js';
import { countScanResultFindings } from '../formatters/shared.js';

type ScanOptions = {
  exitCode?: boolean;
  format?: 'json' | 'table' | 'text';
};

// Intent: attach the primary scanning command surface to the CLI.
// TODO(cloudburn): support profile, severity filtering, and custom rules path options.
export const registerScanCommand = (program: Command): void => {
  program
    .command('scan')
    .description('Run an autodetected static IaC scan')
    .argument('[path]', 'Terraform file, CloudFormation template, or directory to scan')
    .option('--format <format>', OUTPUT_FORMAT_OPTION_DESCRIPTION, parseOutputFormat)
    .option('--exit-code', 'Exit with code 1 when findings exist')
    .addHelpText(
      'after',
      `
Examples:
  cloudburn scan ./main.tf
  cloudburn scan ./template.yaml
  cloudburn scan ./iac
`,
    )
    .action(async (path: string | undefined, options: ScanOptions, command: Command) => {
      try {
        const scanner = new CloudBurnClient();
        const result = await scanner.scanStatic(path ?? process.cwd());

        const format = resolveOutputFormat(command, options.format);
        const output = renderResponse({ kind: 'scan-result', result }, format);

        process.stdout.write(`${output}\n`);

        if (options.exitCode && countScanResultFindings(result) > 0) {
          process.exitCode = EXIT_CODE_POLICY_VIOLATION;
          return;
        }

        process.exitCode = EXIT_CODE_OK;
      } catch (err) {
        process.stderr.write(`${formatError(err)}\n`);
        process.exitCode = EXIT_CODE_RUNTIME_ERROR;
      }
    });
};
