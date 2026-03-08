import { CloudBurnScanner, type ScanResult } from '@cloudburn/sdk';
import type { Command } from 'commander';
import { EXIT_CODE_OK, EXIT_CODE_POLICY_VIOLATION } from '../exit-codes.js';
import { formatJson } from '../formatters/json.js';
import { formatMarkdown } from '../formatters/markdown.js';
import { formatSarif } from '../formatters/sarif.js';
import { countScanResultFindings } from '../formatters/shared.js';
import { formatTable } from '../formatters/table.js';

type ScanOptions = {
  live?: boolean;
  format?: 'table' | 'json' | 'markdown' | 'sarif';
  exitCode?: boolean;
};

const formatters: Record<string, (result: ScanResult) => string> = {
  json: formatJson,
  markdown: formatMarkdown,
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
    .option('--format <format>', 'Output format: table|json|markdown|sarif', 'table')
    .option('--exit-code', 'Exit with code 1 when findings exist')
    .action(async (path: string | undefined, options: ScanOptions) => {
      const scanner = new CloudBurnScanner();
      const result = options.live ? await scanner.scanLive() : await scanner.scanStatic(path ?? process.cwd());

      const format = formatters[options.format ?? 'table'] ?? formatTable;
      const output = format(result);

      process.stdout.write(`${output}\n`);

      if (options.exitCode && countScanResultFindings(result) > 0) {
        process.exitCode = EXIT_CODE_POLICY_VIOLATION;
        return;
      }

      process.exitCode = EXIT_CODE_OK;
    });
};
