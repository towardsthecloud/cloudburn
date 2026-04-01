import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import { hydrateAwsEcsClusters } from '../../src/providers/aws/resources/ecs.js';
import { hydrateAwsEcsClusterMetrics } from '../../src/providers/aws/resources/ecs-cluster-metrics.js';

vi.mock('../../src/providers/aws/resources/cloudwatch.js', () => ({
  fetchCloudWatchSignals: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/ecs.js', () => ({
  hydrateAwsEcsClusters: vi.fn(),
}));

const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);
const mockedHydrateAwsEcsClusters = vi.mocked(hydrateAwsEcsClusters);

const createDailyPoints = (count: number, value: number) =>
  Array.from({ length: count }, (_, index) => ({
    timestamp: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    value,
  }));

describe('hydrateAwsEcsClusterMetrics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates ECS cluster metrics with a 14-day average CPU utilization', async () => {
    mockedHydrateAwsEcsClusters.mockResolvedValue([
      {
        accountId: '123456789012',
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        region: 'us-east-1',
      },
    ]);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map([['ecsCluster0', createDailyPoints(14, 5)]]));

    await expect(hydrateAwsEcsClusterMetrics([])).resolves.toEqual([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast14Days: 5,
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        region: 'us-east-1',
      },
    ]);
  });

  it('preserves unknown utilization when CloudWatch coverage is incomplete', async () => {
    mockedHydrateAwsEcsClusters.mockResolvedValue([
      {
        accountId: '123456789012',
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        region: 'us-east-1',
      },
    ]);
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map([['ecsCluster0', createDailyPoints(13, 5)]]));

    await expect(hydrateAwsEcsClusterMetrics([])).resolves.toEqual([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast14Days: null,
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        region: 'us-east-1',
      },
    ]);
  });

  it('reuses the shared ECS cluster dataset when a discovery context provides preloaded clusters', async () => {
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map([['ecsCluster0', createDailyPoints(14, 5)]]));

    await expect(
      hydrateAwsEcsClusterMetrics([], {
        loadDataset: async () => [
          {
            accountId: '123456789012',
            clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
            clusterName: 'production',
            region: 'us-east-1',
          },
        ],
      }),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast14Days: 5,
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        region: 'us-east-1',
      },
    ]);

    expect(mockedHydrateAwsEcsClusters).not.toHaveBeenCalled();
  });
});
