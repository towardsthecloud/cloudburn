import type { DescribeClusterCommand, ListInstancesCommand } from '@aws-sdk/client-emr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmrClient } from '../../src/providers/aws/client.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import { hydrateAwsEmrClusterMetrics, hydrateAwsEmrClusters } from '../../src/providers/aws/resources/emr.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createEmrClient: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', () => ({
  fetchCloudWatchSignals: vi.fn(),
}));

const mockedCreateEmrClient = vi.mocked(createEmrClient);
const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);

describe('EMR discovery resources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered EMR clusters from DescribeCluster and ListInstances', async () => {
    const send = vi.fn(async (command: DescribeClusterCommand | ListInstancesCommand) => {
      if (command.constructor.name === 'DescribeClusterCommand') {
        return {
          Cluster: {
            Id: 'j-CLUSTER1',
            Name: 'analytics',
            NormalizedInstanceHours: 240,
            Status: {
              State: 'RUNNING',
              Timeline: {
                ReadyDateTime: new Date('2026-03-01T00:00:00.000Z'),
              },
            },
          },
        };
      }

      return {
        Instances: [{ InstanceType: 'm6i.xlarge' }, { InstanceType: 'm8g.xlarge' }],
      };
    });

    mockedCreateEmrClient.mockReturnValue({
      send,
    } as never);

    await expect(
      hydrateAwsEmrClusters([
        {
          accountId: '123456789012',
          arn: 'arn:aws:emr:us-east-1:123456789012:cluster/j-CLUSTER1',
          name: 'analytics-display-name',
          properties: [],
          region: 'us-east-1',
          resourceType: 'elasticmapreduce:cluster',
          service: 'emr',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        clusterId: 'j-CLUSTER1',
        clusterName: 'analytics',
        instanceTypes: ['m6i.xlarge', 'm8g.xlarge'],
        normalizedInstanceHours: 240,
        readyDateTime: '2026-03-01T00:00:00.000Z',
        region: 'us-east-1',
        state: 'RUNNING',
      },
    ]);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          ClusterId: 'j-CLUSTER1',
        }),
      }),
    );
  });

  it('hydrates EMR idle summaries from the IsIdle CloudWatch metric', async () => {
    mockedCreateEmrClient.mockReturnValue({
      send: vi.fn(async (command: DescribeClusterCommand | ListInstancesCommand) => {
        if (command.constructor.name === 'DescribeClusterCommand') {
          return {
            Cluster: {
              Id: 'j-CLUSTER1',
              Name: 'analytics',
              Status: {
                State: 'WAITING',
                Timeline: {
                  ReadyDateTime: new Date('2026-03-01T00:00:00.000Z'),
                },
              },
            },
          };
        }

        return {
          Instances: [{ InstanceType: 'm8g.xlarge' }],
        };
      }),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'idle0',
          Array.from({ length: 6 }, (_, index) => ({
            timestamp: `2026-03-17T00:${String(index * 5).padStart(2, '0')}:00.000Z`,
            value: 1,
          })),
        ],
      ]),
    );

    await expect(
      hydrateAwsEmrClusterMetrics([
        {
          accountId: '123456789012',
          arn: 'arn:aws:emr:us-east-1:123456789012:cluster/j-CLUSTER1',
          properties: [],
          region: 'us-east-1',
          resourceType: 'elasticmapreduce:cluster',
          service: 'emr',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        clusterId: 'j-CLUSTER1',
        idlePeriodsLast30Minutes: 6,
        region: 'us-east-1',
      },
    ]);
  });
});
