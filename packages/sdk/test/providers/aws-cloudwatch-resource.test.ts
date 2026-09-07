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

  it('bounds recoverable errors even when CloudWatch repeats a pagination token', async () => {
    let requests = 0;
    const send = vi.fn(async () => {
      requests += 1;
      if (requests > 6) throw new Error('Exceeded the synthetic query retry budget');
      return { NextToken: 'stuck', MetricDataResults: [{ Id: 'cpu0', StatusCode: 'InternalError' }] };
    });
    mockedCreateCloudWatchClient.mockReturnValue({ send } as never);
    const result = await fetchCloudWatchSignals({ ...window, queries: [query('cpu0')] });
    expect(result.get('cpu0')).toMatchObject({ status: 'InternalError', attempts: 3 });
    expect(send).toHaveBeenCalledTimes(6);
  });

  it('never lets conflicting or repeated bucket values become complete low-activity evidence', async () => {
    mockedCreateCloudWatchClient.mockReturnValue({
      send: vi.fn(async () => ({
        MetricDataResults: [
          {
            Id: 'cpu0',
            StatusCode: 'Complete',
            Timestamps: [window.startTime, window.startTime, new Date('2026-03-01T00:01:00Z')],
            Values: [500, 0, 0],
          },
        ],
      })),
    } as never);
    const result = await fetchCloudWatchSignals({ ...window, queries: [query('cpu0')] });
    expect(result.get('cpu0')).toMatchObject({
      status: 'PartialData',
      coverage: { expectedPoints: 14, observedPoints: 1 },
    });
    expect(result.get('cpu0')?.points[0]?.value).toBe(500);
  });

  it('retries only recoverable query failures and replaces partial points after recovery', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        MetricDataResults: [
          { Id: 'ok', StatusCode: 'Complete', Timestamps: [window.startTime], Values: [1] },
          {
            Id: 'retry',
            StatusCode: 'InternalError',
            Timestamps: [window.startTime],
            Values: [500],
            Messages: [{ Code: 'InternalError', Value: 'Try again' }],
          },
          { Id: 'denied', StatusCode: 'Forbidden' },
        ],
      })
      .mockResolvedValueOnce({
        MetricDataResults: [{ Id: 'retry', StatusCode: 'Complete', Timestamps: [window.startTime], Values: [600] }],
      });
    mockedCreateCloudWatchClient.mockReturnValue({ send } as never);
    const results = await fetchCloudWatchSignals({
      ...window,
      queries: ['ok', 'retry', 'denied'].map((id) => query(id)),
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0].input.MetricDataQueries.map((entry: { Id: string }) => entry.Id)).toEqual(['retry']);
    expect(results.get('retry')).toMatchObject({
      status: 'Complete',
      attempts: 2,
      points: [{ timestamp: '2026-03-01T00:00:00.000Z', value: 600 }],
      messages: [{ code: 'InternalError', value: 'Try again', scope: 'query' }],
    });
    expect(results.get('ok')?.attempts).toBe(1);
  });

  it('retains complete, empty, partial, forbidden, failed and absent evidence separately', async () => {
    mockedCreateCloudWatchClient.mockReturnValue({
      send: vi.fn(async () => ({
        Messages: [{ Code: 'Notice', Value: 'Synthetic request diagnostic' }],
        MetricDataResults: [
          { Id: 'data', StatusCode: 'Complete', Timestamps: [window.startTime], Values: [500] },
          { Id: 'empty', StatusCode: 'Complete' },
          { Id: 'partial', StatusCode: 'PartialData', Timestamps: [window.startTime], Values: [500] },
          { Id: 'denied', StatusCode: 'Forbidden', Messages: [{ Code: 'Forbidden', Value: 'Synthetic query denial' }] },
          { Id: 'failed', StatusCode: 'InternalError' },
        ],
      })),
    } as never);
    const results = await fetchCloudWatchSignals({
      ...window,
      queries: ['data', 'empty', 'partial', 'denied', 'failed', 'absent'].map((id) => query(id)),
    });
    expect([...results].map(([id, evidence]) => [id, evidence.status, evidence.points.length])).toEqual([
      ['data', 'Complete', 1],
      ['empty', 'Complete', 0],
      ['partial', 'PartialData', 1],
      ['denied', 'Forbidden', 0],
      ['failed', 'InternalError', 0],
      ['absent', 'Missing', 0],
    ]);
    expect(results.get('partial')).toMatchObject({
      points: [{ timestamp: '2026-03-01T00:00:00.000Z', value: 500 }],
      window: { startTime: '2026-03-01T00:00:00.000Z', endTime: '2026-03-15T00:00:00.000Z', periodSeconds: 86400 },
      coverage: { expectedPoints: 14, observedPoints: 1 },
    });
    expect(results.get('denied')?.messages).toEqual(
      expect.arrayContaining([
        { scope: 'request', code: 'Notice', value: 'Synthetic request diagnostic' },
        { scope: 'query', code: 'Forbidden', value: 'Synthetic query denial' },
      ]),
    );
  });

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

  it('bounds estimated datapoints as well as query count and preserves caller-selected windows', async () => {
    const send = vi.fn(async (command: GetMetricDataCommand) => {
      expect(command.input.MetricDataQueries?.length).toBeLessThanOrEqual(5);
      expect(command.input.MaxDatapoints).toBe(100800);
      expect(command.input.StartTime).toEqual(new Date(window.startTime.getTime() + 1234));
      expect(command.input.EndTime).toEqual(new Date(window.endTime.getTime() + 5678));
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
            StatusCode: 'Complete',
            Timestamps: [new Date('2026-03-10T00:00:00.000Z')],
            Values: [4.2],
          },
          {
            Id: 'net0',
            StatusCode: 'Complete',
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

    expect(new Map([...result].map(([id, evidence]) => [id, evidence.points]))).toEqual(
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

  it('keeps terminal partial evidence across pages after three bounded attempts', async () => {
    const send = vi.fn(async (command: GetMetricDataCommand) => ({
      MetricDataResults: [
        {
          Id: 'cpu0',
          StatusCode: 'PartialData',
          Timestamps: [command.input.NextToken ? new Date('2026-03-02T00:00:00Z') : window.startTime],
          Values: [500],
        },
      ],
      NextToken: command.input.NextToken ? undefined : 'page-2',
    }));
    mockedCreateCloudWatchClient.mockReturnValue({ send } as never);
    const results = await fetchCloudWatchSignals({ ...window, queries: [query('cpu0')] });
    expect(send).toHaveBeenCalledTimes(6);
    expect(results.get('cpu0')).toMatchObject({
      status: 'PartialData',
      attempts: 3,
      coverage: { expectedPoints: 14, observedPoints: 2 },
      points: [
        { timestamp: '2026-03-01T00:00:00.000Z', value: 500 },
        { timestamp: '2026-03-02T00:00:00.000Z', value: 500 },
      ],
    });
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

    expect(result.get('cpu0')?.status).toBe('Complete');
    expect(result.get('cpu0')?.points).toEqual([
      { timestamp: '2026-03-09T00:00:00.000Z', value: 3.1 },
      { timestamp: '2026-03-10T00:00:00.000Z', value: 4.2 },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
