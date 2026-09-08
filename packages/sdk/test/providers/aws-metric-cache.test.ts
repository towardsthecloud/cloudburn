import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudWatchClient, type GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { STSClient } from '@aws-sdk/client-sts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryEvidenceCacheStore } from '../../src/evidence-cache.js';
import { withAwsClientCredentials } from '../../src/providers/aws/client.js';
import { withAwsEvidenceCache } from '../../src/providers/aws/evidence.js';
import { getAwsExecutionSignal, withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import { withAwsDatasetAttribution } from '../../src/providers/aws/request-attribution.js';
import { type CloudWatchMetricQuery, fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import { hydrateAwsLambdaFunctionMetrics } from '../../src/providers/aws/resources/lambda.js';
import type { AwsEvidenceCacheOptions } from '../../src/types.js';

const day = 86_400_000;
const startTime = new Date('2026-08-25T00:00:00Z');
const endTime = new Date('2026-09-08T00:00:00Z');
const query = {
  id: 'cpu',
  namespace: 'AWS/EC2',
  metricName: 'CPUUtilization',
  dimensions: [{ Name: 'InstanceId', Value: 'i-synthetic' }],
  period: 86400,
  stat: 'Average' as const,
};

describe('incremental CloudWatch evidence', () => {
  let store = createMemoryEvidenceCacheStore();
  let pointValue: (
    time: Date,
    metric: NonNullable<GetMetricDataCommand['input']['MetricDataQueries']>[number],
  ) => number | undefined;
  let status: string;
  let admissionDirectory: string;
  let beforeResponse: () => Promise<void>;
  let debugMessages: string[];
  const debugLogger = (message: string) => debugMessages.push(message);
  let requests: GetMetricDataCommand['input'][];
  const inScan = <T>(run: () => Promise<T>, cache: Partial<AwsEvidenceCacheOptions> = {}, signal?: AbortSignal) =>
    withAwsClientCredentials({ accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic', sessionToken: 'session' }, () =>
      withAwsDiscoveryExecution({ signal, debugLogger }, () =>
        withAwsEvidenceCache(
          { cache: { store, ...cache }, target: { mode: 'region', region: 'eu-west-1' }, debugLogger },
          run,
        ),
      ),
    );
  const scan = (end = endTime, metric: CloudWatchMetricQuery = query, cache: Partial<AwsEvidenceCacheOptions> = {}) =>
    inScan(
      () =>
        fetchCloudWatchSignals({
          region: 'eu-west-1',
          startTime: new Date(end.getTime() - 14 * day),
          endTime: end,
          queries: [metric],
        }),
      cache,
    );
  beforeEach(() => {
    admissionDirectory = mkdtempSync(join(tmpdir(), 'cloudburn-metric-cache-'));
    vi.stubEnv('CLOUDBURN_AWS_ADMISSION_DIR', admissionDirectory);
    requests = [];
    store = createMemoryEvidenceCacheStore();
    status = 'Complete';
    beforeResponse = async () => {};
    debugMessages = [];
    pointValue = () => 1;
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));
    vi.spyOn(STSClient.prototype, 'send').mockResolvedValue({
      Account: '111111111111',
      Arn: 'arn:aws:iam::111111111111:role/test',
    } as never);
    vi.spyOn(CloudWatchClient.prototype, 'send').mockImplementation(async (command) => {
      const input = (command as GetMetricDataCommand).input;
      requests.push(input);
      await beforeResponse();
      return {
        MetricDataResults: input.MetricDataQueries?.map((entry) => {
          const timestamps: Date[] = [];
          for (
            let time = input.StartTime?.getTime() ?? 0;
            time < (input.EndTime?.getTime() ?? 0);
            time += (entry.MetricStat?.Period ?? 86400) * 1000
          )
            timestamps.push(new Date(time));
          const observed = timestamps.flatMap((time) => {
            const value = pointValue(time, entry);
            return value === undefined ? [] : [{ time, value }];
          });
          return {
            Id: entry.Id,
            StatusCode: status,
            Timestamps: observed.map(({ time }) => time),
            Values: observed.map(({ value }) => value),
          };
        }),
      };
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(admissionDirectory, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('retains both dataset consumers when an identical metric cache miss shares one loader', async () => {
    await inScan(() =>
      Promise.all(
        ['aws-ec2-instance-utilization', 'aws-ec2-instance-network'].map((dataset, index) =>
          withAwsDatasetAttribution(dataset, () =>
            fetchCloudWatchSignals({
              region: 'eu-west-1',
              startTime,
              endTime,
              queries: [
                index === 0
                  ? query
                  : {
                      stat: query.stat,
                      period: query.period,
                      dimensions: query.dimensions.map(({ Name, Value }) => ({ Value, Name })),
                      metricName: query.metricName,
                      namespace: query.namespace,
                      id: query.id,
                    },
              ],
            }),
          ),
        ),
      ),
    );
    const attempts = debugMessages
      .filter((line) => line.startsWith('aws: attempt '))
      .map((line) => JSON.parse(line.slice(13)))
      .filter((event) => event.operation === 'GetMetricData');
    expect(requests).toHaveLength(1);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].attribution.datasets).toEqual(['aws-ec2-instance-network', 'aws-ec2-instance-utilization']);
    expect(attempts[0].attribution.dataset).toBeUndefined();
  });

  it('reuses the same window and fetches only recent overlap plus the missing day on rollover', async () => {
    const first = await scan();
    expect(first.get('cpu')?.coverage).toEqual({ expectedPoints: 14, observedPoints: 14 });
    expect(requests).toHaveLength(1);
    const repeated = await scan();
    expect(repeated).toEqual(first);
    expect(requests).toHaveLength(1);
    const telemetry = debugMessages
      .filter((line) => line.startsWith('aws: attempt '))
      .map((line) => JSON.parse(line.slice(13)))
      .filter((event) => event.type === 'metric-cache');
    expect(telemetry.at(-1)).toMatchObject({
      cacheHits: 14,
      datapointsReused: 14,
      datapointsFetched: 0,
      queryDatapointsAvoided: 14,
      requestsAvoided: 1,
    });
    expect(debugMessages.join('\n')).not.toContain('i-synthetic');
    vi.setSystemTime(new Date('2026-09-09T12:00:00Z'));
    const next = await scan(new Date(endTime.getTime() + day));
    expect(next.get('cpu')).toMatchObject({ status: 'Complete', coverage: { expectedPoints: 14, observedPoints: 14 } });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.StartTime?.getTime()).toBeGreaterThanOrEqual(endTime.getTime() - 3 * day);
    expect(next.get('cpu')?.window.startTime).toBe(new Date(startTime.getTime() + day).toISOString());
  });
  it('replaces revised overlap points without duplicates and retains older complete buckets', async () => {
    await scan();
    pointValue = (time) => (time.toISOString() === '2026-09-07T00:00:00.000Z' ? 5 : 1);
    vi.setSystemTime(new Date('2026-09-08T12:06:00Z'));
    const revised = await scan();
    expect(revised.get('cpu')?.points.reduce((sum, point) => sum + point.value, 0)).toBe(18);
    expect(revised.get('cpu')?.coverage).toEqual({ expectedPoints: 14, observedPoints: 14 });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.StartTime).toEqual(new Date('2026-09-05T00:00:00Z'));
  });

  it.each([
    'PartialData',
    'Forbidden',
  ])('never publishes %s intervals as complete or falls back after refresh', async (failure) => {
    await scan();
    status = failure;
    const failed = await scan(endTime, query, { mode: 'refresh' });
    expect(failed.get('cpu')?.status).toBe(failure);
    status = 'Complete';
    const before = requests.length;
    const recovered = await scan();
    expect(recovered.get('cpu')?.status).toBe('Complete');
    expect(requests.length).toBeGreaterThan(before);
    const after = requests.length;
    await scan();
    expect(requests).toHaveLength(after);
  });

  it('keeps caller IDs out of identity but separates metric dimensions, statistic, period, namespace and authorization scope', async () => {
    await scan();
    const renamed = await scan(endTime, { ...query, id: 'renamed' });
    expect(renamed.get('renamed')?.coverage.observedPoints).toBe(14);
    expect(requests).toHaveLength(1);
    for (const changed of [
      { ...query, dimensions: [{ Name: 'InstanceId', Value: 'i-other' }] },
      { ...query, stat: 'Sum' as const },
      { ...query, period: 3600 },
      { ...query, namespace: 'Synthetic/Other' },
      { ...query, metricName: 'NetworkOut' },
    ]) {
      const before = requests.length;
      await scan(endTime, changed);
      expect(requests.length).toBeGreaterThan(before);
    }
    const beforeScopeChange = requests.length;
    await scan(endTime, query, { authorizationContext: 'changed-policy' });
    expect(requests.length).toBeGreaterThan(beforeScopeChange);
  });

  it('preserves sample-weighted Lambda duration across daily reuse and late sample revisions', async () => {
    const functionArn = 'arn:aws:lambda:eu-west-1:111111111111:function:synthetic';
    vi.spyOn(LambdaClient.prototype, 'send').mockResolvedValue({
      Functions: [{ FunctionArn: functionArn, FunctionName: 'synthetic' }],
    } as never);
    let revised = false;
    pointValue = (time, metric) => {
      const date = time.toISOString();
      if (!['2026-09-03T12:00:00.000Z', '2026-09-07T12:00:00.000Z'].includes(date)) return undefined;
      const first = date.startsWith('2026-09-03');
      if (metric.MetricStat?.Metric?.MetricName === 'Duration') {
        if (metric.MetricStat.Stat === 'SampleCount') return first ? 1 : 9;
        return first ? 100 : revised ? 3600 : 2700;
      }
      return metric.MetricStat?.Metric?.MetricName === 'Errors' ? 0 : first ? 1 : 9;
    };
    const collect = () =>
      hydrateAwsLambdaFunctionMetrics([
        {
          accountId: '111111111111',
          arn: functionArn,
          properties: [],
          region: 'eu-west-1',
          resourceType: 'lambda:function',
          service: 'lambda',
        },
      ]);
    expect((await inScan(collect))[0]?.averageDurationMsLast7Days).toBe(280);
    expect(requests).toHaveLength(1);
    expect((await inScan(collect))[0]?.averageDurationMsLast7Days).toBe(280);
    expect(requests).toHaveLength(1);
    revised = true;
    vi.setSystemTime(new Date('2026-09-09T12:00:00Z'));
    const incremental = await inScan(collect);
    expect(incremental[0]?.averageDurationMsLast7Days).toBe(370);
    // The changed leading half-day is a separate exact interval from the recent overlap.
    expect(requests).toHaveLength(3);
    const refreshedHours = requests
      .slice(1)
      .reduce(
        (sum, request) => sum + ((request.EndTime?.getTime() ?? 0) - (request.StartTime?.getTime() ?? 0)) / 3_600_000,
        0,
      );
    expect(refreshedHours).toBeLessThan(168);
    expect(incremental).toEqual(await inScan(collect, { mode: 'off' }));
  });
  it('keeps a coalesced request alive when another scan still awaits one of its cached series', async () => {
    const controller = new AbortController();
    const gate = Promise.withResolvers<void>();
    let sharedSignal: AbortSignal | undefined;
    beforeResponse = async () => {
      sharedSignal = getAwsExecutionSignal();
      await gate.promise;
    };
    const other = { ...query, id: 'network', metricName: 'NetworkOut' };
    const first = inScan(
      () => fetchCloudWatchSignals({ region: 'eu-west-1', startTime, endTime, queries: [query, other] }),
      {},
      controller.signal,
    );
    const cancelled = expect(first).rejects.toThrow('cancel-first');
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const second = scan(endTime, other);
    await vi.waitFor(() =>
      expect(debugMessages.filter((line) => line.includes('evidence lookup metric-buckets'))).toHaveLength(42),
    );
    controller.abort(new Error('cancel-first'));
    await cancelled;
    expect(sharedSignal?.aborted).toBe(false);
    gate.resolve();
    expect((await second).get('network')?.coverage).toEqual({ expectedPoints: 14, observedPoints: 14 });
    expect(requests).toHaveLength(1);
  });

  it('retains the existing 500-query cold request packing while cache intervals are admitted', async () => {
    const result = await inScan(() =>
      fetchCloudWatchSignals({
        region: 'eu-west-1',
        startTime: new Date(endTime.getTime() - day),
        endTime,
        queries: Array.from({ length: 500 }, (_, index) => ({
          ...query,
          id: `cpu${index}`,
          dimensions: [{ Name: 'InstanceId', Value: `i-${index}` }],
        })),
      }),
    );
    expect(result.size).toBe(500);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.MetricDataQueries).toHaveLength(500);
  });
  it('revalidates historical intervals periodically instead of treating closed history as immutable', async () => {
    await scan();
    pointValue = (time) => (time.toISOString() === '2026-08-26T00:00:00.000Z' ? 10 : 1);
    vi.setSystemTime(new Date('2026-09-15T12:01:00Z'));
    const revised = await scan();
    expect(revised.get('cpu')?.points.reduce((sum, point) => sum + point.value, 0)).toBe(23);
    expect(requests).toHaveLength(2);
  });

  it('persists intervals through the established local SQLite cache across new scan contexts', async () => {
    const cache = { store: undefined, directory: join(admissionDirectory, 'evidence') };
    const first = await scan(endTime, query, cache);
    expect(await scan(endTime, query, cache)).toEqual(first);
    expect(requests).toHaveLength(1);
  });
});
