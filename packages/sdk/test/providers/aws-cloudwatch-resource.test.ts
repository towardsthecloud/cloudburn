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

  const query = (id: string, period = 86_400) => ({
    id,
    period,
    dimensions: [],
    metricName: 'CPUUtilization',
    namespace: 'AWS/EC2',
    stat: 'Average' as const,
  });
  const window = {
    region: 'us-east-1',
    startTime: new Date('2026-03-01T00:00:00.000Z'),
    endTime: new Date('2026-03-15T00:00:00.000Z'),
  };

  it('packs 500 daily queries into a request and runs independent batches while the first is slow', async () => {
    let release = (): void => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const batchSizes: number[] = [];
    const send = vi.fn(async (command: GetMetricDataCommand) => {
      const queries = command.input.MetricDataQueries ?? [];
      batchSizes.push(queries.length);
      if (queries[0]?.Id === 'cpu0') await slow;
      return {
        MetricDataResults: queries.map((entry) => ({
          Id: entry.Id,
          StatusCode: 'Complete',
          Timestamps: [window.startTime],
          Values: [1],
        })),
      };
    });
    mockedCreateCloudWatchClient.mockReturnValue({ send } as never);
    const run = fetchCloudWatchSignals({ ...window, queries: Array.from({ length: 501 }, (_, i) => query(`cpu${i}`)) });
    try {
      await vi.waitFor(() => expect(batchSizes).toEqual([500, 1]), { timeout: 1000 });
    } finally {
      release();
      await run;
    }
    const result = await run;
    expect([...result.keys()]).toEqual(Array.from({ length: 501 }, (_, i) => `cpu${i}`));
  });

  it('bounds estimated datapoints as well as query count and pins aligned windows through pagination', async () => {
    const send = vi.fn(async (command: GetMetricDataCommand) => {
      expect(command.input.MetricDataQueries?.length).toBeLessThanOrEqual(5);
      expect(command.input.MaxDatapoints).toBe(100800);
      expect(command.input.StartTime).toEqual(window.startTime);
      expect(command.input.EndTime).toEqual(window.endTime);
      return { MetricDataResults: [] };
    });
    mockedCreateCloudWatchClient.mockReturnValue({ send } as never);
    await fetchCloudWatchSignals({
      ...window,
      startTime: new Date(window.startTime.getTime() + 1234),
      endTime: new Date(window.endTime.getTime() + 5678),
      queries: Array.from({ length: 6 }, (_, i) => query(`cpu${i}`, 60)),
    });
    expect(send).toHaveBeenCalledTimes(2);
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

  it('omits metric evidence when CloudWatch marks a query result incomplete', async () => {
    mockedCreateCloudWatchClient.mockReturnValue({
      send: vi.fn(async (_command: GetMetricDataCommand) => ({
        MetricDataResults: [
          {
            Id: 'partial0',
            StatusCode: 'PartialData',
            Timestamps: [new Date('2026-03-10T00:00:00.000Z')],
            Values: [0],
          },
          {
            Id: 'complete0',
            StatusCode: 'Complete',
            Timestamps: [new Date('2026-03-10T00:00:00.000Z')],
            Values: [4.2],
          },
        ],
      })),
    } as never);

    const result = await fetchCloudWatchSignals({
      endTime: new Date('2026-03-13T00:00:00.000Z'),
      queries: [
        {
          dimensions: [{ Name: 'InstanceId', Value: 'i-123' }],
          id: 'partial0',
          metricName: 'CPUUtilization',
          namespace: 'AWS/EC2',
          period: 86_400,
          stat: 'Average',
        },
        {
          dimensions: [{ Name: 'InstanceId', Value: 'i-123' }],
          id: 'complete0',
          metricName: 'CPUUtilization',
          namespace: 'AWS/EC2',
          period: 86_400,
          stat: 'Average',
        },
      ],
      region: 'us-east-1',
      startTime: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(result).toEqual(
      new Map([
        [
          'complete0',
          [
            {
              timestamp: '2026-03-10T00:00:00.000Z',
              value: 4.2,
            },
          ],
        ],
      ]),
    );
  });

  it('accumulates paginated partial data when the query finishes complete', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        MetricDataResults: [
          {
            Id: 'cpu0',
            StatusCode: 'PartialData',
            Timestamps: [new Date('2026-03-09T00:00:00.000Z')],
            Values: [3.1],
          },
        ],
        NextToken: 'page-2',
      })
      .mockResolvedValueOnce({
        MetricDataResults: [
          {
            Id: 'cpu0',
            StatusCode: 'Complete',
            Timestamps: [new Date('2026-03-10T00:00:00.000Z')],
            Values: [4.2],
          },
        ],
      });
    mockedCreateCloudWatchClient.mockReturnValue({ send } as never);

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
      ],
      region: 'us-east-1',
      startTime: new Date('2026-03-01T00:00:00.000Z'),
    });

    expect(result.get('cpu0')).toEqual([
      { timestamp: '2026-03-09T00:00:00.000Z', value: 3.1 },
      { timestamp: '2026-03-10T00:00:00.000Z', value: 4.2 },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
