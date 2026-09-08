import { describe, expect, it, vi } from 'vitest';
import { createCloudWatchClient, withAwsClientCredentials } from '../../src/providers/aws/client.js';
import {
  emitAwsRequestTelemetry,
  getAwsDiscoveryTimestamp,
  getAwsExecutionSignal,
  withAwsDiscoveryExecution,
} from '../../src/providers/aws/execution.js';
import { planCloudWatchSignals, withCloudWatchMetricPlanning } from '../../src/providers/aws/metric-planner.js';
import type { CloudWatchMetricEvidence, CloudWatchMetricQuery } from '../../src/providers/aws/resources/cloudwatch.js';

const query = (id: string, metricName = 'CPUUtilization'): CloudWatchMetricQuery => ({
  id,
  namespace: 'AWS/EC2',
  metricName,
  dimensions: [{ Name: 'InstanceId', Value: 'i-one' }],
  period: 60,
  stat: 'Average',
});
const window = (start: number, end: number) => ({
  region: 'us-east-1',
  startTime: new Date(start * 60_000),
  endTime: new Date(end * 60_000),
});
type Request = Parameters<typeof planCloudWatchSignals>[0];
const complete = (request: Request): Map<string, CloudWatchMetricEvidence> =>
  new Map(
    request.queries.map((metric) => [
      metric.id,
      {
        status: 'Complete',
        points: [0, 1, 2, 3].map((minute) => ({
          timestamp: new Date(minute * 60_000).toISOString(),
          value: minute + 1,
        })),
        window: {
          startTime: request.startTime.toISOString(),
          endTime: request.endTime.toISOString(),
          periodSeconds: metric.period,
        },
        coverage: { expectedPoints: 4, observedPoints: 4 },
        messages: [],
        attempts: 1,
      },
    ]),
  );

describe('CloudWatch metric planning', () => {
  it('does not replace a partial-period aggregate with a longer window aggregate', async () => {
    const fetch = async (request: Request) => {
      const response = complete(request);
      for (const evidence of response.values()) {
        evidence.points = [
          { timestamp: request.startTime.toISOString(), value: (+request.endTime - +request.startTime) / 60_000 },
        ];
        evidence.coverage = { expectedPoints: 1, observedPoints: 1 };
      }
      return response;
    };
    const results = await withCloudWatchMetricPlanning(() =>
      Promise.all([
        planCloudWatchSignals({ ...window(0, 30), queries: [{ ...query('partial'), period: 3600 }] }, fetch),
        planCloudWatchSignals({ ...window(0, 60), queries: [{ ...query('full'), period: 3600 }] }, fetch),
      ]),
    );
    expect(results.map((result) => [...result.values()][0]?.points[0]?.value)).toEqual([30, 60]);
  });

  it('retains credentials, observation time and debug reporting in the owned execution', async () => {
    const messages: string[] = [];
    const credentials = { accessKeyId: 'planner-test-access', secretAccessKey: 'planner-test-secret' };
    const result = await withAwsClientCredentials(credentials, () =>
      withAwsDiscoveryExecution(
        {
          observationTimestamp: 123_000,
          debugLogger: (message) => {
            messages.push(message);
          },
        },
        () =>
          withCloudWatchMetricPlanning(() =>
            planCloudWatchSignals({ ...window(0, 4), queries: [query('metric')] }, async (request) => {
              const resolved = await createCloudWatchClient({ region: request.region }).config.credentials();
              expect(resolved.accessKeyId).toBe('planner-test-access');
              expect(getAwsDiscoveryTimestamp()).toBe(123_000);
              emitAwsRequestTelemetry({ type: 'planner-test' });
              return complete(request);
            }),
          ),
      ),
    );
    expect(result.get('metric')?.status).toBe('Complete');
    expect(messages).toContain('aws: attempt {"type":"planner-test"}');
  });
  it('passes unplanned requests directly to the transport', async () => {
    const request = { ...window(0, 4), queries: [query('original')] };
    const response = complete(request);
    let received: Request | undefined;
    expect(
      await planCloudWatchSignals(request, async (options) => {
        received = options;
        return response;
      }),
    ).toBe(response);
    expect(received).toBe(request);
  });

  it('splits a caller input larger than the admission bound into bounded requests', async () => {
    const sizes: number[] = [];
    const result = await withCloudWatchMetricPlanning(() =>
      planCloudWatchSignals(
        {
          ...window(0, 4),
          queries: Array.from({ length: 8193 }, (_, index) => query(`q${index}`, `Metric${index}`)),
        },
        async (request) => {
          sizes.push(request.queries.length);
          return complete(request);
        },
      ),
    );
    expect(sizes).toEqual([8192, 1]);
    expect(result.size).toBe(8193);
    expect(result.get('q8192')?.status).toBe('Complete');
  });

  it.each([
    'PartialData',
    'Forbidden',
    'InternalError',
    'Missing',
    'Unknown',
  ] as const)('preserves %s evidence and diagnostics for each caller interval', async (status) => {
    const fetch = async (request: Request) => {
      const response = complete(request);
      for (const evidence of response.values()) {
        evidence.status = status;
        evidence.attempts = 3;
        evidence.messages = [{ scope: 'query', code: 'EvidenceDiagnostic', value: 'retained' }];
      }
      return response;
    };
    const results = await withCloudWatchMetricPlanning(() =>
      Promise.all([
        planCloudWatchSignals({ ...window(0, 2), queries: [query('early')] }, fetch),
        planCloudWatchSignals({ ...window(2, 4), queries: [query('late')] }, fetch),
      ]),
    );
    expect(results.map((result) => [...result.values()][0])).toEqual([
      expect.objectContaining({
        status,
        attempts: 3,
        coverage: { expectedPoints: 2, observedPoints: 2 },
        messages: [{ scope: 'query', code: 'EvidenceDiagnostic', value: 'retained' }],
      }),
      expect.objectContaining({
        status,
        attempts: 3,
        coverage: { expectedPoints: 2, observedPoints: 2 },
        messages: [{ scope: 'query', code: 'EvidenceDiagnostic', value: 'retained' }],
      }),
    ]);
  });

  it('cancels the physical execution once every inflight waiter cancels', async () => {
    const firstController = new AbortController();
    const secondController = new AbortController();
    const started = Promise.withResolvers<void>();
    let transportSignal: AbortSignal | undefined;
    const fetch = async (_request: Request): Promise<Map<string, CloudWatchMetricEvidence>> => {
      transportSignal = getAwsExecutionSignal();
      started.resolve();
      return new Promise((_resolve, reject) =>
        transportSignal?.addEventListener('abort', () => reject(transportSignal?.reason), { once: true }),
      );
    };
    await withCloudWatchMetricPlanning(async () => {
      const outcomes = Promise.allSettled([
        withAwsDiscoveryExecution({ signal: firstController.signal }, () =>
          planCloudWatchSignals({ ...window(0, 4), queries: [query('first')] }, fetch),
        ),
        withAwsDiscoveryExecution({ signal: secondController.signal }, () =>
          planCloudWatchSignals({ ...window(0, 4), queries: [query('second')] }, fetch),
        ),
      ]);
      await started.promise;
      firstController.abort(new Error('first cancelled'));
      expect(transportSignal?.aborted).toBe(false);
      secondController.abort(new Error('second cancelled'));
      expect((await outcomes).map((result) => result.status)).toEqual(['rejected', 'rejected']);
      expect(transportSignal?.aborted).toBe(true);
    });
  });

  it('removes cancelled queued metrics and does not fetch a cancelled interval bridging two windows', async () => {
    const bridgeController = new AbortController();
    const occupied = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const requests: Request[] = [];
    const fetch = async (request: Request) => {
      requests.push(request);
      if (requests.length === 2) occupied.resolve();
      await release.promise;
      return complete(request);
    };
    await withCloudWatchMetricPlanning(async () => {
      const blockers = [0, 10].map((minute) =>
        planCloudWatchSignals({ ...window(minute, minute + 4), queries: [query(`block${minute}`)] }, fetch),
      );
      const sides = [20, 22].map((minute) =>
        planCloudWatchSignals({ ...window(minute, minute + 1), queries: [query(`side${minute}`, 'NetworkIn')] }, fetch),
      );
      const bridge = withAwsDiscoveryExecution({ signal: bridgeController.signal }, () =>
        planCloudWatchSignals(
          { ...window(21, 22), queries: [query('bridge', 'NetworkIn'), query('unused', 'NetworkOut')] },
          fetch,
        ),
      );
      const rejected = expect(bridge).rejects.toThrow('remove bridge');
      await occupied.promise;
      bridgeController.abort(new Error('remove bridge'));
      await rejected;
      release.resolve();
      await Promise.all([...blockers, ...sides]);
      expect(
        requests
          .slice(2)
          .map((request) => [
            request.startTime.getTime(),
            request.endTime.getTime(),
            request.queries.map((metric) => metric.metricName),
          ]),
      ).toEqual([
        [1_200_000, 1_260_000, ['NetworkIn']],
        [1_320_000, 1_380_000, ['NetworkIn']],
      ]);
    });
  });
  it('rejects duplicate caller IDs before remapping or starting a transport', async () => {
    let requests = 0;
    await withCloudWatchMetricPlanning(async () => {
      await expect(
        planCloudWatchSignals(
          { ...window(0, 4), queries: [query('duplicate'), query('duplicate', 'NetworkIn')] },
          async (request) => {
            requests += 1;
            return complete(request);
          },
        ),
      ).rejects.toThrow('Duplicate CloudWatch query ID');
    });
    expect(requests).toBe(0);
  });

  it('clears a cancelled pending request and its flush timer', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      let requests = 0;
      await withCloudWatchMetricPlanning(async () => {
        const requested = Promise.withResolvers<void>();
        const result = withAwsDiscoveryExecution({ signal: controller.signal }, () => {
          const result = planCloudWatchSignals({ ...window(0, 4), queries: [query('cancelled')] }, async (request) => {
            requests += 1;
            return complete(request);
          });
          requested.resolve();
          return result;
        });
        const rejected = expect(result).rejects.toThrow('cancel all');
        await requested.promise;
        controller.abort(new Error('cancel all'));
        await rejected;
        expect(vi.getTimerCount()).toBe(0);
        expect(requests).toBe(0);
      });
    } finally {
      vi.useRealTimers();
    }
  });
  it('bounds active combined requests and waits for capacity beyond 8192 retained queries', async () => {
    const release = Promise.withResolvers<void>();
    let active = 0;
    let maximumActive = 0;
    const fetch = async (request: Request) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await release.promise;
      active -= 1;
      return complete(request);
    };
    await withCloudWatchMetricPlanning(async () => {
      const requests = [0, 10, 20, 30, 40].map((minute) =>
        planCloudWatchSignals({ ...window(minute, minute + 4), queries: [query(`m${minute}`)] }, fetch),
      );
      const overflow = expect(
        planCloudWatchSignals(
          { ...window(0, 4), queries: Array.from({ length: 8192 }, (_, index) => query(`overflow${index}`)) },
          fetch,
        ),
      ).resolves.toHaveProperty('size', 8192);
      await new Promise((resolve) => setTimeout(resolve, 15));
      release.resolve();
      await Promise.all(requests);
      await overflow;
      expect(maximumActive).toBe(2);
    });
  });
  it('keeps a shared request alive when its first waiter cancels', async () => {
    const firstController = new AbortController();
    const secondController = new AbortController();
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    let transportSignal: AbortSignal | undefined;
    const fetch = async (request: Request) => {
      transportSignal = getAwsExecutionSignal();
      started.resolve();
      await finish.promise;
      transportSignal?.throwIfAborted();
      return complete(request);
    };
    await withCloudWatchMetricPlanning(async () => {
      const first = withAwsDiscoveryExecution({ signal: firstController.signal }, () =>
        planCloudWatchSignals({ ...window(0, 4), queries: [query('first')] }, fetch),
      );
      const second = withAwsDiscoveryExecution({ signal: secondController.signal }, () =>
        planCloudWatchSignals({ ...window(0, 4), queries: [query('second')] }, fetch),
      );
      const rejected = expect(first).rejects.toThrow('first stopped');
      await started.promise;
      firstController.abort(new Error('first stopped'));
      await rejected;
      expect(transportSignal?.aborted).toBe(false);
      finish.resolve();
      expect((await second).get('second')?.status).toBe('Complete');
    });
  });
  it('joins adjacent cache misses without broadening other metrics and restores each interval', async () => {
    const requests: Request[] = [];
    const fetch = async (request: Request) => {
      requests.push(request);
      return complete(request);
    };
    const results = await withCloudWatchMetricPlanning(() =>
      Promise.all([
        planCloudWatchSignals({ ...window(0, 2), queries: [query('first')] }, fetch),
        planCloudWatchSignals({ ...window(2, 4), queries: [query('second')] }, fetch),
        planCloudWatchSignals({ ...window(0, 2), queries: [query('other', 'NetworkIn')] }, fetch),
      ]),
    );
    expect(
      requests.map((request) => [
        request.startTime.getTime(),
        request.endTime.getTime(),
        request.queries.map((metric) => metric.metricName),
      ]),
    ).toEqual([
      [0, 240_000, ['CPUUtilization']],
      [0, 120_000, ['NetworkIn']],
    ]);
    expect(results[0]?.get('first')).toMatchObject({
      status: 'Complete',
      points: [
        { timestamp: new Date(0).toISOString(), value: 1 },
        { timestamp: new Date(60_000).toISOString(), value: 2 },
      ],
      window: { startTime: new Date(0).toISOString(), endTime: new Date(120_000).toISOString(), periodSeconds: 60 },
      coverage: { expectedPoints: 2, observedPoints: 2 },
    });
    expect(results[1]?.get('second')?.points.map((point) => point.value)).toEqual([3, 4]);
  });
  it('shares one exact observation window across datasets with caller-owned query IDs', async () => {
    const requests: Request[] = [];
    const fetch = async (request: Request) => {
      requests.push(request);
      return complete(request);
    };
    const results = await withCloudWatchMetricPlanning(() =>
      Promise.all([
        planCloudWatchSignals({ ...window(0, 4), queries: [query('same')] }, fetch),
        planCloudWatchSignals({ ...window(0, 4), queries: [query('same', 'NetworkIn')] }, fetch),
      ]),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.queries.map((metric) => metric.metricName)).toEqual(['CPUUtilization', 'NetworkIn']);
    expect(new Set(requests[0]?.queries.map((metric) => metric.id)).size).toBe(2);
    expect(results.map((result) => [...result.keys()])).toEqual([['same'], ['same']]);
  });
});
