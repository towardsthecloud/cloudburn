import type {
  DescribeClustersCommand,
  DescribeReservedNodesCommand,
  DescribeScheduledActionsCommand,
} from '@aws-sdk/client-redshift';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedshiftClient } from '../../src/providers/aws/client.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import {
  hydrateAwsRedshiftClusterMetrics,
  hydrateAwsRedshiftClusters,
  hydrateAwsRedshiftReservedNodes,
} from '../../src/providers/aws/resources/redshift.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createRedshiftClient: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', () => ({
  fetchCloudWatchSignals: vi.fn(),
}));

const mockedCreateRedshiftClient = vi.mocked(createRedshiftClient);
const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);

describe('Redshift discovery resources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered Redshift clusters and merges pause/resume schedule state', async () => {
    mockedCreateRedshiftClient.mockReturnValue({
      send: vi.fn(async (command: DescribeClustersCommand | DescribeScheduledActionsCommand) => {
        if (command.constructor.name === 'DescribeClustersCommand') {
          return {
            Clusters: [
              {
                AutomatedSnapshotRetentionPeriod: 1,
                ClusterCreateTime: new Date('2025-01-01T00:00:00.000Z'),
                ClusterIdentifier: 'warehouse-prod',
                ClusterStatus: 'available',
                HsmStatus: undefined,
                MultiAZ: 'disabled',
                NodeType: 'ra3.xlplus',
                NumberOfNodes: 2,
                VpcId: 'vpc-123',
              },
            ],
          };
        }

        return {
          ScheduledActions: [
            {
              State: 'ACTIVE',
              TargetAction: {
                PauseCluster: { ClusterIdentifier: 'warehouse-prod' },
                ResumeCluster: { ClusterIdentifier: 'warehouse-prod' },
              },
            },
          ],
        };
      }),
    } as never);

    await expect(
      hydrateAwsRedshiftClusters([
        {
          accountId: '123456789012',
          arn: 'arn:aws:redshift:us-east-1:123456789012:cluster:warehouse-prod',
          properties: [],
          region: 'us-east-1',
          resourceType: 'redshift:cluster',
          service: 'redshift',
        },
      ]),
    ).resolves.toEqual({
      diagnostics: [],
      resources: [
        {
          accountId: '123456789012',
          automatedSnapshotRetentionPeriod: 1,
          clusterCreateTime: '2025-01-01T00:00:00.000Z',
          clusterIdentifier: 'warehouse-prod',
          clusterStatus: 'available',
          hasPauseSchedule: true,
          hasResumeSchedule: true,
          hsmEnabled: false,
          multiAz: 'disabled',
          nodeType: 'ra3.xlplus',
          numberOfNodes: 2,
          pauseResumeStateAvailable: true,
          region: 'us-east-1',
          vpcId: 'vpc-123',
        },
      ],
    });
  });

  it('treats empty Redshift HSM status payloads as disabled', async () => {
    mockedCreateRedshiftClient.mockReturnValue({
      send: vi.fn(async (command: DescribeClustersCommand | DescribeScheduledActionsCommand) => {
        if (command.constructor.name === 'DescribeClustersCommand') {
          return {
            Clusters: [
              {
                ClusterIdentifier: 'warehouse-dev',
                ClusterStatus: 'available',
                HsmStatus: {},
                NodeType: 'ra3.xlplus',
                NumberOfNodes: 1,
              },
            ],
          };
        }

        return {
          ScheduledActions: [],
        };
      }),
    } as never);

    await expect(
      hydrateAwsRedshiftClusters([
        {
          accountId: '123456789012',
          arn: 'arn:aws:redshift:us-east-1:123456789012:cluster:warehouse-dev',
          properties: [],
          region: 'us-east-1',
          resourceType: 'redshift:cluster',
          service: 'redshift',
        },
      ]),
    ).resolves.toEqual({
      diagnostics: [],
      resources: [
        expect.objectContaining({
          clusterIdentifier: 'warehouse-dev',
          hsmEnabled: false,
          pauseResumeStateAvailable: true,
        }),
      ],
    });
  });

  it('keeps Redshift cluster hydration available and emits a diagnostic when scheduled actions are access denied', async () => {
    const accessDeniedError = Object.assign(new Error('Access denied'), {
      name: 'AccessDeniedException',
    });

    mockedCreateRedshiftClient.mockReturnValue({
      send: vi.fn(async (command: DescribeClustersCommand | DescribeScheduledActionsCommand) => {
        if (command.constructor.name === 'DescribeClustersCommand') {
          return {
            Clusters: [
              {
                AutomatedSnapshotRetentionPeriod: 1,
                ClusterIdentifier: 'warehouse-prod',
                ClusterStatus: 'available',
                NodeType: 'ra3.xlplus',
                NumberOfNodes: 2,
                VpcId: 'vpc-123',
              },
            ],
          };
        }

        throw accessDeniedError;
      }),
    } as never);

    await expect(
      hydrateAwsRedshiftClusters([
        {
          accountId: '123456789012',
          arn: 'arn:aws:redshift:us-east-1:123456789012:cluster:warehouse-prod',
          properties: [],
          region: 'us-east-1',
          resourceType: 'redshift:cluster',
          service: 'redshift',
        },
      ]),
    ).resolves.toEqual({
      diagnostics: [
        {
          code: 'AccessDeniedException',
          details:
            'Amazon Redshift DescribeScheduledActions failed in us-east-1 with AccessDeniedException: Access denied',
          message:
            'Skipped redshift schedule discovery in us-east-1 because access is denied by AWS permissions. Pause/resume findings may be incomplete.',
          provider: 'aws',
          region: 'us-east-1',
          service: 'redshift',
          source: 'discovery',
          status: 'access_denied',
        },
      ],
      resources: [
        expect.objectContaining({
          clusterIdentifier: 'warehouse-prod',
          hasPauseSchedule: false,
          hasResumeSchedule: false,
          pauseResumeStateAvailable: false,
        }),
      ],
    });
  });

  it('hydrates Redshift cluster CPU summaries from CloudWatch', async () => {
    mockedCreateRedshiftClient.mockReturnValue({
      send: vi.fn(async (command: DescribeClustersCommand | DescribeScheduledActionsCommand) => {
        if (command.constructor.name === 'DescribeClustersCommand') {
          return {
            Clusters: [
              {
                AutomatedSnapshotRetentionPeriod: 1,
                ClusterCreateTime: new Date('2025-01-01T00:00:00.000Z'),
                ClusterIdentifier: 'warehouse-prod',
                ClusterStatus: 'available',
                MultiAZ: 'disabled',
                NodeType: 'ra3.xlplus',
                NumberOfNodes: 2,
                VpcId: 'vpc-123',
              },
            ],
          };
        }

        return {
          ScheduledActions: [],
        };
      }),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'cpu0',
          Array.from({ length: 14 }, (_, index) => ({
            timestamp: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            value: 4,
          })),
        ],
      ]),
    );

    await expect(
      hydrateAwsRedshiftClusterMetrics([
        {
          accountId: '123456789012',
          arn: 'arn:aws:redshift:us-east-1:123456789012:cluster:warehouse-prod',
          properties: [],
          region: 'us-east-1',
          resourceType: 'redshift:cluster',
          service: 'redshift',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast14Days: 4,
        clusterIdentifier: 'warehouse-prod',
        region: 'us-east-1',
      },
    ]);
  });

  it('hydrates discovered Redshift reserved nodes from DescribeReservedNodes', async () => {
    mockedCreateRedshiftClient.mockReturnValue({
      send: vi.fn(async (_command: DescribeReservedNodesCommand) => ({
        ReservedNodes: [
          {
            NodeCount: 2,
            NodeType: 'ra3.xlplus',
            ReservedNodeId: 'reserved-node-1',
            StartTime: new Date('2025-01-01T00:00:00.000Z'),
            State: 'active',
          },
        ],
      })),
    } as never);

    await expect(
      hydrateAwsRedshiftReservedNodes([
        {
          accountId: '123456789012',
          arn: 'arn:aws:redshift:us-east-1:123456789012:cluster:warehouse-prod',
          properties: [],
          region: 'us-east-1',
          resourceType: 'redshift:cluster',
          service: 'redshift',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        nodeCount: 2,
        nodeType: 'ra3.xlplus',
        region: 'us-east-1',
        reservedNodeId: 'reserved-node-1',
        startTime: '2025-01-01T00:00:00.000Z',
        state: 'active',
      },
    ]);
  });
});
