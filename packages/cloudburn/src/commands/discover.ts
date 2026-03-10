import {
  type AwsDiscoveryInitialization,
  type AwsDiscoveryRegion,
  type AwsDiscoveryTarget,
  type AwsSupportedResourceType,
  assertValidAwsRegion,
  CloudBurnClient,
  type ScanResult,
} from '@cloudburn/sdk';
import { type Command, InvalidArgumentError } from 'commander';
import { EXIT_CODE_OK, EXIT_CODE_POLICY_VIOLATION, EXIT_CODE_RUNTIME_ERROR } from '../exit-codes.js';
import { formatError } from '../formatters/error.js';
import { formatJson } from '../formatters/json.js';
import { formatSarif } from '../formatters/sarif.js';
import { countScanResultFindings } from '../formatters/shared.js';
import { formatTable } from '../formatters/table.js';

const supportedDiscoverFormats = ['table', 'json', 'sarif'] as const;
type DiscoverFormat = (typeof supportedDiscoverFormats)[number];
type DiscoverListFormat = 'table' | 'json';

type DiscoverOptions = {
  format?: DiscoverFormat;
  exitCode?: boolean;
  region?: string;
};

type DiscoverListOptions = {
  format?: DiscoverListFormat;
};

type DiscoverInitOptions = {
  region?: string;
};

const parseDiscoverFormat = (value: string): DiscoverFormat => {
  if (supportedDiscoverFormats.includes(value as DiscoverFormat)) {
    return value as DiscoverFormat;
  }

  throw new InvalidArgumentError(`Invalid format "${value}". Allowed formats: ${supportedDiscoverFormats.join(', ')}.`);
};

const parseDiscoverListFormat = (value: string): DiscoverListFormat => {
  if (value === 'table' || value === 'json') {
    return value;
  }

  throw new InvalidArgumentError('Invalid format. Allowed formats: table, json.');
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

const scanFormatters: Record<DiscoverFormat, (result: ScanResult) => string> = {
  json: formatJson,
  sarif: formatSarif,
  table: formatTable,
};

const formatValue = (value: unknown): string => JSON.stringify(value, null, 2);

const formatEnabledRegions = (regions: AwsDiscoveryRegion[]): string =>
  regions.length === 0
    ? 'No Resource Explorer indexes are enabled.'
    : regions.map(({ region, type }) => `${region}\t${type}`).join('\n');

const formatSupportedResourceTypes = (resourceTypes: AwsSupportedResourceType[]): string =>
  resourceTypes.length === 0
    ? 'No supported resource types were returned.'
    : resourceTypes.map(({ resourceType, service }) => `${resourceType}\t${service ?? 'unknown'}`).join('\n');

const formatInitializationResult = (result: AwsDiscoveryInitialization): string =>
  result.status === 'EXISTING'
    ? `Resource Explorer setup already exists in ${result.aggregatorRegion}.`
    : `Resource Explorer setup created in ${result.aggregatorRegion}.`;

const resolveListFormat = (parentCommand: Command, options: DiscoverListOptions): DiscoverListFormat =>
  parentCommand.opts().format === 'json' ? 'json' : (options.format ?? 'table');

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
    .option('--format <format>', 'Output format: table|json|sarif', parseDiscoverFormat, 'table')
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
    .action(async (options: DiscoverOptions) => {
      await runCommand(async () => {
        const scanner = new CloudBurnClient();
        const result = await scanner.discover({ target: resolveDiscoveryTarget(options.region) });
        const output = scanFormatters[options.format ?? 'table'](result);

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
    .option('--format <format>', 'Output format: table|json', parseDiscoverListFormat, 'table')
    .action(async (options: DiscoverListOptions) => {
      await runCommand(async () => {
        const scanner = new CloudBurnClient();
        const regions = await scanner.listEnabledDiscoveryRegions();
        const format = resolveListFormat(discoverCommand, options);
        const output = format === 'json' ? formatValue(regions) : formatEnabledRegions(regions);

        process.stdout.write(`${output}\n`);
        return EXIT_CODE_OK;
      });
    });

  discoverCommand
    .command('init')
    .description('Set up AWS Resource Explorer for CloudBurn')
    .option('--region <region>', 'Aggregator region to create or reuse during setup', parseAwsRegion)
    .action(async (options: DiscoverInitOptions) => {
      await runCommand(async () => {
        const scanner = new CloudBurnClient();
        const parentRegion = discoverCommand.opts().region;
        const region = options.region ?? (parentRegion === 'all' ? undefined : parentRegion);
        const result = await scanner.initializeDiscovery({ region });

        process.stdout.write(`${formatInitializationResult(result)}\n`);
        return EXIT_CODE_OK;
      });
    });

  discoverCommand
    .command('supported-resource-types')
    .description('List Resource Explorer supported AWS resource types')
    .option('--format <format>', 'Output format: table|json', parseDiscoverListFormat, 'table')
    .action(async (options: DiscoverListOptions) => {
      await runCommand(async () => {
        const scanner = new CloudBurnClient();
        const resourceTypes = await scanner.listSupportedDiscoveryResourceTypes();
        const format = resolveListFormat(discoverCommand, options);
        const output = format === 'json' ? formatValue(resourceTypes) : formatSupportedResourceTypes(resourceTypes);

        process.stdout.write(`${output}\n`);
        return EXIT_CODE_OK;
      });
    });
};
