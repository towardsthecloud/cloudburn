import { CloudBurnScanner, type ScanMode } from '@cloudburn/sdk';
import type { Command } from 'commander';
import { EXIT_CODE_OK, EXIT_CODE_POLICY_VIOLATION } from '../exit-codes.js';
import { formatJson } from '../formatters/json.js';
import { formatMarkdown } from '../formatters/markdown.js';
import { formatSarif } from '../formatters/sarif.js';
import { formatTable } from '../formatters/table.js';

type ScanOptions = {
  live?: boolean;
  format?: 'table' | 'json' | 'markdown' | 'sarif';
  exitCode?: boolean;
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
      const mode: ScanMode = options.live ? 'live' : 'static';
      const result = mode === 'live' ? await scanner.scanLive() : await scanner.scanStatic(path ?? process.cwd());

      const formatter = options.format ?? 'table';
      const output =
        formatter === 'json'
          ? formatJson(result.findings)
          : formatter === 'markdown'
            ? formatMarkdown(result.findings)
            : formatter === 'sarif'
              ? formatSarif(result.findings)
              : formatTable(result.findings);

      process.stdout.write(`${output}\n`);

      if (options.exitCode && result.findings.length > 0) {
        process.exitCode = EXIT_CODE_POLICY_VIOLATION;
        return;
      }

      process.exitCode = EXIT_CODE_OK;
    });
};
