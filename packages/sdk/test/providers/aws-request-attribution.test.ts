import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import type { HttpRequest } from '@aws-sdk/types';
import { afterEach, expect, it, vi } from 'vitest';
import { withAwsClientCredentials } from '../../src/providers/aws/credentials.js';
import { withAwsDiscoveryExecution } from '../../src/providers/aws/execution.js';
import { withCloudWatchMetricPlanning } from '../../src/providers/aws/metric-planner.js';
import { withAwsServiceCallBudget } from '../../src/providers/aws/request.js';
import { withAwsDatasetAttribution } from '../../src/providers/aws/request-attribution.js';
import { createMemoryAwsRequestStore } from '../../src/providers/aws/request-store.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';

afterEach(() => vi.restoreAllMocks());

it.each([
  {
    batching: 'shared',
    scoped: true,
    networkPeriod: 3600,
    sizes: [2, 1],
    datasets: [['aws-ec2-instance-network', 'aws-ec2-instance-utilization'], ['aws-ec2-instance-network']],
  },
  {
    batching: 'split by period',
    scoped: true,
    networkPeriod: 60,
    sizes: [1, 1, 1],
    datasets: [['aws-ec2-instance-utilization'], ['aws-ec2-instance-network'], ['aws-ec2-instance-network']],
  },
  {
    batching: 'budget attribution',
    scoped: false,
    networkPeriod: 3600,
    sizes: [2, 1],
    datasets: [['budget-dataset'], ['budget-dataset']],
  },
])('attributes $batching metric attempts to their consumers and narrows query retries', async (scenario) => {
  const probe = new CloudWatchClient({ region: 'eu-west-1' });
  const transport: typeof probe.config.requestHandler = Object.getPrototypeOf(probe.config.requestHandler);
  probe.destroy();
  const requests: string[][] = [];
  let networkResponses = 0;
  vi.spyOn(transport, 'handle').mockImplementation(async (request: HttpRequest) => {
    expect(request.hostname).toBe('monitoring.eu-west-1.amazonaws.com');
    expect(request.headers['x-amz-target']).toContain('GetMetricData');
    const input = JSON.parse(String(request.body));
    requests.push(input.MetricDataQueries.map((query: { Id: string }) => query.Id));
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(
          JSON.stringify({
            MetricDataResults: input.MetricDataQueries.map(
              (query: { Id: string; MetricStat: { Metric: { MetricName: string } } }) => ({
                Id: query.Id,
                StatusCode:
                  query.MetricStat.Metric.MetricName === 'NetworkIn' && networkResponses++ === 0
                    ? 'PartialData'
                    : 'Complete',
                Timestamps: [input.StartTime],
                Values: [10],
              }),
            ),
          }),
        ),
      },
    };
  });
  const messages: string[] = [];
  const collect = (dataset: string, metricName: string) => {
    const run = () =>
      fetchCloudWatchSignals({
        region: 'eu-west-1',
        startTime: new Date('2026-09-01T00:00:00Z'),
        endTime: new Date('2026-09-01T01:00:00Z'),
        queries: [
          {
            id: 'same',
            namespace: 'AWS/EC2',
            metricName,
            dimensions: [],
            period: metricName === 'NetworkIn' ? scenario.networkPeriod : 3600,
            stat: 'Average',
          },
        ],
      });
    return scenario.scoped ? withAwsDatasetAttribution(dataset, run) : run();
  };
  await withAwsClientCredentials({ accessKeyId: 'SYNTHETIC', secretAccessKey: 'synthetic-secret' }, () =>
    withAwsDiscoveryExecution({ debugLogger: (message) => messages.push(message) }, () =>
      withAwsServiceCallBudget(
        () =>
          withCloudWatchMetricPlanning(async () => {
            const controller = new AbortController();
            const cancelled = withAwsDiscoveryExecution({ signal: controller.signal }, () =>
              collect('cancelled-dataset', 'NetworkOut'),
            );
            const rejected = expect(cancelled).rejects.toThrow('cancel queued consumer');
            controller.abort(new Error('cancel queued consumer'));
            return Promise.all([
              rejected,
              collect('aws-ec2-instance-utilization', 'CPUUtilization'),
              collect('aws-ec2-instance-utilization', 'CPUUtilization'),
              collect('aws-ec2-instance-network', 'NetworkIn'),
            ]);
          }),
        { accountId: '111111111111', store: createMemoryAwsRequestStore(), attribution: { dataset: 'budget-dataset' } },
      ),
    ),
  );
  const attempts = messages
    .filter((message) => message.startsWith('aws: attempt '))
    .map((message) => JSON.parse(message.slice(13)));
  expect(requests.map((queryIds) => queryIds.length)).toEqual(scenario.sizes);
  expect(attempts).toHaveLength(scenario.sizes.length);
  expect(attempts.map((attempt) => attempt.attribution.datasets)).toEqual(scenario.datasets);
  if (scenario.batching === 'shared') expect(attempts[0].attribution.dataset).toBeUndefined();
  expect(attempts.at(-1).attribution.dataset).toBe(scenario.datasets.at(-1)?.[0]);
  expect(new Set(attempts.map((attempt) => attempt.attribution.scanId)).size).toBe(1);
  expect(JSON.stringify(attempts)).not.toContain('synthetic-secret');
});
