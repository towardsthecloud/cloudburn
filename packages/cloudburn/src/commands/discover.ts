import { type AwsDiscoveryTarget, assertValidAwsRegion, CloudBurnClient } from '@cloudburn/sdk';
import { type Command, InvalidArgumentError } from 'commander';
import { EXIT_CODE_OK, EXIT_CODE_POLICY_VIOLATION, EXIT_CODE_RUNTIME_ERROR } from '../exit-codes.js';
import { formatError } from '../formatters/error.js';
import {
  OUTPUT_FORMAT_OPTION_DESCRIPTION,
  parseOutputFormat,
  renderResponse,
  resolveOutputFormat,
} from '../formatters/output.js';
import { countScanResultFindings } from '../formatters/shared.js';

type DiscoverOptions = {
  exitCode?: boolean;
  format?: 'json' | 'table' | 'text';
  region?: string;
};

type DiscoverListOptions = {
  format?: 'json' | 'table' | 'text';
};

type DiscoverInitOptions = {
  format?: 'json' | 'table' | 'text';
  region?: string;
};

const parseAwsRegion = (value: string): string => {
  try {
    return assertValidAwsRegion(value);
  } catch (err) {
    throw new InvalidArgumentError(err instanceof Error ? err.message : 'Invalid AWS region.');
  }
};

const parseDiscoverRegion = (value: string): string => {
  if (value === 'all') {
    return value;
  }

  return parseAwsRegion(value);
};

const resolveDiscoveryTarget = (region?: string): AwsDiscoveryTarget =>
  region === undefined ? { mode: 'current' } : region === 'all' ? { mode: 'all' } : { mode: 'region', region };

const runCommand = async (action: () => Promise<number | undefined>): Promise<void> => {
  try {
    process.exitCode = (await action()) ?? EXIT_CODE_OK;
  } catch (err) {
    process.stderr.write(`${formatError(err)}\n`);
    process.exitCode = EXIT_CODE_RUNTIME_ERROR;
  }
};

/**
 * Registers the live AWS discovery command tree.
 *
 * @param program - Root CLI program that owns the command tree.
 * @returns Nothing. Commander mutates the program in place.
 */
export const registerDiscoverCommand = (program: Command): void => {
  const discoverCommand = program
    .command('discover')
    .description('Run a live AWS discovery')
    .enablePositionalOptions()
    .option(
      '--region <region>',
      'Discovery region to use. Pass "all" to require an aggregator index.',
      parseDiscoverRegion,
    )
    .option('--format <format>', OUTPUT_FORMAT_OPTION_DESCRIPTION, parseOutputFormat)
    .option('--exit-code', 'Exit with code 1 when findings exist')
    .addHelpText(
      'after',
      `
Examples:
  cloudburn discover
  cloudburn discover --region eu-central-1
  cloudburn discover --region all
  cloudburn discover list-enabled-regions
  cloudburn discover init
`,
    )
    .action(async (options: DiscoverOptions, command: Command) => {
      await runCommand(async () => {
        const scanner = new CloudBurnClient();
        const result = await scanner.discover({ target: resolveDiscoveryTarget(options.region) });
        const format = resolveOutputFormat(command, options.format);
        const output = renderResponse({ kind: 'scan-result', result }, format);

        process.stdout.write(`${output}\n`);

        if (options.exitCode && countScanResultFindings(result) > 0) {
          return EXIT_CODE_POLICY_VIOLATION;
        }

        return EXIT_CODE_OK;
      });
    });

  discoverCommand
    .command('list-enabled-regions')
    .description('List AWS regions with a local or aggregator Resource Explorer index')
    .option('--format <format>', OUTPUT_FORMAT_OPTION_DESCRIPTION, parseOutputFormat)
    .action(async (options: DiscoverListOptions, command: Command) => {
      await runCommand(async () => {
        const scanner = new CloudBurnClient();
        const regions = await scanner.listEnabledDiscoveryRegions();
        const format = resolveOutputFormat(command, options.format);
        const output = renderResponse(
          {
            kind: 'record-list',
            columns: [
              { key: 'region', header: 'Region' },
              { key: 'type', header: 'Type' },
            ],
            emptyMessage: 'No Resource Explorer indexes are enabled.',
            rows: regions,
          },
          format,
        );

        process.stdout.write(`${output}\n`);
        return EXIT_CODE_OK;
      });
    });

  discoverCommand
    .command('init')
    .description('Set up AWS Resource Explorer for CloudBurn')
    .option('--format <format>', OUTPUT_FORMAT_OPTION_DESCRIPTION, parseOutputFormat)
    .option('--region <region>', 'Aggregator region to create or reuse during setup', parseAwsRegion)
    .action(async (options: DiscoverInitOptions, command: Command) => {
      await runCommand(async () => {
        const scanner = new CloudBurnClient();
        const parentRegion = discoverCommand.opts().region;
        const region = options.region ?? (parentRegion === 'all' ? undefined : parentRegion);
        const result = await scanner.initializeDiscovery({ region });
        const message =
          result.status === 'EXISTING'
            ? `Resource Explorer setup already exists in ${result.aggregatorRegion}.`
            : `Resource Explorer setup created in ${result.aggregatorRegion}.`;
        const format = resolveOutputFormat(command, options.format);
        const output = renderResponse(
          {
            kind: 'status',
            data: {
              aggregatorRegion: result.aggregatorRegion,
              message,
              regions: result.regions,
              status: result.status,
              taskId: result.taskId ?? '',
            },
            text: message,
          },
          format,
        );

        process.stdout.write(`${output}\n`);
        return EXIT_CODE_OK;
      });
    });

  discoverCommand
    .command('supported-resource-types')
    .description('List Resource Explorer supported AWS resource types')
    .option('--format <format>', OUTPUT_FORMAT_OPTION_DESCRIPTION, parseOutputFormat)
    .action(async (options: DiscoverListOptions, command: Command) => {
      await runCommand(async () => {
        const scanner = new CloudBurnClient();
        const resourceTypes = await scanner.listSupportedDiscoveryResourceTypes();
        const format = resolveOutputFormat(command, options.format);
        const output = renderResponse(
          {
            kind: 'record-list',
            columns: [
              { key: 'resourceType', header: 'ResourceType' },
              { key: 'service', header: 'Service' },
            ],
            emptyMessage: 'No supported resource types were returned.',
            rows: resourceTypes.map((resourceType) => ({
              resourceType: resourceType.resourceType,
              service: resourceType.service ?? 'unknown',
            })),
          },
          format,
        );

        process.stdout.write(`${output}\n`);
        return EXIT_CODE_OK;
      });
    });
};
