import type { GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import type { DescribeEndpointCommand, DescribeEndpointConfigCommand } from '@aws-sdk/client-sagemaker';
import { type AwsDiscoveredResource, awsRules, LiveResourceBag } from '@cloudburn/rules';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCloudWatchClient, createSageMakerClient } from '../../src/providers/aws/client.js';
import { withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import { collectResourceMetrics } from '../../src/providers/aws/resources/resource-metrics.js';
import { hydrateAwsSageMakerEndpointActivity } from '../../src/providers/aws/resources/sagemaker.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCloudWatchClient: vi.fn(),
  createSageMakerClient: vi.fn(),
}));

const resources = (count: number): AwsDiscoveredResource[] =>
  Array.from({ length: count }, (_, index) => ({
    accountId: '123456789012',
    arn: `arn:aws:sagemaker:eu-west-1:123456789012:endpoint/endpoint-${index}`,
    name: `endpoint-${index}`,
    properties: [],
    region: 'eu-west-1',
    resourceType: 'sagemaker:endpoint',
    service: 'sagemaker',
  }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

it('collects 100 single-variant endpoints in one 100-query request with unchanged invocation evidence', async () => {
  const describe = vi.fn(async (command: DescribeEndpointCommand | DescribeEndpointConfigCommand) =>
    describeEndpoint(command),
  );
  vi.mocked(createSageMakerClient).mockReturnValue({ send: describe } as never);
  const metric = vi.fn(async (command: GetMetricDataCommand) => completeMetrics(command));
  vi.mocked(createCloudWatchClient).mockReturnValue({ send: metric } as never);

  const endpoints = await hydrateAwsSageMakerEndpointActivity(resources(100));

  expect(metric.mock.calls.map(([command]) => command.input.MetricDataQueries?.length)).toEqual([100]);
  expect(describe.mock.calls.filter(([command]) => 'EndpointConfigName' in command.input)).toHaveLength(1);
  expect(endpoints).toHaveLength(100);
  expect(endpoints.every((endpoint) => endpoint.totalInvocationsLast14Days === 14)).toBe(true);
});

const describeEndpoint = (command: DescribeEndpointCommand | DescribeEndpointConfigCommand) =>
  'EndpointName' in command.input
    ? {
        EndpointArn: `arn:aws:sagemaker:eu-west-1:123456789012:endpoint/${command.input.EndpointName}`,
        EndpointName: command.input.EndpointName,
        EndpointStatus: 'InService',
        CreationTime: new Date('2026-01-01T00:00:00Z'),
        EndpointConfigName: 'shared-config',
      }
    : { ProductionVariants: [{ VariantName: 'blue' }] };

const completeMetrics = (command: GetMetricDataCommand) => ({
  MetricDataResults: command.input.MetricDataQueries?.map((query) => ({
    Id: query.Id,
    StatusCode: 'Complete',
    Timestamps: Array.from({ length: 14 }, (_, index) => new Date(Date.UTC(2026, 7, 24 + index))),
    Values: Array.from({ length: 14 }, () => 1),
  })),
});

it('bounds pending hydration behind a slow metric request and flushes the last partial batch', async () => {
  const gate = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const describe = vi.fn(async (command: DescribeEndpointCommand | DescribeEndpointConfigCommand) =>
    describeEndpoint(command),
  );
  vi.mocked(createSageMakerClient).mockReturnValue({ send: describe } as never);
  let active = 0;
  let maximum = 0;
  const metric = vi.fn(async (command: GetMetricDataCommand) => {
    active += 1;
    maximum = Math.max(maximum, active);
    started.resolve();
    await gate.promise;
    active -= 1;
    return completeMetrics(command);
  });
  vi.mocked(createCloudWatchClient).mockReturnValue({ send: metric } as never);
  const work = hydrateAwsSageMakerEndpointActivity(resources(1201));
  await started.promise;
  await vi.advanceTimersByTimeAsync(0);
  const described = describe.mock.calls.filter(([command]) => 'EndpointName' in command.input).length;
  expect(described).toBeGreaterThanOrEqual(500);
  expect(described).toBeLessThanOrEqual(510);
  expect(metric).toHaveBeenCalledTimes(1);
  gate.resolve();
  const endpoints = await work;
  expect(metric.mock.calls.map(([command]) => command.input.MetricDataQueries?.length)).toEqual([500, 500, 201]);
  expect(maximum).toBe(1);
  expect(endpoints).toHaveLength(1201);
  expect(endpoints.every((endpoint) => endpoint.totalInvocationsLast14Days === 14)).toBe(true);
});

it('starts endpoint 11 while endpoint 1 is slow and preserves cross-flush multi-variant evidence', async () => {
  const gate = Promise.withResolvers<void>();
  const nextStarted = Promise.withResolvers<void>();
  vi.mocked(createSageMakerClient).mockReturnValue({
    send: vi.fn(async (command: DescribeEndpointCommand | DescribeEndpointConfigCommand) => {
      if ('EndpointName' in command.input && command.input.EndpointName === 'endpoint-0') await gate.promise;
      if ('EndpointName' in command.input && command.input.EndpointName === 'endpoint-10') nextStarted.resolve();
      if ('EndpointConfigName' in command.input)
        return { ProductionVariants: [{ VariantName: 'blue' }, { VariantName: 'green' }, { VariantName: 'canary' }] };
      return describeEndpoint(command);
    }),
  } as never);
  const metric = vi.fn(async (command: GetMetricDataCommand) => completeMetrics(command));
  vi.mocked(createCloudWatchClient).mockReturnValue({ send: metric } as never);
  const work = hydrateAwsSageMakerEndpointActivity(resources(201));
  await nextStarted.promise;
  gate.resolve();
  const endpoints = await work;
  expect(metric.mock.calls.map(([command]) => command.input.MetricDataQueries?.length)).toEqual([500, 103]);
  expect(endpoints.every((endpoint) => endpoint.totalInvocationsLast14Days === 42)).toBe(true);
});

it('flushes on the estimated datapoint budget before reaching the query limit', async () => {
  const metric = vi.fn(async (command: GetMetricDataCommand) => completeMetrics(command));
  vi.mocked(createCloudWatchClient).mockReturnValue({ send: metric } as never);
  const complete = vi.fn();
  await collectResourceMetrics({
    region: 'eu-west-1',
    startTime: new Date('2026-08-24T00:00:00Z'),
    endTime: new Date('2026-09-07T00:00:00Z'),
    produce: async (emit) => {
      for (let index = 0; index < 11; index += 1)
        await emit(
          [
            {
              id: `query${index}`,
              namespace: 'AWS/SageMaker',
              metricName: 'Invocations',
              dimensions: [],
              period: 60,
              stat: 'Sum',
            },
          ],
          complete,
        );
    },
  });
  // Fourteen days at one minute = 20,160 points/query; five queries = 100,800.
  expect(metric.mock.calls.map(([command]) => command.input.MetricDataQueries?.length)).toEqual([5, 5, 1]);
  expect(complete).toHaveBeenCalledTimes(11);
});

it('cancels backpressured producers without starting more metadata or flushing queued metrics', async () => {
  const controller = new AbortController();
  const gate = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const describe = vi.fn(async (command: DescribeEndpointCommand | DescribeEndpointConfigCommand) =>
    describeEndpoint(command),
  );
  vi.mocked(createSageMakerClient).mockReturnValue({ send: describe } as never);
  const metric = vi.fn(async (command: GetMetricDataCommand) => {
    started.resolve();
    await gate.promise;
    return completeMetrics(command);
  });
  vi.mocked(createCloudWatchClient).mockReturnValue({ send: metric } as never);
  const work = withAwsDiscoveryExecution({ signal: controller.signal }, () =>
    hydrateAwsSageMakerEndpointActivity(resources(1201)),
  );
  const rejected = expect(work).rejects.toThrow('cancel metric collection');
  await started.promise;
  controller.abort(new Error('cancel metric collection'));
  await rejected;
  const atCancellation = describe.mock.calls.length;
  gate.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(describe).toHaveBeenCalledTimes(atCancellation);
  expect(metric).toHaveBeenCalledTimes(1);
});

it('preserves corrected baseline evidence and findings when batching mixed complete and unknown series', async () => {
  vi.mocked(createSageMakerClient).mockReturnValue({
    send: vi.fn(async (command: DescribeEndpointCommand | DescribeEndpointConfigCommand) => describeEndpoint(command)),
  } as never);
  const metric = vi.fn(async (command: GetMetricDataCommand) => ({
    MetricDataResults: command.input.MetricDataQueries?.flatMap((query) => {
      const name = query.MetricStat?.Metric?.Dimensions?.find((dimension) => dimension.Name === 'EndpointName')?.Value;
      if (name === 'endpoint-2') return [];
      return [
        {
          Id: query.Id,
          StatusCode: name === 'endpoint-4' ? 'Forbidden' : name === 'endpoint-5' ? 'PartialData' : 'Complete',
          Timestamps:
            name === 'endpoint-3'
              ? []
              : Array.from({ length: 14 }, (_, index) => new Date(Date.UTC(2026, 7, 24 + index))),
          Values:
            name === 'endpoint-3'
              ? []
              : Array.from({ length: 14 }, () => (name === 'endpoint-0' ? 0 : name === 'endpoint-5' ? 500 : 1)),
        },
      ];
    }),
  }));
  vi.mocked(createCloudWatchClient).mockReturnValue({ send: metric } as never);
  const batchedWork = hydrateAwsSageMakerEndpointActivity(resources(100));
  await vi.runAllTimersAsync();
  const batched = await batchedWork;
  const baselineWork = Promise.all(resources(100).map((resource) => hydrateAwsSageMakerEndpointActivity([resource])));
  await vi.runAllTimersAsync();
  const baseline = (await baselineWork).flat().sort((a, b) => a.endpointName.localeCompare(b.endpointName));
  expect(batched).toEqual(baseline);
  const context = {
    catalog: { indexType: 'LOCAL' as const, resources: [], searchRegion: 'eu-west-1' },
    resources: new LiveResourceBag({ 'aws-sagemaker-endpoint-activity': batched }),
  };
  const rule = awsRules.find((entry) => entry.id === 'CLDBRN-AWS-SAGEMAKER-2');
  expect(rule?.evaluateLive?.(context)?.findings).toEqual([
    { resourceId: 'endpoint-0', region: 'eu-west-1', accountId: '123456789012' },
  ]);
  for (const name of ['endpoint-2', 'endpoint-3', 'endpoint-4', 'endpoint-5']) {
    expect(batched.find((endpoint) => endpoint.endpointName === name)?.totalInvocationsLast14Days).toBeNull();
  }
});

it('stops queued metadata when a metric flush fails terminally', async () => {
  const describe = vi.fn(async (command: DescribeEndpointCommand | DescribeEndpointConfigCommand) =>
    describeEndpoint(command),
  );
  vi.mocked(createSageMakerClient).mockReturnValue({ send: describe } as never);
  const metric = vi.fn(async () => {
    throw Object.assign(new Error('synthetic forbidden metrics'), { name: 'AccessDeniedException' });
  });
  vi.mocked(createCloudWatchClient).mockReturnValue({ send: metric } as never);
  await expect(hydrateAwsSageMakerEndpointActivity(resources(1201))).rejects.toThrow('synthetic forbidden metrics');
  const atRejection = describe.mock.calls.length;
  await vi.advanceTimersByTimeAsync(0);
  expect(describe).toHaveBeenCalledTimes(atRejection);
  expect(describe.mock.calls.filter(([command]) => 'EndpointName' in command.input).length).toBeLessThanOrEqual(510);
  expect(metric).toHaveBeenCalledTimes(1);
});
