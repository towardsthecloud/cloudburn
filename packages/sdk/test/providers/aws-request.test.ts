import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withAwsClientCredentials } from '../../src/providers/aws/client.js';
import { getAwsClient, withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import { createMemoryAwsRequestStore as memoryStore } from '../../src/providers/aws/request-store.js';
import { withAwsServiceCallBudget, withAwsServiceErrorContext } from '../../src/providers/aws/resources/utils.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('shared AWS request admission', () => {
  it.each([
    'null',
    '[]',
    '"configured"',
    '{"logs:DescribeLogStreams":2}',
    '{"logs:DescribeLogStreams":null}',
    'SECRET-not-json',
  ])('rejects malformed override configuration before starting work: %s', async (configured) => {
    vi.stubEnv('CLOUDBURN_AWS_QUOTA_OVERRIDES', configured);
    const execute = vi.fn();
    await expect(Promise.resolve().then(() => withAwsServiceCallBudget(execute))).rejects.toThrow(
      'CLOUDBURN_AWS_QUOTA_OVERRIDES',
    );
    expect(execute).not.toHaveBeenCalled();
  });
  it('paces fast calls from different scans and datasets in the same account quota', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const store = memoryStore();
    const starts: number[] = [];
    const scan = (dataset: string) =>
      withAwsServiceCallBudget(
        () =>
          Promise.all(
            Array.from({ length: 3 }, () =>
              withAwsServiceErrorContext('Amazon CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', async () => {
                starts.push(Date.now());
              }),
            ),
          ),
        {
          accountId: '111111111111',
          store,
          attribution: { dataset },
          overrides: {
            'logs:DescribeLogStreams': { ratePerSecond: 2, burst: 2 },
          },
        },
      );
    const work = Promise.all([scan('logsActivity'), scan('logsRetention')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([0, 0]);
    await vi.advanceTimersByTimeAsync(999);
    expect(starts).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1001);
    await work;
    expect(starts).toEqual([0, 0, 1000, 1000, 2000, 2000]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('slows new requests, exhausts shared retries under failure and replenishes them after recovery', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const store = memoryStore();
    const starts: number[] = [];
    const throttle = Object.assign(new Error('sensitive AWS error payload'), { name: 'ThrottlingException' });
    const options = {
      accountId: 'retry-account',
      store,
      overrides: {
        'logs:DescribeLogStreams': { ratePerSecond: 10, burst: 10, retryCapacity: 2 },
      },
    };
    const failing = () =>
      withAwsServiceErrorContext(
        'Amazon CloudWatch Logs',
        'DescribeLogStreams',
        'eu-west-1',
        async () => {
          starts.push(Date.now());
          throw throttle;
        },
        { initialDelayMs: 0 },
      );
    const failed = withAwsServiceCallBudget(() => Promise.allSettled([failing(), failing()]), options);
    await vi.advanceTimersByTimeAsync(0);
    expect(starts).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await failed).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(starts).toHaveLength(4); // Two initial calls plus two retries for the whole quota.
    expect(starts[2]).toBeGreaterThanOrEqual(500);

    await withAwsServiceCallBudget(
      () =>
        withAwsServiceErrorContext('Amazon CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', async () => 'healthy'),
      options,
    );
    let attempts = 0;
    const recovered = withAwsServiceCallBudget(
      () =>
        withAwsServiceErrorContext(
          'Amazon CloudWatch Logs',
          'DescribeLogStreams',
          'eu-west-1',
          async () => {
            if (++attempts === 1) throw throttle;
            return 'recovered';
          },
          { initialDelayMs: 0 },
        ),
      options,
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(recovered).resolves.toBe('recovered');
    expect(attempts).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports attributed attempt timing and outcomes without AWS payloads or credentials', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const onAttempt = vi.fn();
    const logger = vi.fn();
    let count = 0;
    const work = withAwsDiscoveryExecution({ debugLogger: logger }, () =>
      withAwsServiceCallBudget(
        () =>
          withAwsServiceErrorContext(
            'Amazon CloudWatch Logs',
            'DescribeLogStreams',
            'eu-west-1',
            async () => {
              await new Promise((resolve) => setTimeout(resolve, 5));
              if (++count === 1)
                throw Object.assign(new Error('DO-NOT-LOG-SECRET'), {
                  name: 'ThrottlingException',
                  $metadata: { httpStatusCode: 429 },
                });
              return { payload: 'DO-NOT-LOG-RESPONSE', $metadata: { httpStatusCode: 200 } };
            },
            { initialDelayMs: 0 },
          ),
        {
          accountId: 'telemetry-account',
          store: memoryStore(),
          onAttempt,
          attribution: { dataset: 'awsCloudWatchLogActivity' },
        },
      ),
    );
    await vi.advanceTimersByTimeAsync(2000);
    await work;
    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onAttempt.mock.calls[0]?.[0]).toMatchObject({
      operation: 'DescribeLogStreams',
      attempt: 1,
      retryCount: 0,
      queueDurationMs: 0,
      transportDurationMs: 5,
      outcome: 'throttled',
      retryOutcome: 'scheduled',
      statusCode: 429,
      quota: { accountId: 'telemetry-account', region: 'eu-west-1', service: 'logs', group: 'DescribeLogStreams' },
      attribution: { dataset: 'awsCloudWatchLogActivity', collector: 'logs:DescribeLogStreams' },
    });
    expect(onAttempt.mock.calls[1]?.[0]).toMatchObject({
      attempt: 2,
      retryCount: 1,
      queueDurationMs: 500,
      transportDurationMs: 5,
      outcome: 'success',
      retryOutcome: 'none',
      statusCode: 200,
    });
    expect(logger.mock.calls.some(([line]) => line.startsWith('aws: attempt '))).toBe(true);
    expect(JSON.stringify([onAttempt.mock.calls, logger.mock.calls])).not.toContain('DO-NOT-LOG');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('charges each CloudWatch page against shared datapoint throughput before transport', async () => {
    const starts: number[] = [];
    const onAttempt = vi.fn();
    const work = withAwsClientCredentials({ accessKeyId: 'SYNTHETIC', secretAccessKey: 'DO-NOT-LOG-CREDENTIALS' }, () =>
      withAwsDiscoveryExecution({}, async () => {
        const client = getAwsClient(
          'metric-test-client',
          () =>
            new CloudWatchClient({
              region: 'eu-west-1',
              credentials: { accessKeyId: 'SYNTHETIC', secretAccessKey: 'DO-NOT-LOG-CREDENTIALS' },
              requestHandler: {
                handle: async () => {
                  starts.push(Date.now());
                  return { response: { statusCode: 200, headers: {}, body: Buffer.from('{"MetricDataResults":[]}') } };
                },
              },
            }),
        );
        const store = memoryStore();
        await Promise.all(
          ['first', 'second', 'third'].map((dataset) =>
            withAwsServiceCallBudget(
              () =>
                withAwsServiceErrorContext('Amazon CloudWatch', 'GetMetricData', 'eu-west-1', () =>
                  client.send(
                    new GetMetricDataCommand({
                      StartTime: new Date(Date.now() - 60_000),
                      EndTime: new Date(),
                      MetricDataQueries: [],
                      MaxDatapoints: 100_800,
                    }),
                  ),
                ),
              { accountId: 'metrics-account', store, onAttempt, attribution: { dataset } },
            ),
          ),
        );
      }),
    );
    await work;
    expect(starts).toHaveLength(3);
    expect((starts[1] ?? Number.NaN) - (starts[0] ?? Number.NaN)).toBeGreaterThanOrEqual(990);
    expect((starts[2] ?? Number.NaN) - (starts[1] ?? Number.NaN)).toBeGreaterThanOrEqual(990);
    expect(onAttempt.mock.calls.map(([event]) => event.datapoints?.cost)).toEqual([100_800, 100_800, 100_800]);
    expect(onAttempt.mock.calls[2]?.[0].queueDurationMs).toBeGreaterThanOrEqual(1990);
    expect(JSON.stringify(onAttempt.mock.calls)).not.toContain('DO-NOT-LOG');
  });
});
