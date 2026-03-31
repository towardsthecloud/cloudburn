import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import { hydrateAwsEc2Instances } from '../../src/providers/aws/resources/ec2.js';
import { hydrateAwsEc2InstanceUtilization } from '../../src/providers/aws/resources/ec2-utilization.js';

vi.mock('../../src/providers/aws/resources/cloudwatch.js', () => ({
  fetchCloudWatchSignals: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/ec2.js', () => ({
  hydrateAwsEc2Instances: vi.fn(),
}));

const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);
const mockedHydrateAwsEc2Instances = vi.mocked(hydrateAwsEc2Instances);

describe('hydrateAwsEc2InstanceUtilization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates EC2 utilization summaries from daily CPU and network metrics', async () => {
    mockedHydrateAwsEc2Instances.mockResolvedValue([
      {
        accountId: '123456789012',
        instanceId: 'i-123',
        instanceType: 'm6i.large',
        region: 'us-east-1',
      },
    ]);
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'cpu0',
          [
            { timestamp: '2026-03-01T00:00:00.000Z', value: 5 },
            { timestamp: '2026-03-02T00:00:00.000Z', value: 4 },
            { timestamp: '2026-03-03T00:00:00.000Z', value: 3 },
            { timestamp: '2026-03-04T00:00:00.000Z', value: 2 },
          ],
        ],
        [
          'in0',
          [
            { timestamp: '2026-03-01T00:00:00.000Z', value: 1024 },
            { timestamp: '2026-03-02T00:00:00.000Z', value: 2048 },
            { timestamp: '2026-03-03T00:00:00.000Z', value: 1024 },
            { timestamp: '2026-03-04T00:00:00.000Z', value: 2048 },
          ],
        ],
        [
          'out0',
          [
            { timestamp: '2026-03-01T00:00:00.000Z', value: 1024 },
            { timestamp: '2026-03-02T00:00:00.000Z', value: 1024 },
            { timestamp: '2026-03-03T00:00:00.000Z', value: 1024 },
            { timestamp: '2026-03-04T00:00:00.000Z', value: 1024 },
          ],
        ],
      ]),
    );

    await expect(hydrateAwsEc2InstanceUtilization([])).resolves.toEqual([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast14Days: 3.5,
        averageDailyNetworkBytesLast14Days: 2560,
        instanceId: 'i-123',
        instanceType: 'm6i.large',
        lowUtilizationDays: 4,
        region: 'us-east-1',
      },
    ]);
  });

  it('reuses the shared EC2 instance dataset when a discovery context provides preloaded instances', async () => {
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        ['cpu0', [{ timestamp: '2026-03-01T00:00:00.000Z', value: 5 }]],
        ['in0', [{ timestamp: '2026-03-01T00:00:00.000Z', value: 1024 }]],
        ['out0', [{ timestamp: '2026-03-01T00:00:00.000Z', value: 1024 }]],
      ]),
    );

    await expect(
      hydrateAwsEc2InstanceUtilization([], {
        loadDataset: async () => [
          {
            accountId: '123456789012',
            instanceId: 'i-123',
            instanceType: 'm6i.large',
            region: 'us-east-1',
          },
        ],
      }),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast14Days: 5,
        averageDailyNetworkBytesLast14Days: 2048,
        instanceId: 'i-123',
        instanceType: 'm6i.large',
        lowUtilizationDays: 1,
        region: 'us-east-1',
      },
    ]);

    expect(mockedHydrateAwsEc2Instances).not.toHaveBeenCalled();
  });
});
