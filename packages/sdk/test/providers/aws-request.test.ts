import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withAwsClientCredentials } from '../../src/providers/aws/client.js';
import { getAwsClient, waitForAwsDelay, withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import { createMemoryAwsRequestStore as memoryStore } from '../../src/providers/aws/request-store.js';
import { withAwsServiceCallBudget, withAwsServiceErrorContext } from '../../src/providers/aws/resources/utils.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('shared AWS request admission', () => {
  it('hydrates 250 synthetic buckets within 50 seconds while sharing the bucket control-plane rate', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const controller = new AbortController();
    const starts: number[] = [];
    const work = withAwsDiscoveryExecution({ signal: controller.signal }, () =>
      withAwsServiceCallBudget(
        async () => {
          // Match the collector's batches of ten buckets and its two parallel reads per bucket.
          for (let batch = 0; batch < 25; batch += 1) {
            await Promise.all(
              Array.from({ length: 10 }, () =>
                Promise.all(
                  ['GetBucketLifecycleConfiguration', 'ListBucketIntelligentTieringConfigurations'].map((operation) =>
                    withAwsServiceErrorContext('Amazon S3', operation, 'eu-west-1', async () => {
                      starts.push(Date.now());
                    }),
                  ),
                ),
              ),
            );
          }
        },
        { accountId: 'large-bucket-account', store: memoryStore() },
      ),
    );
    const completed = work.then(
      () => true,
      () => false,
    );
    try {
      await vi.advanceTimersByTimeAsync(50_000);
      expect(starts).toHaveLength(500);
      expect(starts.at(-1)).toBeLessThanOrEqual(49_000);
      for (const start of starts)
        expect(starts.filter((time) => time >= start && time < start + 1_000).length).toBeLessThanOrEqual(10);
      expect(await completed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      controller.abort();
      await completed;
    }
  });

  it.each([
    'success',
    'error',
  ] as const)('preserves the AWS %s and telemetry when releasing admission fails', async (outcome) => {
    const store = memoryStore();
    const update = store.update;
    vi.spyOn(store, 'update').mockImplementationOnce(update).mockRejectedValue(new Error('DO-NOT-LOG-STATE'));
    const onAttempt = vi.fn();
    const logger = vi.fn();
    const response = { $metadata: { httpStatusCode: 200 }, data: 'DO-NOT-LOG-RESPONSE' };
    const failure = new Error('Original AWS failure');
    const request = withAwsDiscoveryExecution({ debugLogger: logger }, () =>
      withAwsServiceCallBudget(
        () =>
          withAwsServiceErrorContext(
            'Amazon CloudWatch Logs',
            'DescribeLogStreams',
            'eu-west-1',
            async () => {
              if (outcome === 'error') throw failure;
              return response;
            },
            { passthrough: () => true },
          ),
        { accountId: 'cleanup-account', store, onAttempt },
      ),
    );

    if (outcome === 'success') await expect(request).resolves.toBe(response);
    else await expect(request).rejects.toBe(failure);
    expect(onAttempt).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ outcome, cleanupOutcome: 'deferred' }));
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('"cleanupOutcome":"deferred"'));
    expect(JSON.stringify([logger.mock.calls, onAttempt.mock.calls])).not.toContain('DO-NOT-LOG');
  });

  it('bounds contended cleanup and clears its timer without losing a successful response', async () => {
    vi.useFakeTimers();
    const store = memoryStore();
    const update = store.update;
    vi.spyOn(store, 'update')
      .mockImplementationOnce(update)
      .mockImplementationOnce(
        async (_key, _update, signal) =>
          new Promise<never>((_resolve, reject) =>
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true }),
          ),
      );
    const onAttempt = vi.fn();
    const request = withAwsServiceCallBudget(
      () =>
        withAwsServiceErrorContext('Amazon CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', async () => 'response'),
      { accountId: 'contended-cleanup', store, onAttempt },
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(onAttempt).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ outcome: 'success', cleanupOutcome: 'deferred' }),
    );
    await expect(request).resolves.toBe('response');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases an admitted slot after cancellation so a fresh scan can progress immediately', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const controller = new AbortController();
    const started = Promise.withResolvers<void>();
    const reason = new DOMException('Caller cancelled discovery.', 'AbortError');
    const onAttempt = vi.fn();
    const options = {
      accountId: 'cancelled-cleanup',
      store: memoryStore(),
      onAttempt,
      overrides: { 'logs:DescribeLogStreams': { concurrency: 1, ratePerSecond: 10, burst: 10 } },
    };
    let request: Promise<void> | undefined;
    const scan = withAwsDiscoveryExecution({ signal: controller.signal }, () => {
      request = withAwsServiceCallBudget(
        () =>
          withAwsServiceErrorContext('Amazon CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', async () => {
            started.resolve();
            await waitForAwsDelay(1_000);
          }),
        options,
      );
      return request;
    });
    const scanOutcome = scan.catch((error) => error);
    await started.promise;
    const requestOutcome = request?.catch((error) => error);
    controller.abort(reason);
    expect(await scanOutcome).toBe(reason);
    expect(await requestOutcome).toBe(reason);
    expect(onAttempt).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ outcome: 'cancelled', cleanupOutcome: 'released' }),
    );

    const execute = vi.fn(async () => 'fresh response');
    const next = withAwsServiceCallBudget(
      () => withAwsServiceErrorContext('Amazon CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', execute),
      options,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledOnce();
    await expect(next).resolves.toBe('fresh response');
    expect(Date.now()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

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
