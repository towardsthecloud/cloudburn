import type { GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { awsRules, LiveResourceBag } from '@cloudburn/rules';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudWatchClient, createLambdaClient, createSageMakerClient } from '../../src/providers/aws/client.js';
import { hydrateAwsLambdaFunctionMetrics } from '../../src/providers/aws/resources/lambda.js';
import { hydrateAwsSageMakerEndpointActivity } from '../../src/providers/aws/resources/sagemaker.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCloudWatchClient: vi.fn(),
  createLambdaClient: vi.fn(),
  createSageMakerClient: vi.fn(),
}));

const resource = (service: string, resourceType: string, arn: string) => ({
  accountId: '111111111111',
  arn,
  properties: [],
  region: 'eu-west-1',
  resourceType,
  service,
});

describe('CloudWatch evidence through hydration and evaluation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('bounds Lambda metric request volume for 1000 functions', async () => {
    const send = vi.fn(async (command: GetMetricDataCommand) => ({
      MetricDataResults: command.input.MetricDataQueries?.map((query) => ({ Id: query.Id, StatusCode: 'Complete' })),
    }));
    vi.mocked(createCloudWatchClient).mockReturnValue({ send } as never);
    await hydrateAwsLambdaFunctionMetrics([], {
      loadDataset: vi.fn().mockResolvedValue(
        Array.from({ length: 1000 }, (_, index) => ({
          accountId: '111111111111',
          region: 'eu-west-1',
          functionName: `orders${index}`,
        })),
      ),
      listResourcesByFilter: vi.fn(),
    });
    expect(send).toHaveBeenCalledTimes(8);
  });

  it.each([
    ['2026-09-07T12:00:00Z', '2026-08-31T12:00:00Z', '2026-09-07T12:00:00Z'],
    ['2026-09-08T12:00:00Z', '2026-09-01T12:00:00Z', '2026-09-08T12:00:00Z'],
    ['2026-09-09T12:00:00Z', '2026-09-02T12:00:00Z', '2026-09-09T12:00:00Z'],
    ['2026-09-10T12:00:00Z', '2026-09-03T12:00:00Z', '2026-09-10T12:00:00Z'],
    ['2026-09-11T12:00:00Z', '2026-09-04T12:00:00Z', '2026-09-11T12:00:00Z'],
    ['2026-09-12T12:00:00Z', '2026-09-05T12:00:00Z', '2026-09-12T12:00:00Z'],
    ['2026-09-13T12:00:00Z', '2026-09-06T12:00:00Z', '2026-09-13T12:00:00Z'],
    ['2026-09-07T00:00:00Z', '2026-08-31T00:00:00Z', '2026-09-07T00:00:00Z'],
    ['2026-09-06T23:59:59Z', '2026-08-30T23:59:00Z', '2026-09-06T23:59:00Z'],
    ['2026-09-07T00:00:01Z', '2026-08-31T00:00:00Z', '2026-09-07T00:00:00Z'],
  ])('keeps Lambda rolling windows current at %s', async (now, start, end) => {
    vi.setSystemTime(new Date(now));
    const send = vi.fn(async (_command: GetMetricDataCommand) => ({ MetricDataResults: [] }));
    vi.mocked(createCloudWatchClient).mockReturnValue({ send } as never);
    await hydrateAwsLambdaFunctionMetrics([], {
      loadDataset: vi
        .fn()
        .mockResolvedValue([{ accountId: '111111111111', region: 'eu-west-1', functionName: 'orders' }]),
      listResourcesByFilter: vi.fn(),
    });
    expect(send.mock.calls[0]?.[0].input.StartTime).toEqual(new Date(start));
    expect(send.mock.calls[0]?.[0].input.EndTime).toEqual(new Date(end));
    expect(send.mock.calls[0]?.[0].input.MetricDataQueries?.every((query) => query.MetricStat?.Period === 3600)).toBe(
      true,
    );
  });

  it.each([
    'Missing',
    'Forbidden',
    'InternalError',
    'PartialData',
    'Complete',
  ])('requires complete Lambda error evidence before reporting zero (%s)', async (status) => {
    vi.mocked(createCloudWatchClient).mockReturnValue({
      send: vi.fn(async (command: GetMetricDataCommand) => ({
        MetricDataResults: command.input.MetricDataQueries?.flatMap((query) =>
          query.Id === 'invocations0'
            ? [{ Id: query.Id, StatusCode: 'Complete', Timestamps: [new Date('2026-09-06T12:00:00Z')], Values: [100] }]
            : query.Id === 'errors0' && status !== 'Missing'
              ? [{ Id: query.Id, StatusCode: status }]
              : [],
        ),
      })),
    } as never);
    const metrics = await hydrateAwsLambdaFunctionMetrics([], {
      loadDataset: vi
        .fn()
        .mockResolvedValue([{ accountId: '111111111111', region: 'eu-west-1', functionName: 'orders' }]),
      listResourcesByFilter: vi.fn(),
    });
    expect(metrics[0]?.totalInvocationsLast7Days).toBe(100);
    expect(metrics[0]?.totalErrorsLast7Days).toBe(status === 'Complete' ? 0 : null);
    expect(metrics[0]?.averageDurationMsLast7Days).toBeNull();
  });

  it('weights Lambda duration by the actual sample counts instead of averaging bucket averages', async () => {
    const functionArn = 'arn:aws:lambda:eu-west-1:111111111111:function:orders';
    vi.mocked(createLambdaClient).mockReturnValue({
      send: vi.fn(async () => ({
        Functions: [{ FunctionArn: functionArn, FunctionName: 'orders' }],
      })),
    } as never);
    vi.mocked(createCloudWatchClient).mockReturnValue({
      send: vi.fn(async (command: GetMetricDataCommand) => ({
        MetricDataResults: command.input.MetricDataQueries?.map((query) => ({
          Id: query.Id,
          StatusCode: 'Complete',
          Timestamps: [new Date('2026-09-06T12:00:00Z'), new Date('2026-09-06T13:00:00Z')],
          Values:
            query.MetricStat?.Metric?.MetricName === 'Duration'
              ? query.MetricStat.Stat === 'SampleCount'
                ? [9, 1]
                : query.MetricStat.Stat === 'Sum'
                  ? [900, 1000]
                  : [100, 1000]
              : query.MetricStat?.Metric?.MetricName === 'Invocations'
                ? [9, 1]
                : [0, 0],
        })),
      })),
    } as never);
    const metrics = await hydrateAwsLambdaFunctionMetrics([resource('lambda', 'lambda:function', functionArn)]);
    expect(metrics[0]?.averageDurationMsLast7Days).toBe(190);
  });

  it('never reports an idle SageMaker endpoint from PartialData containing 500 invocations', async () => {
    const endpointArn = 'arn:aws:sagemaker:eu-west-1:111111111111:endpoint/orders';
    vi.mocked(createSageMakerClient).mockReturnValue({
      send: vi.fn(async (command) =>
        command.input.EndpointName
          ? {
              EndpointArn: endpointArn,
              EndpointName: 'orders',
              EndpointConfigName: 'orders-config',
              EndpointStatus: 'InService',
              CreationTime: new Date('2026-01-01T00:00:00Z'),
            }
          : { ProductionVariants: [{ VariantName: 'AllTraffic' }] },
      ),
    } as never);
    vi.mocked(createCloudWatchClient).mockReturnValue({
      send: vi.fn(async () => ({
        MetricDataResults: [
          {
            Id: 'endpoint0variant0',
            StatusCode: 'PartialData',
            Timestamps: [new Date('2026-09-06T00:00:00Z')],
            Values: [500],
          },
        ],
      })),
    } as never);

    const endpoints = await hydrateAwsSageMakerEndpointActivity([
      resource('sagemaker', 'sagemaker:endpoint', endpointArn),
    ]);
    const finding = awsRules
      .find((rule) => rule.id === 'CLDBRN-AWS-SAGEMAKER-2')
      ?.evaluateLive?.({
        catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-west-1' },
        resources: new LiveResourceBag({ 'aws-sagemaker-endpoint-activity': endpoints }),
      });
    expect(finding).toBeNull();
    expect(endpoints[0]?.totalInvocationsLast14Days).toBeNull();
  });

  it('requests the actual last seven days for Lambda instead of a shifted epoch week', async () => {
    const functionArn = 'arn:aws:lambda:eu-west-1:111111111111:function:orders';
    vi.mocked(createLambdaClient).mockReturnValue({
      send: vi.fn(async () => ({
        Functions: [{ FunctionArn: functionArn, FunctionName: 'orders' }],
      })),
    } as never);
    const send = vi.fn(async (_command: GetMetricDataCommand) => ({ MetricDataResults: [] }));
    vi.mocked(createCloudWatchClient).mockReturnValue({ send } as never);

    await hydrateAwsLambdaFunctionMetrics([resource('lambda', 'lambda:function', functionArn)]);
    expect(send.mock.calls[0]?.[0].input.StartTime).toEqual(new Date('2026-08-31T12:00:00.000Z'));
    expect(send.mock.calls[0]?.[0].input.EndTime).toEqual(new Date('2026-09-07T12:00:00.000Z'));
  });
});
