import type { GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudWatchClient } from '../../src/providers/aws/client.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCloudWatchClient: vi.fn(),
}));

const mockedCreateCloudWatchClient = vi.mocked(createCloudWatchClient);

describe('fetchCloudWatchSignals', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('normalizes CloudWatch metric results by query id', async () => {
    mockedCreateCloudWatchClient.mockReturnValue({
      send: vi.fn(async (_command: GetMetricDataCommand) => ({
        MetricDataResults: [
          {
            Id: 'cpu0',
            Timestamps: [new Date('2026-03-10T00:00:00.000Z')],
            Values: [4.2],
          },
          {
            Id: 'net0',
            Timestamps: [new Date('2026-03-10T00:00:00.000Z')],
            Values: [1024],
          },
        ],
      })),
    } as never);

    const result = await fetchCloudWatchSignals({
      endTime: new Date('2026-03-13T00:00:00.000Z'),
      queries: [
        {
          dimensions: [{ Name: 'InstanceId', Value: 'i-123' }],
          id: 'cpu0',
          metricName: 'CPUUtilization',
          namespace: 'AWS/EC2',
          period: 86_400,
          stat: 'Average',
        },
        {
          dimensions: [{ Name: 'InstanceId', Value: 'i-123' }],
          id: 'net0',
          metricName: 'NetworkIn',
          namespace: 'AWS/EC2',
          period: 86_400,
          stat: 'Sum',
        },
      ],
      region: 'us-east-1',
      startTime: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(result).toEqual(
      new Map([
        [
          'cpu0',
          [
            {
              timestamp: '2026-03-10T00:00:00.000Z',
              value: 4.2,
            },
          ],
        ],
        [
          'net0',
          [
            {
              timestamp: '2026-03-10T00:00:00.000Z',
              value: 1024,
            },
          ],
        ],
      ]),
    );
  });
});
