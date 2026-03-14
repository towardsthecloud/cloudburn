import { type AwsDiscoveryTarget, assertValidAwsRegion, CloudBurnClient } from '@cloudburn/sdk';
import { type Command, InvalidArgumentError } from 'commander';
import { EXIT_CODE_OK, EXIT_CODE_POLICY_VIOLATION, EXIT_CODE_RUNTIME_ERROR } from '../exit-codes.js';
import { formatError } from '../formatters/error.js';
import { type CliResponse, type OutputFormat, renderResponse, resolveOutputFormat } from '../formatters/output.js';
import { countScanResultFindings } from '../formatters/shared.js';
import { setCommandExamples } from '../help.js';
import { parseRuleIdList, parseServiceList, validateServiceList } from './config-options.js';

type DiscoverOptions = {
  config?: string;
  disabledRules?: string[];
  enabledRules?: string[];
  exitCode?: boolean;
  region?: string;
  service?: string[];
};

const parseDiscoveryServiceList = (value: string): string[] =>
  validateServiceList('discovery', parseServiceList(value)) ?? [];

type DiscoverListOptions = Record<string, never>;

type DiscoverInitOptions = {
  region?: string;
};

type DiscoverInitializationResult = Awaited<ReturnType<CloudBurnClient['initializeDiscovery']>>;

const describeDiscoverySummary = (status: {
  accessibleRegionCount: number;
  aggregatorRegion?: string;
  coverage: string;
  indexedRegionCount: number;
  totalRegionCount: number;
  warning?: string;
}): string => {
  const aggregatorSummary = status.aggregatorRegion ? ` Aggregator region: ${status.aggregatorRegion}.` : '';
  const warningSummary = status.warning ? ` ${status.warning}` : '';

  return `Coverage: ${status.coverage}. Indexed ${status.indexedRegionCount} of ${status.totalRegionCount} enabled regions.${aggregatorSummary}${warningSummary}`.trim();
};

const describeInitializationMessage = (result: {
  aggregatorAction: 'created' | 'none' | 'promoted' | 'unchanged';
  aggregatorRegion: string;
  coverage: string;
  createdIndexCount: number;
  indexType: 'aggregator' | 'local';
  observedStatus: {
    indexedRegionCount: number;
    totalRegionCount: number;
    warning?: string;
  };
  reusedIndexCount: number;
  status: 'CREATED' | 'EXISTING';
  warning?: string;
  verificationStatus: 'timed_out' | 'verified';
}): string => {
  const baseMessage =
    result.indexType === 'aggregator'
      ? result.aggregatorAction === 'promoted'
        ? `Promoted the existing local Resource Explorer index in ${result.aggregatorRegion} to the aggregator.`
        : result.aggregatorAction === 'created'
          ? `Configured ${result.aggregatorRegion} as the Resource Explorer aggregator.`
          : result.coverage === 'full'
            ? `Resource Explorer aggregator already exists in ${result.aggregatorRegion}.`
            : `Resource Explorer aggregator already exists in ${result.aggregatorRegion}, but only ${result.observedStatus.indexedRegionCount} of ${result.observedStatus.totalRegionCount} regions are indexed.`
      : result.status === 'EXISTING'
        ? `Local Resource Explorer setup already exists in ${result.aggregatorRegion}.`
        : `Local Resource Explorer setup created in ${result.aggregatorRegion}.`;
  const indexSummaryParts: string[] = [];

  if (result.createdIndexCount > 0) {
    indexSummaryParts.push(
      `Created ${result.createdIndexCount} ${result.createdIndexCount === 1 ? 'index' : 'indexes'}.`,
    );
  }

  if (result.reusedIndexCount > 0) {
    indexSummaryParts.push(
      `Reused ${result.reusedIndexCount} existing ${result.reusedIndexCount === 1 ? 'index' : 'indexes'}.`,
    );
  }

  const indexSummary = indexSummaryParts.length === 0 ? '' : ` ${indexSummaryParts.join(' ')}`;

  const warnings = Array.from(new Set([result.warning, result.observedStatus.warning].filter(Boolean)));
  const warning = warnings.length === 0 ? '' : ` ${warnings.join(' ')}`;
  const convergenceNotice =
    result.verificationStatus === 'timed_out'
      ? ' Setup is still converging in AWS, so the observed coverage may still change.'
      : '';

  return `${baseMessage}${indexSummary}${warning}${convergenceNotice}`.trim();
};

const buildInitializationStatusData = (
  result: DiscoverInitializationResult,
  message: string,
  format: OutputFormat,
): Extract<CliResponse, { kind: 'status' }>['data'] => {
  const restrictedRegionCount = Math.max(
    0,
    result.observedStatus.totalRegionCount - result.observedStatus.accessibleRegionCount,
  );

  if (format === 'json') {
    return {
      aggregatorAction: result.aggregatorAction,
      aggregatorRegion: result.aggregatorRegion,
      coverage: result.coverage,
      createdIndexCount: result.createdIndexCount,
      indexType: result.indexType,
      message,
      observedStatus: result.observedStatus,
      regions: result.regions,
      reusedIndexCount: result.reusedIndexCount,
      status: result.status,
      taskId: result.taskId ?? '',
      verificationStatus: result.verificationStatus,
      ...(result.warning ? { warning: result.warning } : {}),
    };
  }

  return {
    aggregatorAction: result.aggregatorAction,
    aggregatorRegion: result.aggregatorRegion,
    coverage: result.coverage,
    createdIndexes: String(result.createdIndexCount),
    details: 'Run `cloudburn discover status` for per-region details.',
    indexedRegions: result.regions.length === 0 ? 'none' : result.regions.join(', '),
    indexedSummary: `${result.observedStatus.indexedRegionCount} of ${result.observedStatus.totalRegionCount}`,
    indexType: result.indexType,
    message,
    reusedIndexes: String(result.reusedIndexCount),
    ...(restrictedRegionCount > 0 ? { restrictedRegions: String(restrictedRegionCount) } : {}),
    status: result.status,
    taskId: result.taskId ?? '',
    verificationStatus: result.verificationStatus,
  };
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

const toDiscoveryConfigOverride = (options: DiscoverOptions) => {
  if (options.enabledRules === undefined && options.disabledRules === undefined && options.service === undefined) {
    return undefined;
  }

  return {
    discovery: {
      disabledRules: options.disabledRules,
      enabledRules: options.enabledRules,
      services: options.service,
    },
  };
};

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
  const discoverCommand = setCommandExamples(
    program
      .command('discover')
      .description('Run a live AWS discovery')
      .enablePositionalOptions()
      .option(
        '--region <region>',
        'Discovery region to use. Defaults to the current AWS region from AWS_REGION; use this flag to override it. Pass "all" to check resources in all regions that are indexed in AWS Resource Explorer.',
        parseDiscoverRegion,
      )
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
      .option(
        '--service <services>',
        'Comma-separated services to include in the discovery rule set.',
        parseDiscoveryServiceList,
      )
      .option('--exit-code', 'Exit with code 1 when findings exist')
      .action(async (options: DiscoverOptions, command: Command) => {
        await runCommand(async () => {
          const scanner = new CloudBurnClient();
          const configOverride = toDiscoveryConfigOverride(options);
          const loadedConfig = await scanner.loadConfig(options.config);
          const discoveryOptions: {
            target: AwsDiscoveryTarget;
            config?: ReturnType<typeof toDiscoveryConfigOverride>;
            configPath?: string;
          } = {
            target: resolveDiscoveryTarget(options.region),
          };

          if (configOverride !== undefined) {
            discoveryOptions.config = configOverride;
          }

          if (options.config !== undefined) {
            discoveryOptions.configPath = options.config;
          }

          const result = await scanner.discover(discoveryOptions);
          const format = resolveOutputFormat(command, undefined, loadedConfig.discovery.format ?? 'table');
          const output = renderResponse({ kind: 'scan-result', result }, format);

          process.stdout.write(`${output}\n`);

          if (options.exitCode && countScanResultFindings(result) > 0) {
            return EXIT_CODE_POLICY_VIOLATION;
          }

          return EXIT_CODE_OK;
        });
      }),
    [
      'cloudburn discover',
      'cloudburn discover --region eu-central-1',
      'cloudburn discover --region all',
      'cloudburn discover status',
      'cloudburn discover list-enabled-regions',
      'cloudburn discover init',
    ],
  );

  discoverCommand
    .command('status')
    .description('Show Resource Explorer status across all enabled AWS regions')
    .action(async (_options: DiscoverListOptions, command: Command) => {
      await runCommand(async () => {
        const scanner = new CloudBurnClient();
        const parentRegion = discoverCommand.opts().region;
        const region = parentRegion === 'all' ? undefined : parentRegion;
        const status = await scanner.getDiscoveryStatus({ region });
        const format = resolveOutputFormat(command);
        const rows =
          format === 'json'
            ? status.regions.map((regionStatus) => ({
                ...regionStatus,
                notes: regionStatus.notes ?? '',
              }))
            : status.regions.map((regionStatus) => ({
                region: regionStatus.region,
                indexType:
                  regionStatus.indexType === undefined
                    ? ''
                    : regionStatus.isAggregator
                      ? `${regionStatus.indexType} (active)`
                      : regionStatus.indexType,
                notes: regionStatus.notes ?? '',
                status: regionStatus.status,
                viewStatus: regionStatus.viewStatus ?? '',
              }));
        const summary =
          format === 'json'
            ? {
                accessibleRegionCount: status.accessibleRegionCount,
                coverage: status.coverage,
                indexedRegionCount: status.indexedRegionCount,
                totalRegionCount: status.totalRegionCount,
                ...(status.aggregatorRegion ? { aggregatorRegion: status.aggregatorRegion } : {}),
                ...(status.warning ? { warning: status.warning } : {}),
              }
            : {
                accessibleRegionCount: status.accessibleRegionCount,
                aggregatorRegion: status.aggregatorRegion ?? '',
                coverage: status.coverage,
                indexedRegionCount: status.indexedRegionCount,
                totalRegionCount: status.totalRegionCount,
                ...(status.warning ? { warning: status.warning } : {}),
              };
        const output = renderResponse(
          {
            kind: 'discovery-status',
            columns: [
              { key: 'region', header: 'Region' },
              { key: 'indexType', header: 'IndexType' },
              { key: 'status', header: 'Status' },
              { key: 'viewStatus', header: 'ViewStatus' },
              { key: 'notes', header: 'Notes' },
            ],
            rows,
            summary,
            summaryText: describeDiscoverySummary(status),
          },
          format,
        );

        process.stdout.write(`${output}\n`);
        return EXIT_CODE_OK;
      });
    });

  discoverCommand
    .command('list-enabled-regions')
    .description('List AWS regions with a local or aggregator Resource Explorer index')
    .action(async (_options: DiscoverListOptions, command: Command) => {
      await runCommand(async () => {
        const scanner = new CloudBurnClient();
        const regions = await scanner.listEnabledDiscoveryRegions();
        const format = resolveOutputFormat(command);
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
    .option(
      '--region <region>',
      'Requested aggregator region to create or reuse during setup. This is the main Resource Explorer region that aggregates indexes from other regions when cross-region setup succeeds. Defaults to the current AWS region from AWS_REGION; use this flag to override it.',
      parseAwsRegion,
    )
    .action(async (options: DiscoverInitOptions, command: Command) => {
      await runCommand(async () => {
        const scanner = new CloudBurnClient();
        const parentRegion = discoverCommand.opts().region;
        const region = options.region ?? (parentRegion === 'all' ? undefined : parentRegion);
        const result = await scanner.initializeDiscovery({ region });
        const message = describeInitializationMessage(result);
        const format = resolveOutputFormat(command);
        const output = renderResponse(
          {
            kind: 'status',
            data: buildInitializationStatusData(result, message, format),
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
    .action(async (_options: DiscoverListOptions, command: Command) => {
      await runCommand(async () => {
        const scanner = new CloudBurnClient();
        const resourceTypes = await scanner.listSupportedDiscoveryResourceTypes();
        const format = resolveOutputFormat(command);
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
