import { CloudBurnClient } from '@cloudburn/sdk';
import type { Command } from 'commander';
import { EXIT_CODE_OK, EXIT_CODE_POLICY_VIOLATION, EXIT_CODE_RUNTIME_ERROR } from '../exit-codes.js';
import { formatError } from '../formatters/error.js';
import { renderResponse, resolveOutputFormat } from '../formatters/output.js';
import { countScanResultFindings } from '../formatters/shared.js';
import { setCommandExamples } from '../help.js';
import { parseRuleIdList, parseServiceList, validateServiceList } from './config-options.js';

type ScanOptions = {
  config?: string;
  disabledRules?: string[];
  enabledRules?: string[];
  exitCode?: boolean;
  service?: string[];
};

const parseIaCServiceList = (value: string): string[] => validateServiceList('iac', parseServiceList(value)) ?? [];

const toScanConfigOverride = (options: ScanOptions) => {
  if (options.enabledRules === undefined && options.disabledRules === undefined && options.service === undefined) {
    return undefined;
  }

  return {
    iac: {
      disabledRules: options.disabledRules,
      enabledRules: options.enabledRules,
      services: options.service,
    },
  };
};

// Intent: attach the primary scanning command surface to the CLI.
// TODO(cloudburn): support profile, severity filtering, and custom rules path options.
export const registerScanCommand = (program: Command): void => {
  setCommandExamples(
    program
      .command('scan')
      .description('Run an autodetected static IaC scan')
      .argument('[path]', 'Terraform file, CloudFormation template, or directory to scan')
      .option('--config <path>', 'Explicit CloudBurn config file to load')
      .option(
        '--enabled-rules <ruleIds>',
        'Comma-separated rule IDs to enable. When set, CloudBurn checks only these rules. By default, all rules are enabled.',
        parseRuleIdList,
      )
      .option(
        '--disabled-rules <ruleIds>',
        'Comma-separated rule IDs to disable. By default, all rules are enabled; use this to exclude specific rules.',
        parseRuleIdList,
      )
      .option('--service <services>', 'Comma-separated services to include in the scan rule set.', parseIaCServiceList)
      .option('--exit-code', 'Exit with code 1 when findings exist')
      .action(async (path: string | undefined, options: ScanOptions, command: Command) => {
        try {
          const scanner = new CloudBurnClient();
          const configOverride = toScanConfigOverride(options);
          const loadedConfig = await scanner.loadConfig(options.config);
          const scanPath = path ?? process.cwd();
          const result =
            configOverride === undefined && options.config === undefined
              ? await scanner.scanStatic(scanPath)
              : options.config === undefined
                ? await scanner.scanStatic(scanPath, configOverride)
                : await scanner.scanStatic(scanPath, configOverride, { configPath: options.config });

          const format = resolveOutputFormat(command, undefined, loadedConfig.iac.format ?? 'table');
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
      }),
    ['cloudburn scan ./main.tf', 'cloudburn scan ./template.yaml', 'cloudburn scan ./iac'],
  );
};
