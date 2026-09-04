import { ListMetricsCommand } from '@aws-sdk/client-cloudwatch';
import {
  type ConfigServiceClient,
  type ConfigurationRecorder,
  DescribeConfigRulesCommand,
  DescribeConfigurationRecorderStatusCommand,
  DescribeConfigurationRecordersCommand,
  GetDiscoveredResourceCountsCommand,
  ListConfigurationRecordersCommand,
  ListDiscoveredResourcesCommand,
  type RecordingFrequency,
  type ResourceType,
} from '@aws-sdk/client-config-service';
import type {
  AwsConfigRecordingFrequencyReview,
  AwsConfigRecordingModeOverride,
  AwsDiscoveredResource,
} from '@cloudburn/rules';
import { createCloudWatchClient, createConfigServiceClient, resolveCurrentAwsRegion } from '../client.js';
import type { AwsAccountIdResolver } from '../discovery-registry.js';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { chunkItems, mapWithConcurrency, resolveAwsAccountIdForLoad, withAwsServiceErrorContext } from './utils.js';

const CONFIG_METRIC_NAMESPACE = 'AWS/Config';
const CONFIGURATION_ITEMS_RECORDED_METRIC = 'ConfigurationItemsRecorded';
const OBSERVATION_WINDOW_DAYS = 14;
const DAY_SECONDS = 24 * 60 * 60;
const RESOURCE_COUNT_BATCH_SIZE = 20;
const RESOURCE_COUNT_BATCH_CONCURRENCY = 5;
const MAX_RETAINED_RESOURCE_PAGES = 10;
const CONTINUOUS_RECORDING_UNIT_PRICE_USD = 0.003;
const DAILY_RECORDING_UNIT_PRICE_USD = 0.012;
const UNSUPPORTED_DAILY_RESOURCE_TYPES = new Set([
  'AWS::Config::ConfigurationRecorder',
  'AWS::Config::ConformancePackCompliance',
  'AWS::Config::ResourceCompliance',
]);
const GLOBAL_IAM_RESOURCE_TYPES = new Set(['AWS::IAM::Group', 'AWS::IAM::Policy', 'AWS::IAM::Role', 'AWS::IAM::User']);

type ConfigDiscoveryContext = AwsAccountIdResolver & {
  region?: string;
};

const normalizeRecordingFrequency = (frequency: RecordingFrequency | undefined): 'CONTINUOUS' | 'DAILY' =>
  frequency === 'DAILY' ? 'DAILY' : 'CONTINUOUS';

const normalizeRecordingModeOverrides = (
  overrides: Array<{
    description?: string;
    recordingFrequency?: RecordingFrequency;
    resourceTypes?: string[];
  }>,
): AwsConfigRecordingModeOverride[] =>
  overrides.flatMap((override) =>
    override.recordingFrequency && override.resourceTypes?.length
      ? [
          {
            ...(override.description ? { description: override.description } : {}),
            recordingFrequency: normalizeRecordingFrequency(override.recordingFrequency),
            resourceTypes: [...override.resourceTypes].sort((left, right) => left.localeCompare(right)),
          },
        ]
      : [],
  );

const getEffectiveRecordingFrequency = (
  resourceType: string,
  defaultFrequency: 'CONTINUOUS' | 'DAILY',
  overrides: AwsConfigRecordingModeOverride[],
): 'CONTINUOUS' | 'DAILY' =>
  overrides.findLast((override) => override.resourceTypes.includes(resourceType))?.recordingFrequency ??
  defaultFrequency;

const isResourceTypeInRecorderScope = (
  resourceType: string,
  options: {
    allSupported: boolean;
    configuredResourceTypes: string[];
    excludedResourceTypes: string[];
    includeGlobalResourceTypes: boolean;
    recordingStrategy: string;
  },
): boolean => {
  if (options.recordingStrategy === 'EXCLUSION_BY_RESOURCE_TYPES') {
    return !options.excludedResourceTypes.includes(resourceType);
  }

  if (options.recordingStrategy === 'INCLUSION_BY_RESOURCE_TYPES') {
    return options.configuredResourceTypes.includes(resourceType);
  }

  if (options.allSupported && !options.includeGlobalResourceTypes && GLOBAL_IAM_RESOURCE_TYPES.has(resourceType)) {
    return false;
  }

  return options.allSupported || options.configuredResourceTypes.includes(resourceType);
};

const listConfigMetricResourceTypes = async (region: string): Promise<string[]> => {
  const client = createCloudWatchClient({ region });
  const resourceTypes = new Set<string>();
  let nextToken: string | undefined;

  do {
    const response = await withAwsServiceErrorContext('Amazon CloudWatch', 'ListMetrics', region, () =>
      client.send(
        new ListMetricsCommand({
          MetricName: CONFIGURATION_ITEMS_RECORDED_METRIC,
          Namespace: CONFIG_METRIC_NAMESPACE,
          NextToken: nextToken,
        }),
      ),
    );

    for (const metric of response.Metrics ?? []) {
      const resourceType = metric.Dimensions?.find((dimension) => dimension.Name === 'ResourceType')?.Value;

      if (resourceType && resourceType !== 'All') {
        resourceTypes.add(resourceType);
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return [...resourceTypes].sort((left, right) => left.localeCompare(right));
};

const getRecordedResourceCounts = async (
  client: ConfigServiceClient,
  region: string,
  resourceTypes: string[],
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();

  await mapWithConcurrency(
    chunkItems(resourceTypes, RESOURCE_COUNT_BATCH_SIZE),
    RESOURCE_COUNT_BATCH_CONCURRENCY,
    async (batch) => {
      let nextToken: string | undefined;

      do {
        const response = await withAwsServiceErrorContext('AWS Config', 'GetDiscoveredResourceCounts', region, () =>
          client.send(
            new GetDiscoveredResourceCountsCommand({
              limit: 100,
              nextToken,
              resourceTypes: batch,
            }),
          ),
        );

        for (const resourceCount of response.resourceCounts ?? []) {
          if (resourceCount.resourceType && resourceCount.count !== undefined) {
            counts.set(resourceCount.resourceType, resourceCount.count);
          }
        }

        nextToken = response.nextToken;
      } while (nextToken);
    },
  );

  return counts;
};

const getRecentlyDeletedResourceCounts = async (
  client: ConfigServiceClient,
  region: string,
  candidates: Array<{ resourceType: string; stopAfterCount: number }>,
  startTime: Date,
): Promise<Map<string, { count: number; reliable: boolean }>> => {
  const counts = new Map<string, { count: number; reliable: boolean }>();

  await mapWithConcurrency(candidates, RESOURCE_COUNT_BATCH_CONCURRENCY, async ({ resourceType, stopAfterCount }) => {
    let count = 0;
    let nextToken: string | undefined;
    let pageCount = 0;

    do {
      const response = await withAwsServiceErrorContext('AWS Config', 'ListDiscoveredResources', region, () =>
        client.send(
          new ListDiscoveredResourcesCommand({
            includeDeletedResources: true,
            limit: 100,
            nextToken,
            resourceType: resourceType as ResourceType,
          }),
        ),
      );

      count += (response.resourceIdentifiers ?? []).filter(
        (resource) => resource.resourceDeletionTime && resource.resourceDeletionTime >= startTime,
      ).length;
      nextToken = response.nextToken;
      pageCount += 1;
    } while (nextToken && pageCount < MAX_RETAINED_RESOURCE_PAGES && count < stopAfterCount);

    counts.set(resourceType, {
      count,
      reliable: !nextToken || count >= stopAfterCount,
    });
  });

  return counts;
};

const getFirewallManagerDependencies = async (
  client: ConfigServiceClient,
  region: string,
): Promise<{ allResourceTypes: boolean; resourceTypes: Set<string> }> => {
  const resourceTypes = new Set<string>();
  let allResourceTypes = false;
  let nextToken: string | undefined;

  do {
    const response = await withAwsServiceErrorContext('AWS Config', 'DescribeConfigRules', region, () =>
      client.send(new DescribeConfigRulesCommand({ NextToken: nextToken })),
    );

    for (const rule of response.ConfigRules ?? []) {
      if (rule.CreatedBy?.toLowerCase() !== 'fms.amazonaws.com') {
        continue;
      }

      const scopedResourceTypes = rule.Scope?.ComplianceResourceTypes ?? [];
      if (scopedResourceTypes.length === 0) {
        allResourceTypes = true;
      }
      for (const resourceType of scopedResourceTypes) {
        resourceTypes.add(resourceType);
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return { allResourceTypes, resourceTypes };
};

const isRecorderContinuouslyRecordingType = (recorder: ConfigurationRecorder, resourceType: string): boolean => {
  const defaultFrequency = normalizeRecordingFrequency(recorder.recordingMode?.recordingFrequency);
  const overrides = normalizeRecordingModeOverrides(recorder.recordingMode?.recordingModeOverrides ?? []);

  return (
    isResourceTypeInRecorderScope(resourceType, {
      allSupported: recorder.recordingGroup?.allSupported ?? false,
      configuredResourceTypes: recorder.recordingGroup?.resourceTypes ?? [],
      excludedResourceTypes: recorder.recordingGroup?.exclusionByResourceTypes?.resourceTypes ?? [],
      includeGlobalResourceTypes: recorder.recordingGroup?.includeGlobalResourceTypes ?? false,
      recordingStrategy: recorder.recordingGroup?.recordingStrategy?.useOnly ?? 'UNSPECIFIED',
    }) && getEffectiveRecordingFrequency(resourceType, defaultFrequency, overrides) === 'CONTINUOUS'
  );
};

const getPaidServiceLinkedRecorderDependencies = async (
  client: ConfigServiceClient,
  region: string,
  resourceTypes: string[],
): Promise<Set<string>> => {
  const recorderArns: string[] = [];
  let nextToken: string | undefined;

  do {
    const response = await withAwsServiceErrorContext('AWS Config', 'ListConfigurationRecorders', region, () =>
      client.send(
        new ListConfigurationRecordersCommand({
          Filters: [{ filterName: 'recordingScope', filterValue: ['PAID'] }],
          NextToken: nextToken,
        }),
      ),
    );

    for (const summary of response.ConfigurationRecorderSummaries ?? []) {
      if (summary.servicePrincipal && summary.arn) {
        recorderArns.push(summary.arn);
      }
    }

    nextToken = response.NextToken;
  } while (nextToken);

  const recorders = await Promise.all(
    recorderArns.map(async (recorderArn) => {
      const response = await withAwsServiceErrorContext('AWS Config', 'DescribeConfigurationRecorders', region, () =>
        client.send(new DescribeConfigurationRecordersCommand({ Arn: recorderArn })),
      );
      return response.ConfigurationRecorders?.[0];
    }),
  );
  const dependentResourceTypes = new Set<string>();

  for (const resourceType of resourceTypes) {
    if (recorders.some((recorder) => recorder && isRecorderContinuouslyRecordingType(recorder, resourceType))) {
      dependentResourceTypes.add(resourceType);
    }
  }

  return dependentResourceTypes;
};

/**
 * Reviews customer-managed AWS Config recorders using per-resource-type configuration-item volume.
 *
 * @param _resources - Unused because configuration recorders are regional control-plane resources.
 * @param context - Discovery-run account and target-region resolvers.
 * @returns Continuous recording evidence and dependency blockers for rule-level policy evaluation.
 */
export const hydrateAwsConfigRecordingFrequencyReviews = async (
  _resources: AwsDiscoveredResource[],
  context?: ConfigDiscoveryContext,
): Promise<AwsConfigRecordingFrequencyReview[]> => {
  const region = context?.region ?? (await resolveCurrentAwsRegion());
  const configClient = createConfigServiceClient({ region });
  const recorderResponse = await withAwsServiceErrorContext(
    'AWS Config',
    'DescribeConfigurationRecorders',
    region,
    () => configClient.send(new DescribeConfigurationRecordersCommand({})),
  );
  const recorder = (recorderResponse.ConfigurationRecorders ?? []).find(
    (candidate) => !candidate.servicePrincipal && candidate.recordingScope !== 'INTERNAL',
  );

  if (!recorder?.arn || !recorder.name) {
    return [];
  }

  const recorderArn = recorder.arn;
  const recorderName = recorder.name;
  const recorderStatusResponse = await withAwsServiceErrorContext(
    'AWS Config',
    'DescribeConfigurationRecorderStatus',
    region,
    () =>
      configClient.send(new DescribeConfigurationRecorderStatusCommand({ ConfigurationRecorderNames: [recorderName] })),
  );
  const recorderStatus = recorderStatusResponse.ConfigurationRecordersStatus?.find(
    (status) => status.name === recorderName,
  );

  if (!recorderStatus?.recording) {
    return [];
  }

  const defaultRecordingFrequency = normalizeRecordingFrequency(recorder.recordingMode?.recordingFrequency);
  const recordingModeOverrides = normalizeRecordingModeOverrides(recorder.recordingMode?.recordingModeOverrides ?? []);
  const hasContinuousFrequency =
    defaultRecordingFrequency === 'CONTINUOUS' ||
    recordingModeOverrides.some((override) => override.recordingFrequency === 'CONTINUOUS');

  if (!hasContinuousFrequency) {
    return [];
  }

  const allSupported = recorder.recordingGroup?.allSupported ?? false;
  const configuredResourceTypes = [...(recorder.recordingGroup?.resourceTypes ?? [])].sort((left, right) =>
    left.localeCompare(right),
  );
  const excludedResourceTypes = [...(recorder.recordingGroup?.exclusionByResourceTypes?.resourceTypes ?? [])].sort(
    (left, right) => left.localeCompare(right),
  );
  const includeGlobalResourceTypes = recorder.recordingGroup?.includeGlobalResourceTypes ?? false;
  const recordingStrategy = recorder.recordingGroup?.recordingStrategy?.useOnly ?? 'UNSPECIFIED';
  const metricResourceTypes = await listConfigMetricResourceTypes(region);
  const continuousResourceTypes = metricResourceTypes.filter(
    (resourceType) =>
      !UNSUPPORTED_DAILY_RESOURCE_TYPES.has(resourceType) &&
      isResourceTypeInRecorderScope(resourceType, {
        allSupported,
        configuredResourceTypes,
        excludedResourceTypes,
        includeGlobalResourceTypes,
        recordingStrategy,
      }) &&
      getEffectiveRecordingFrequency(resourceType, defaultRecordingFrequency, recordingModeOverrides) === 'CONTINUOUS',
  );

  if (continuousResourceTypes.length === 0) {
    return [];
  }

  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - OBSERVATION_WINDOW_DAYS * DAY_SECONDS * 1000);
  const queries = continuousResourceTypes.map((resourceType, index) => ({
    dimensions: [{ Name: 'ResourceType', Value: resourceType }],
    id: `config${index}`,
    metricName: CONFIGURATION_ITEMS_RECORDED_METRIC,
    namespace: CONFIG_METRIC_NAMESPACE,
    period: DAY_SECONDS,
    stat: 'Sum' as const,
  }));
  const [metricData, resourceCounts] = await Promise.all([
    fetchCloudWatchSignals({ endTime, queries, region, startTime }),
    getRecordedResourceCounts(configClient, region, continuousResourceTypes),
  ]);
  const potentialRecordingFrequencyReviews = continuousResourceTypes.flatMap((resourceType, index) => {
    const recordedResourceCount = resourceCounts.get(resourceType) ?? 0;
    const points = metricData.get(`config${index}`);

    if (!points) {
      return [];
    }

    const configurationItemsRecorded = points.reduce((total, point) => total + point.value, 0);
    const estimatedMonthlyContinuousConfigurationItems = Math.round(
      (configurationItemsRecorded / OBSERVATION_WINDOW_DAYS) * 30,
    );
    const estimatedMonthlyDailyConfigurationItems = recordedResourceCount * 30;
    const estimatedMonthlyRecordingCostReductionUsd = Number(
      (
        estimatedMonthlyContinuousConfigurationItems * CONTINUOUS_RECORDING_UNIT_PRICE_USD -
        estimatedMonthlyDailyConfigurationItems * DAILY_RECORDING_UNIT_PRICE_USD
      ).toFixed(2),
    );

    if (estimatedMonthlyRecordingCostReductionUsd <= 0) {
      return [];
    }

    return [
      {
        configurationItemsRecorded,
        estimatedMonthlyContinuousConfigurationItems,
        recordedResourceCount,
        resourceType,
        stopAfterCount:
          Math.ceil(
            (estimatedMonthlyContinuousConfigurationItems * CONTINUOUS_RECORDING_UNIT_PRICE_USD) /
              (30 * DAILY_RECORDING_UNIT_PRICE_USD),
          ) - recordedResourceCount,
      },
    ];
  });

  if (potentialRecordingFrequencyReviews.length === 0) {
    return [];
  }

  const recentlyDeletedResourceCounts = await getRecentlyDeletedResourceCounts(
    configClient,
    region,
    potentialRecordingFrequencyReviews.map((review) => ({
      resourceType: review.resourceType,
      stopAfterCount: review.stopAfterCount,
    })),
    startTime,
  );
  const recordingFrequencyReviews = potentialRecordingFrequencyReviews.map((review) => {
    const turnover = recentlyDeletedResourceCounts.get(review.resourceType) ?? { count: 0, reliable: false };
    const recentlyDeletedResourceCount = turnover.count;
    const estimatedMonthlyDailyConfigurationItems = Math.min(
      review.estimatedMonthlyContinuousConfigurationItems,
      (review.recordedResourceCount + recentlyDeletedResourceCount) * 30,
    );
    const estimatedMonthlyConfigurationItemReduction =
      review.estimatedMonthlyContinuousConfigurationItems - estimatedMonthlyDailyConfigurationItems;
    const estimatedMonthlyRecordingCostReductionUsd = Number(
      (
        review.estimatedMonthlyContinuousConfigurationItems * CONTINUOUS_RECORDING_UNIT_PRICE_USD -
        estimatedMonthlyDailyConfigurationItems * DAILY_RECORDING_UNIT_PRICE_USD
      ).toFixed(2),
    );

    return {
      configurationItemsRecorded: review.configurationItemsRecorded,
      estimatedMonthlyConfigurationItemReduction,
      estimatedMonthlyRecordingCostReductionUsd,
      recentlyDeletedResourceCount,
      recordedResourceCount: review.recordedResourceCount,
      resourceType: review.resourceType,
      turnoverEstimateReliable: turnover.reliable,
    };
  });

  const [accountId, firewallManagerDependencies, paidServiceLinkedRecorderDependencies] = await Promise.all([
    resolveAwsAccountIdForLoad(context),
    getFirewallManagerDependencies(configClient, region),
    getPaidServiceLinkedRecorderDependencies(
      configClient,
      region,
      recordingFrequencyReviews.map((type) => type.resourceType),
    ),
  ]);

  return recordingFrequencyReviews.map((review) => {
    const firewallManagerDependent =
      firewallManagerDependencies.allResourceTypes ||
      firewallManagerDependencies.resourceTypes.has(review.resourceType);
    const paidServiceLinkedRecorderDependent = paidServiceLinkedRecorderDependencies.has(review.resourceType);

    return {
      accountId,
      allSupported,
      configurationItemsRecorded: review.configurationItemsRecorded,
      configuredResourceTypes,
      continuousRecordingUnitPriceUsd: CONTINUOUS_RECORDING_UNIT_PRICE_USD,
      currentRecordingFrequency: 'CONTINUOUS',
      dailyRecordingUnitPriceUsd: DAILY_RECORDING_UNIT_PRICE_USD,
      defaultRecordingFrequency,
      estimatedMonthlyConfigurationItemReduction: review.estimatedMonthlyConfigurationItemReduction,
      estimatedMonthlyRecordingCostReductionUsd: review.estimatedMonthlyRecordingCostReductionUsd,
      excludedResourceTypes,
      firewallManagerDependent,
      includeGlobalResourceTypes,
      observationWindowDays: OBSERVATION_WINDOW_DAYS,
      paidServiceLinkedRecorderDependent,
      recentlyDeletedResourceCount: review.recentlyDeletedResourceCount,
      recorderArn,
      recorderName,
      recordedResourceCount: review.recordedResourceCount,
      recordingModeOverrides,
      recordingScope: recorder.recordingScope,
      recordingStrategy,
      region,
      resourceType: review.resourceType,
      turnoverEstimateReliable: review.turnoverEstimateReliable,
    } satisfies AwsConfigRecordingFrequencyReview;
  });
};
