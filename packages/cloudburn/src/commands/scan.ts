import { CloudBurnScanner, type ScanResult } from '@cloudburn/sdk';
import { type Command, InvalidArgumentError } from 'commander';
import { EXIT_CODE_OK, EXIT_CODE_POLICY_VIOLATION, EXIT_CODE_RUNTIME_ERROR } from '../exit-codes.js';
import { formatError } from '../formatters/error.js';
import { formatJson } from '../formatters/json.js';
import { formatSarif } from '../formatters/sarif.js';
import { countScanResultFindings } from '../formatters/shared.js';
import { formatTable } from '../formatters/table.js';

const supportedScanFormats = ['table', 'json', 'sarif'] as const;
type ScanFormat = (typeof supportedScanFormats)[number];

const parseScanFormat = (value: string): ScanFormat => {
  if (supportedScanFormats.includes(value as ScanFormat)) {
    return value as ScanFormat;
  }

  throw new InvalidArgumentError(`Invalid format "${value}". Allowed formats: ${supportedScanFormats.join(', ')}.`);
};

type ScanOptions = {
  live?: boolean;
  format?: ScanFormat;
  exitCode?: boolean;
};

const formatters: Record<ScanFormat, (result: ScanResult) => string> = {
  json: formatJson,
  sarif: formatSarif,
  table: formatTable,
};

// Intent: attach the primary scanning command surface to the CLI.
// TODO(cloudburn): support profile, severity filtering, and custom rules path options.
export const registerScanCommand = (program: Command): void => {
  program
    .command('scan [path]')
    .description('Run static IaC scan or live AWS scan')
    .option('--live', 'Run live AWS scan')
    .option('--format <format>', 'Output format: table|json|sarif', parseScanFormat, 'table')
    .option('--exit-code', 'Exit with code 1 when findings exist')
    .action(async (path: string | undefined, options: ScanOptions) => {
      try {
        const scanner = new CloudBurnScanner();
        const result = options.live ? await scanner.scanLive() : await scanner.scanStatic(path ?? process.cwd());

        const format = formatters[options.format ?? 'table'];
        const output = format(result);

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
