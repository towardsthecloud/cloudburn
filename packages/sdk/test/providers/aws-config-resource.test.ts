import { ListMetricsCommand } from '@aws-sdk/client-cloudwatch';
import {
  DescribeConfigRulesCommand,
  DescribeConfigurationRecorderStatusCommand,
  DescribeConfigurationRecordersCommand,
  GetDiscoveredResourceCountsCommand,
  ListConfigurationRecordersCommand,
  ListDiscoveredResourcesCommand,
} from '@aws-sdk/client-config-service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudWatchClient, createConfigServiceClient } from '../../src/providers/aws/client.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import { hydrateAwsConfigRecordingFrequencyReviews } from '../../src/providers/aws/resources/config.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCloudWatchClient: vi.fn(),
  createConfigServiceClient: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', () => ({
  fetchCloudWatchSignals: vi.fn(),
}));

const mockedCreateCloudWatchClient = vi.mocked(createCloudWatchClient);
const mockedCreateConfigServiceClient = vi.mocked(createConfigServiceClient);
const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);
const accountId = '123456789012';
const recorderArn = `arn:aws:config:eu-central-1:${accountId}:configuration-recorder/default/abc`;

const recorder = (overrides: Record<string, unknown> = {}) => ({
  arn: recorderArn,
  name: 'default',
  recordingGroup: {
    allSupported: true,
    exclusionByResourceTypes: { resourceTypes: [] },
    includeGlobalResourceTypes: false,
    recordingStrategy: { useOnly: 'ALL_SUPPORTED_RESOURCE_TYPES' },
    resourceTypes: [],
  },
  recordingMode: {
    recordingFrequency: 'CONTINUOUS',
    recordingModeOverrides: [],
  },
  recordingScope: 'PAID',
  ...overrides,
});

const configureConfigClient = (options: {
  configRules?: unknown[];
  recorders?: unknown[];
  resourceCounts?: Array<{ count: number; resourceType: string }>;
  resourceIdentifierPagesByType?: Record<
    string,
    Array<{
      nextToken?: string;
      resourceIdentifiers: Array<{ resourceDeletionTime?: Date; resourceId: string; resourceType: string }>;
    }>
  >;
  resourceIdentifiersByType?: Record<
    string,
    Array<{ resourceDeletionTime?: Date; resourceId: string; resourceType: string }>
  >;
  recording?: boolean;
  serviceLinkedRecorder?: unknown;
  serviceLinkedRecorderArn?: string;
}) => {
  const listPageByType = new Map<string, number>();
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof DescribeConfigurationRecordersCommand) {
      if (options.serviceLinkedRecorderArn && command.input.Arn === options.serviceLinkedRecorderArn) {
        return { ConfigurationRecorders: options.serviceLinkedRecorder ? [options.serviceLinkedRecorder] : [] };
      }
      return { ConfigurationRecorders: options.recorders ?? [recorder()] };
    }

    if (command instanceof DescribeConfigurationRecorderStatusCommand) {
      return { ConfigurationRecordersStatus: [{ name: 'default', recording: options.recording ?? true }] };
    }

    if (command instanceof ListConfigurationRecordersCommand) {
      return {
        ConfigurationRecorderSummaries: options.serviceLinkedRecorderArn
          ? [
              {
                arn: options.serviceLinkedRecorderArn,
                name: 'service-linked-recorder',
                recordingScope: 'PAID',
                servicePrincipal: 'example.amazonaws.com',
              },
            ]
          : [],
      };
    }

    if (command instanceof GetDiscoveredResourceCountsCommand) {
      return { resourceCounts: options.resourceCounts ?? [] };
    }

    if (command instanceof ListDiscoveredResourcesCommand) {
      const pages = options.resourceIdentifierPagesByType?.[command.input.resourceType];
      if (pages) {
        const pageIndex = listPageByType.get(command.input.resourceType) ?? 0;
        listPageByType.set(command.input.resourceType, pageIndex + 1);
        return pages[pageIndex] ?? { resourceIdentifiers: [] };
      }
      return { resourceIdentifiers: options.resourceIdentifiersByType?.[command.input.resourceType] ?? [] };
    }

    if (command instanceof DescribeConfigRulesCommand) {
      return { ConfigRules: options.configRules ?? [] };
    }

    throw new Error(`Unexpected command: ${String(command)}`);
  });
  mockedCreateConfigServiceClient.mockReturnValue({ send } as never);
  return send;
};

const configureMetrics = (resourceTypes: string[], valuesByType: Record<string, number>) => {
  mockedCreateCloudWatchClient.mockReturnValue({
    send: vi.fn(async (command: ListMetricsCommand) => {
      expect(command).toBeInstanceOf(ListMetricsCommand);
      return {
        Metrics: resourceTypes.map((resourceType) => ({
          Dimensions: [{ Name: 'ResourceType', Value: resourceType }],
          MetricName: 'ConfigurationItemsRecorded',
          Namespace: 'AWS/Config',
        })),
      };
    }),
  } as never);
  mockedFetchCloudWatchSignals.mockImplementation(
    async ({ queries }) =>
      new Map(
        queries.map((query) => [
          query.id,
          [{ timestamp: '2026-08-28T00:00:00.000Z', value: valuesByType[query.dimensions[0]?.Value ?? ''] ?? 0 }],
        ]),
      ),
  );
};

describe('hydrateAwsConfigRecordingFrequencyReviews', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T20:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses configuration-item volume to recommend a targeted daily override', async () => {
    configureConfigClient({
      resourceCounts: [{ count: 5, resourceType: 'AWS::Lambda::Function' }],
    });
    configureMetrics(['AWS::Lambda::Function'], { 'AWS::Lambda::Function': 2_000 });

    await expect(
      hydrateAwsConfigRecordingFrequencyReviews([], {
        region: 'eu-central-1',
        resolveAccountId: async () => accountId,
      }),
    ).resolves.toEqual([
      {
        accountId,
        allSupported: true,
        configurationItemsRecorded: 2_000,
        continuousRecordingUnitPriceUsd: 0.003,
        configuredResourceTypes: [],
        currentRecordingFrequency: 'CONTINUOUS',
        defaultRecordingFrequency: 'CONTINUOUS',
        dailyRecordingUnitPriceUsd: 0.012,
        estimatedMonthlyConfigurationItemReduction: 4_136,
        estimatedMonthlyRecordingCostReductionUsd: 11.06,
        excludedResourceTypes: [],
        firewallManagerDependent: false,
        includeGlobalResourceTypes: false,
        observationWindowDays: 14,
        paidServiceLinkedRecorderDependent: false,
        recentlyDeletedResourceCount: 0,
        recorderArn,
        recorderName: 'default',
        recordedResourceCount: 5,
        recordingModeOverrides: [],
        recordingScope: 'PAID',
        recordingStrategy: 'ALL_SUPPORTED_RESOURCE_TYPES',
        region: 'eu-central-1',
        resourceType: 'AWS::Lambda::Function',
        turnoverEstimateReliable: true,
      },
    ]);
    expect(mockedFetchCloudWatchSignals).toHaveBeenCalledWith({
      endTime: new Date('2026-09-03T20:00:00.000Z'),
      queries: [
        expect.objectContaining({
          dimensions: [{ Name: 'ResourceType', Value: 'AWS::Lambda::Function' }],
          metricName: 'ConfigurationItemsRecorded',
          namespace: 'AWS/Config',
        }),
      ],
      region: 'eu-central-1',
      startTime: new Date('2026-08-20T20:00:00.000Z'),
    });
  });

  it('skips a recorder whose default frequency is daily', async () => {
    configureConfigClient({
      recorders: [
        recorder({
          recordingMode: { recordingFrequency: 'DAILY', recordingModeOverrides: [] },
        }),
      ],
    });

    await expect(
      hydrateAwsConfigRecordingFrequencyReviews([], {
        region: 'eu-central-1',
        resolveAccountId: async () => accountId,
      }),
    ).resolves.toEqual([]);
    expect(mockedCreateCloudWatchClient).not.toHaveBeenCalled();
  });

  it('skips a stopped configuration recorder', async () => {
    configureConfigClient({ recording: false });

    await expect(
      hydrateAwsConfigRecordingFrequencyReviews([], {
        region: 'eu-central-1',
        resolveAccountId: async () => accountId,
      }),
    ).resolves.toEqual([]);
    expect(mockedCreateCloudWatchClient).not.toHaveBeenCalled();
  });

  it('excludes global IAM types when an all-supported recorder leaves them disabled', async () => {
    configureConfigClient({
      resourceCounts: [{ count: 5, resourceType: 'AWS::IAM::Role' }],
    });
    configureMetrics(['AWS::IAM::Role'], { 'AWS::IAM::Role': 2_000 });

    await expect(
      hydrateAwsConfigRecordingFrequencyReviews([], {
        region: 'eu-central-1',
        resolveAccountId: async () => accountId,
      }),
    ).resolves.toEqual([]);
    expect(mockedFetchCloudWatchSignals).not.toHaveBeenCalled();
  });

  it('honors daily recording-mode overrides while reviewing remaining continuous types', async () => {
    configureConfigClient({
      recorders: [
        recorder({
          recordingMode: {
            recordingFrequency: 'CONTINUOUS',
            recordingModeOverrides: [
              {
                description: 'Daily Lambda changes',
                recordingFrequency: 'DAILY',
                resourceTypes: ['AWS::Lambda::Function'],
              },
            ],
          },
        }),
      ],
      resourceCounts: [{ count: 2, resourceType: 'AWS::EC2::NetworkInterface' }],
    });
    configureMetrics(['AWS::Lambda::Function', 'AWS::EC2::NetworkInterface'], {
      'AWS::EC2::NetworkInterface': 2_000,
      'AWS::Lambda::Function': 2_000,
    });

    const reviews = await hydrateAwsConfigRecordingFrequencyReviews([], {
      region: 'eu-central-1',
      resolveAccountId: async () => accountId,
    });

    expect(reviews).toEqual([
      expect.objectContaining({
        currentRecordingFrequency: 'CONTINUOUS',
        estimatedMonthlyConfigurationItemReduction: 4_226,
        estimatedMonthlyRecordingCostReductionUsd: 12.14,
        resourceType: 'AWS::EC2::NetworkInterface',
      }),
    ]);
    expect(mockedFetchCloudWatchSignals).toHaveBeenCalledWith(
      expect.objectContaining({
        queries: [
          expect.objectContaining({ dimensions: [{ Name: 'ResourceType', Value: 'AWS::EC2::NetworkInterface' }] }),
        ],
      }),
    );
  });

  it('accounts for recently deleted resources when estimating daily recording cost', async () => {
    const resourceType = 'AWS::EC2::NetworkInterface';
    configureConfigClient({
      resourceCounts: [{ count: 1, resourceType }],
      resourceIdentifiersByType: {
        [resourceType]: Array.from({ length: 100 }, (_, index) => ({
          resourceDeletionTime: new Date('2026-09-01T00:00:00.000Z'),
          resourceId: `eni-deleted-${index}`,
          resourceType,
        })),
      },
    });
    configureMetrics([resourceType], { [resourceType]: 2_000 });

    await expect(
      hydrateAwsConfigRecordingFrequencyReviews([], {
        region: 'eu-central-1',
        resolveAccountId: async () => accountId,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        estimatedMonthlyConfigurationItemReduction: 1_256,
        estimatedMonthlyRecordingCostReductionUsd: -23.5,
        recentlyDeletedResourceCount: 100,
        recordedResourceCount: 1,
        resourceType,
      }),
    ]);
  });

  it('bounds retained-resource pagination when turnover cannot be established safely', async () => {
    const resourceType = 'AWS::Lambda::Function';
    const send = configureConfigClient({
      resourceCounts: [{ count: 5, resourceType }],
      resourceIdentifierPagesByType: {
        [resourceType]: Array.from({ length: 11 }, (_, index) => ({
          nextToken: index < 10 ? `page-${index + 1}` : undefined,
          resourceIdentifiers: [],
        })),
      },
    });
    configureMetrics([resourceType], { [resourceType]: 2_000 });

    await expect(
      hydrateAwsConfigRecordingFrequencyReviews([], {
        region: 'eu-central-1',
        resolveAccountId: async () => accountId,
      }),
    ).resolves.toEqual({
      diagnostics: [
        {
          code: 'ConfigResourceTurnoverLimitExceeded',
          details:
            'Turnover could not be established for AWS::Lambda::Function after inspecting 1,000 retained resource identities.',
          message:
            'Skipped AWS Config recording-frequency evaluation in eu-central-1 because retained-resource turnover exceeded the 1,000-identity inspection limit.',
          provider: 'aws',
          region: 'eu-central-1',
          service: 'config',
          source: 'discovery',
          status: 'skipped',
        },
      ],
      resources: [
        expect.objectContaining({
          resourceType,
          turnoverEstimateReliable: false,
        }),
      ],
      unavailable: true,
    });
    expect(send.mock.calls.filter(([command]) => command instanceof ListDiscoveredResourcesCommand)).toHaveLength(10);
  });

  it('keeps continuous recording when a Firewall Manager rule depends on the resource type', async () => {
    configureConfigClient({
      configRules: [
        {
          ConfigRuleName: 'FMManagedLambdaRule',
          CreatedBy: 'fms.amazonaws.com',
          Scope: { ComplianceResourceTypes: ['AWS::Lambda::Function'] },
        },
      ],
      resourceCounts: [{ count: 5, resourceType: 'AWS::Lambda::Function' }],
    });
    configureMetrics(['AWS::Lambda::Function'], { 'AWS::Lambda::Function': 2_000 });

    await expect(
      hydrateAwsConfigRecordingFrequencyReviews([], {
        region: 'eu-central-1',
        resolveAccountId: async () => accountId,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        firewallManagerDependent: true,
        resourceType: 'AWS::Lambda::Function',
      }),
    ]);
  });

  it('keeps lower-value churn as evidence for rule-level policy', async () => {
    configureConfigClient({
      resourceCounts: [{ count: 1, resourceType: 'AWS::ApiGateway::Stage' }],
    });
    configureMetrics(['AWS::ApiGateway::Stage'], { 'AWS::ApiGateway::Stage': 200 });

    await expect(
      hydrateAwsConfigRecordingFrequencyReviews([], {
        region: 'eu-central-1',
        resolveAccountId: async () => accountId,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        estimatedMonthlyRecordingCostReductionUsd: 0.93,
        resourceType: 'AWS::ApiGateway::Stage',
      }),
    ]);
  });

  it('keeps continuous recording when a paid service-linked recorder takes precedence', async () => {
    const serviceLinkedRecorderArn = `arn:aws:config:eu-central-1:${accountId}:configuration-recorder/service-linked/abc`;
    configureConfigClient({
      resourceCounts: [{ count: 5, resourceType: 'AWS::Lambda::Function' }],
      serviceLinkedRecorder: recorder({
        arn: serviceLinkedRecorderArn,
        name: 'service-linked-recorder',
        recordingGroup: {
          allSupported: false,
          resourceTypes: ['AWS::Lambda::Function'],
          recordingStrategy: { useOnly: 'INCLUSION_BY_RESOURCE_TYPES' },
        },
        servicePrincipal: 'example.amazonaws.com',
      }),
      serviceLinkedRecorderArn,
    });
    configureMetrics(['AWS::Lambda::Function'], { 'AWS::Lambda::Function': 2_000 });

    await expect(
      hydrateAwsConfigRecordingFrequencyReviews([], {
        region: 'eu-central-1',
        resolveAccountId: async () => accountId,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        paidServiceLinkedRecorderDependent: true,
        resourceType: 'AWS::Lambda::Function',
      }),
    ]);
  });

  it('preserves access-denied identity when recorder discovery is blocked', async () => {
    mockedCreateConfigServiceClient.mockReturnValue({
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('not authorized to call config:DescribeConfigurationRecorders'), {
          name: 'AccessDeniedException',
          $metadata: { httpStatusCode: 403, requestId: 'request-123' },
        }),
      ),
    } as never);

    const error = await hydrateAwsConfigRecordingFrequencyReviews([], {
      region: 'eu-central-1',
      resolveAccountId: async () => accountId,
    }).catch((err) => err);

    expect(error).toMatchObject({ name: 'AccessDeniedException' });
    expect((error as Error).message).toContain('AWS Config DescribeConfigurationRecorders failed in eu-central-1');
  });
});
