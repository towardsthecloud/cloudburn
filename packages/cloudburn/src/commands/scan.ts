import { CloudBurnClient, resolveScanPolicy, type Severity } from '@cloudburn/sdk';
import type { Command } from 'commander';
import { resolveCliDebugLogger } from '../debug.js';
import { EXIT_CODE_OK, EXIT_CODE_POLICY_VIOLATION, EXIT_CODE_RUNTIME_ERROR } from '../exit-codes.js';
import { formatError } from '../formatters/error.js';
import { renderResponse, resolveOutputFormat } from '../formatters/output.js';
import { setCommandExamples } from '../help.js';
import { parseRuleIdList, parseServiceList, parseSeverity, toModeConfigOverride } from './config-options.js';

type ScanOptions = {
  config?: string;
  disabledRules?: string[];
  enabledRules?: string[];
  exitCode?: boolean;
  failOn?: Severity;
  service?: string[];
};

// Intent: attach the primary scanning command surface to the CLI.
// TODO(cloudburn): support profile, severity filtering, and custom rules path options.
export const registerScanCommand = (program: Command): void => {
  setCommandExamples(
    program
      .command('scan')
      .description('Run an autodetected static IaC scan')
      .argument('[path]', 'Terraform file, CloudFormation template, or directory to scan')
      .option('--config <path>', 'Explicit CloudBurn config file to load (required for config files in CI)')
      .option(
        '--enabled-rules <ruleIds>',
        'Comma-separated rule IDs to enable. When set, CloudBurn checks only these rules. By default, AWS Core preset rules are enabled.',
        parseRuleIdList,
      )
      .option(
        '--disabled-rules <ruleIds>',
        'Comma-separated rule IDs to disable from the default AWS Core preset.',
        parseRuleIdList,
      )
      .option(
        '--service <services>',
        'Comma-separated services to include in the scan rule set.',
        parseServiceList('iac'),
      )
      .option('--exit-code', 'Exit with code 1 when findings exist')
      .option('--fail-on <severity>', 'Exit with code 1 for findings at or above this severity.', parseSeverity)
      .action(async (path: string | undefined, options: ScanOptions, command: Command) => {
        try {
          const debugLogger = resolveCliDebugLogger(command);
          const scanner = new CloudBurnClient({ debugLogger });
          const loadedConfig = await scanner.loadConfig(options.config);
          const result = await scanner.scanStatic(path ?? process.cwd(), toModeConfigOverride('iac', options), {
            configPath: options.config,
          });

          const format = resolveOutputFormat(command, undefined, loadedConfig.iac.format ?? 'table');
          const output = renderResponse({ kind: 'scan-result', result }, format);

          process.stdout.write(`${output}\n`);

          if (resolveScanPolicy(result, options).violated) {
            process.exitCode = EXIT_CODE_POLICY_VIOLATION;
            return;
          }

          process.exitCode = EXIT_CODE_OK;
        } catch (err) {
          process.stderr.write(`${formatError(err)}\n`);
          process.exitCode = EXIT_CODE_RUNTIME_ERROR;
        }
      }),
    ['cloudburn scan ./main.tf', 'cloudburn scan ./template.yaml', 'cloudburn scan ./iac'],
  );
};
