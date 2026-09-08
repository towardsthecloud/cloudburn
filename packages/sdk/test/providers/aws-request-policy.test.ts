import { expect, it } from 'vitest';
import {
  type AwsQuotaPolicy,
  resolveAwsMetricDataQuota,
  resolveAwsRequestQuota,
} from '../../src/providers/aws/request-policy.js';

const ACCOUNT_ID = '111111111111';

it('preserves the global Route 53 account budget across operations and regions without crossing partitions', () => {
  const zones = resolveAwsRequestQuota('Amazon Route 53', 'ListHostedZones', 'us-east-1', ACCOUNT_ID);
  expect(zones).toEqual({
    scope: { accountId: ACCOUNT_ID, partition: 'aws', service: 'route53', group: 'all-requests' },
    policy: { ratePerSecond: 5, burst: 5, concurrency: 10, retryCapacity: 20 },
  });
  expect(
    resolveAwsRequestQuota('Route53', 'ListResourceRecordSets', 'eu-west-1', ACCOUNT_ID, { callPolicy: 'route53' }),
  ).toEqual(zones);
  expect(resolveAwsRequestQuota('route53', 'ListHealthChecks', 'cn-north-1', ACCOUNT_ID).scope).toMatchObject({
    partition: 'aws-cn',
  });
  expect(resolveAwsRequestQuota('EC2', 'DescribeInstances', 'us-gov-west-1', ACCOUNT_ID).scope).toMatchObject({
    partition: 'aws-us-gov',
    region: 'us-gov-west-1',
  });
});

it('shares log-stream admission across service aliases and resources while separating accounts, regions, and operations', () => {
  const streams = resolveAwsRequestQuota('Amazon CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', ACCOUNT_ID, {
    resource: 'first-log-group',
  });
  expect(streams).toEqual({
    scope: {
      accountId: ACCOUNT_ID,
      partition: 'aws',
      region: 'eu-west-1',
      service: 'logs',
      group: 'DescribeLogStreams',
    },
    policy: { ratePerSecond: 25, burst: 1, concurrency: 10, retryCapacity: 20 },
  });
  expect(resolveAwsRequestQuota('logs', 'DescribeLogStreams', 'eu-west-1', ACCOUNT_ID, { resource: 'second' })).toEqual(
    streams,
  );
  expect(resolveAwsRequestQuota('CloudWatch Logs', 'DescribeLogGroups', 'eu-west-1', ACCOUNT_ID)).toMatchObject({
    scope: { group: 'DescribeLogGroups' },
    policy: { ratePerSecond: 10 },
  });
  expect(resolveAwsRequestQuota('logs', 'DescribeLogStreams', 'us-west-2', ACCOUNT_ID).scope).not.toEqual(
    streams.scope,
  );
  expect(resolveAwsRequestQuota('logs', 'DescribeLogStreams', 'eu-west-1', '222222222222').scope).not.toEqual(
    streams.scope,
  );
});

it.each([
  ['Amazon EC2', 'DescribeInstances', 'ec2', 'DescribeInstances', 10, 10],
  ['Amazon EC2', 'DescribeVolumes', 'ec2', 'DescribeVolumes', 10, 10],
  ['Amazon ECS', 'DescribeServices', 'ecs', 'service-read', 20, 1],
  ['ECS', 'ListServices', 'ecs', 'service-read', 20, 1],
  ['Amazon ECS', 'DescribeContainerInstances', 'ecs', 'cluster-resource-read', 20, 1],
  ['Amazon DynamoDB', 'DescribeTable', 'dynamodb', 'control-plane-read', 100, 1],
  ['DynamoDB', 'ListTables', 'dynamodb', 'control-plane-read', 100, 1],
  ['Elastic Load Balancing', 'DescribeLoadBalancers', 'elasticloadbalancing', 'all-requests', 10, 1],
  ['Elastic Load Balancing v2', 'DescribeTargetHealth', 'elasticloadbalancingv2', 'all-requests', 10, 1],
  ['Elastic Load Balancing v2', 'DescribeTargetGroups', 'elasticloadbalancingv2', 'all-requests', 10, 1],
  ['AWS KMS', 'GetKeyLastUsage', 'kms', 'GetKeyLastUsage', 5, 1],
  ['AWS KMS', 'DescribeKey', 'kms', 'DescribeKey', 100, 1],
  ['AWS KMS', 'ListAliases', 'kms', 'ListAliases', 100, 1],
  ['AWS KMS', 'ListKeyRotations', 'kms', 'ListKeyRotations', 100, 1],
  ['Amazon EMR', 'DescribeCluster', 'emr', 'DescribeCluster', 1, 1],
  ['Amazon EMR', 'ListInstances', 'emr', 'ListInstances', 0.5, 1],
  ['AWS CloudTrail', 'DescribeTrails', 'cloudtrail', 'DescribeTrails', 10, 1],
  ['Amazon CloudWatch', 'ListMetrics', 'cloudwatch', 'ListMetrics', 25, 1],
  ['Amazon CloudWatch', 'GetMetricData', 'cloudwatch', 'GetMetricData', 500, 1],
  ['AWS Lambda', 'ListFunctions', 'lambda', 'control-plane', 15, 1],
  ['AWS Lambda', 'ListVersionsByFunction', 'lambda', 'control-plane', 15, 1],
  ['AWS Resource Explorer', 'ListResources', 'resource-explorer-2', 'non-search', 3, 1],
  ['Amazon SageMaker', 'DescribeEndpoint', 'sagemaker', 'DescribeEndpoint', 5, 1],
  ['Amazon SageMaker', 'DescribeEndpointConfig', 'sagemaker', 'DescribeEndpointConfig', 5, 1],
] as const)('uses the documented request quota group for %s %s across resources', (label, operation, service, group, ratePerSecond, burst) => {
  expect(resolveAwsRequestQuota(label, operation, 'eu-west-1', ACCOUNT_ID, { resource: 'a-resource' })).toEqual({
    scope: { accountId: ACCOUNT_ID, partition: 'aws', region: 'eu-west-1', service, group },
    policy: { ratePerSecond, burst, concurrency: 10, retryCapacity: 20 },
  });
});

it('applies overrides by canonical quota group without changing unrelated policies', () => {
  const overrides = {
    'logs:DescribeLogStreams': { ratePerSecond: 2, burst: 2, concurrency: 2, retryCapacity: 0 },
    'ecs:service-read': { ratePerSecond: 4 },
  };
  expect(
    resolveAwsRequestQuota('CloudWatch Logs', 'DescribeLogStreams', 'eu-west-1', ACCOUNT_ID, { overrides }).policy,
  ).toEqual({
    ratePerSecond: 2,
    burst: 2,
    concurrency: 2,
    retryCapacity: 0,
  });
  expect(
    resolveAwsRequestQuota('ECS', 'ListServices', 'eu-west-1', ACCOUNT_ID, { overrides }).policy.ratePerSecond,
  ).toBe(4);
  expect(
    resolveAwsRequestQuota('ECS', 'DescribeServices', 'eu-west-1', ACCOUNT_ID, { overrides }).policy.ratePerSecond,
  ).toBe(4);
  expect(resolveAwsRequestQuota('logs', 'DescribeLogStreams', 'eu-west-1', ACCOUNT_ID).policy.ratePerSecond).toBe(25);
  expect(
    resolveAwsRequestQuota('logs', 'DescribeLogGroups', 'eu-west-1', ACCOUNT_ID, { overrides }).policy.ratePerSecond,
  ).toBe(10);
});

it.each([
  ['EC2', 'DescribeInstances', 'ec2:DescribeInstances', 5, 5],
  ['Route53', 'ListHostedZones', 'route53:all-requests', 2, 2],
  ['S3', 'GetBucketLifecycleConfiguration', 's3:GetBucketLifecycleConfiguration', 3, 3],
  ['S3', 'ListBucketIntelligentTieringConfigurations', 's3:ListBucketIntelligentTieringConfigurations', 0.25, 1],
  ['Uncataloged Service', 'ReadResource', 'uncataloged-service:ReadResource', 0.5, 1],
  ['EC2', 'DescribeInstances', 'ec2:DescribeInstances', 20, 10],
] as const)('keeps the inherited burst valid for a rate-only override of %s %s', (service, operation, key, ratePerSecond, burst) => {
  expect(
    resolveAwsRequestQuota(service, operation, 'eu-west-1', ACCOUNT_ID, {
      overrides: { [key]: { ratePerSecond } },
    }).policy,
  ).toEqual({ ratePerSecond, burst, concurrency: 10, retryCapacity: 20 });
});

it.each([
  { ratePerSecond: 5, burst: 6 },
  { ratePerSecond: 0.5, burst: 2 },
  { ratePerSecond: 5, burst: 0.5 },
  { ratePerSecond: 5, burst: Number.NaN },
  { ratePerSecond: 5, burst: Number.POSITIVE_INFINITY },
])('rejects an explicitly invalid burst instead of clamping it: %j', (policy) => {
  expect(() =>
    resolveAwsRequestQuota('EC2', 'DescribeInstances', 'eu-west-1', ACCOUNT_ID, {
      overrides: { 'ec2:DescribeInstances': policy },
    }),
  ).toThrow(RangeError);
});

it('returns only admission fields from externally supplied overrides', () => {
  const overrides = {
    'logs:DescribeLogStreams': { ratePerSecond: 2, accessKeyId: 'never-copy-override-content' },
  };
  expect(resolveAwsRequestQuota('logs', 'DescribeLogStreams', 'eu-west-1', ACCOUNT_ID, { overrides }).policy).toEqual({
    ratePerSecond: 2,
    burst: 1,
    concurrency: 10,
    retryCapacity: 20,
  });
});

it('shares S3 operation limits across buckets while allowing independent local overrides', () => {
  const lifecycle = resolveAwsRequestQuota('Amazon S3', 'GetBucketLifecycleConfiguration', 'eu-west-1', ACCOUNT_ID, {
    resource: 'first-bucket',
    overrides: { 's3:GetBucketLifecycleConfiguration': { ratePerSecond: 4, burst: 4, retryCapacity: 0 } },
  });
  expect(lifecycle).toMatchObject({
    scope: { service: 's3', group: 'GetBucketLifecycleConfiguration' },
    policy: { ratePerSecond: 4, burst: 4, retryCapacity: 0 },
  });
  expect(
    resolveAwsRequestQuota('S3', 'GetBucketLifecycleConfiguration', 'eu-west-1', ACCOUNT_ID, {
      resource: 'second-bucket',
    }).scope,
  ).toEqual(lifecycle.scope);
  expect(
    resolveAwsRequestQuota('S3', 'ListBucketIntelligentTieringConfigurations', 'eu-west-1', ACCOUNT_ID, {
      overrides: { 's3:GetBucketLifecycleConfiguration': { ratePerSecond: 4, burst: 4 } },
    }),
  ).toMatchObject({
    scope: { group: 'ListBucketIntelligentTieringConfigurations' },
    policy: { ratePerSecond: 10, burst: 10 },
  });
});

it.each([
  { ratePerSecond: 0 },
  { ratePerSecond: Number.POSITIVE_INFINITY },
  { ratePerSecond: Number.NaN },
  { burst: 0 },
  { burst: 0.5 },
  { burst: 26 },
  { burst: Number.POSITIVE_INFINITY },
  { concurrency: 0 },
  { concurrency: 1.5 },
  { concurrency: Number.NaN },
  { retryCapacity: -1 },
  { retryCapacity: Number.POSITIVE_INFINITY },
] satisfies Partial<AwsQuotaPolicy>[])('rejects invalid admission overrides %j', (policy) => {
  expect(() =>
    resolveAwsRequestQuota('logs', 'DescribeLogStreams', 'eu-west-1', ACCOUNT_ID, {
      overrides: { 'logs:DescribeLogStreams': policy },
    }),
  ).toThrow(RangeError);
});

it('reserves 7,000 datapoints for 500 daily series over fourteen complete days', () => {
  const now = Date.parse('2026-09-08T12:00:00Z');
  const request = {
    StartTime: new Date('2026-08-25T00:00:00Z'),
    EndTime: new Date('2026-09-08T00:00:00Z'),
    MetricDataQueries: Array.from({ length: 500 }, (_, index) => ({
      Id: `cpu${index}`,
      MetricStat: {
        Metric: { Namespace: 'AWS/EC2', MetricName: 'CPUUtilization' },
        Period: 86_400,
        Stat: 'Average',
      },
    })),
  };
  expect(resolveAwsMetricDataQuota(request, 'eu-west-1', ACCOUNT_ID, now).cost).toBe(7_000);
});

it('charges each metric page to the datapoint bucket selected by the original StartTime', () => {
  const now = Date.parse('2026-09-07T12:00:00Z');
  const input = {
    StartTime: new Date('2026-09-07T09:00:00Z'),
    EndTime: new Date('2026-09-07T12:00:00Z'),
    MetricDataQueries: [{ Id: 'signal', MetricStat: { Period: 60 }, ReturnData: true }],
    SecretAccessKey: 'never-copy-request-content',
  };
  expect(resolveAwsMetricDataQuota(input, 'eu-west-1', ACCOUNT_ID, now)).toEqual({
    scope: {
      accountId: ACCOUNT_ID,
      partition: 'aws',
      region: 'eu-west-1',
      service: 'cloudwatch',
      group: 'GetMetricData:recent-datapoints',
    },
    policy: { ratePerSecond: 180_000, burst: 180_000, concurrency: 10, retryCapacity: 20 },
    cost: 180,
  });
  const older = { ...input, StartTime: new Date('2026-09-07T08:59:59.999Z'), MaxDatapoints: 50_000 };
  const expected = {
    scope: { group: 'GetMetricData:older-datapoints' },
    policy: { ratePerSecond: 396_000, burst: 396_000 },
    cost: 181,
  };
  expect(resolveAwsMetricDataQuota(older, 'eu-west-1', ACCOUNT_ID, now)).toMatchObject(expected);
  expect(resolveAwsMetricDataQuota({ ...older, NextToken: 'next-page' }, 'eu-west-1', ACCOUNT_ID, now)).toMatchObject(
    expected,
  );
});

it.each([
  ['2026-09-08T11:05:00Z', 6],
  ['2026-09-08T11:05:00.001Z', 8],
  ['2026-09-08T11:00:00.001Z', 2],
])('counts each mixed-period series through the exclusive end %s', (end, expected) => {
  const request = {
    StartTime: new Date('2026-09-08T11:00:00Z'),
    EndTime: new Date(end),
    MetricDataQueries: [
      { Id: 'minute', MetricStat: { Period: 60 } },
      { Id: 'five_minutes', MetricStat: { Period: 300 }, ReturnData: false },
    ],
  };
  expect(resolveAwsMetricDataQuota(request, 'eu-west-1', ACCOUNT_ID, Date.parse('2026-09-08T12:00:00Z')).cost).toBe(
    expected,
  );
});

it.each([
  [5, 61],
  [10, 31],
  [20, 16],
  [30, 11],
])('includes the rounded leading high-resolution period of %i seconds', (period, expected) => {
  const request = {
    StartTime: new Date('2026-09-08T15:02:17Z'),
    EndTime: new Date('2026-09-08T15:07:17Z'),
    MetricDataQueries: [{ Id: 'high_resolution', MetricStat: { Period: period } }],
  };
  expect(resolveAwsMetricDataQuota(request, 'eu-west-1', ACCOUNT_ID, Date.parse('2026-09-08T16:00:00Z')).cost).toBe(
    expected,
  );
});

it.each([
  [0, 1],
  [15, 3],
  [63, 38],
])('covers AWS timestamp rounding for a start %i days old', (ageDays, expected) => {
  const start = Date.parse('2026-07-01T12:37:59.999Z');
  const request = {
    StartTime: new Date(start),
    EndTime: new Date('2026-07-01T12:38:00Z'),
    MetricDataQueries: [{ Id: 'signal', MetricStat: { Period: 60 } }],
  };
  expect(resolveAwsMetricDataQuota(request, 'eu-west-1', ACCOUNT_ID, start + ageDays * 86_400_000).cost).toBe(expected);
});

it('includes partial leading and trailing daily periods', () => {
  const request = {
    StartTime: new Date('2026-08-25T00:00:00.001Z'),
    EndTime: new Date('2026-09-08T00:00:00.001Z'),
    MetricDataQueries: [{ Id: 'daily', MetricStat: { Period: 86_400 } }],
  };
  expect(resolveAwsMetricDataQuota(request, 'eu-west-1', ACCOUNT_ID, Date.parse('2026-09-08T12:00:00Z')).cost).toBe(15);
});

it.each([
  undefined,
  null,
  [],
  [null],
  [{}],
  [{ MetricStat: null }],
  [{ MetricStat: {} }],
  [{ MetricStat: { Period: 0 } }],
  [{ MetricStat: { Period: 2 } }],
  [{ MetricStat: { Period: 1.5 } }],
  [{ MetricStat: { Period: '60' } }],
  [{ MetricStat: { Period: Number.POSITIVE_INFINITY } }],
  [{ MetricStat: { Period: 60 }, Period: 300 }],
  [{ Expression: 'SEARCH(...)' }],
  [{ MetricStat: { Period: 60 } }, { Expression: 'METRICS()' }],
  [{ MetricStat: { Period: 60 }, Expression: 'signal * 2' }],
])('uses the page bound for uninspectable metric queries: %j', (MetricDataQueries) => {
  const request = {
    StartTime: new Date('2026-09-08T11:00:00Z'),
    EndTime: new Date('2026-09-08T12:00:00Z'),
    MetricDataQueries,
    MaxDatapoints: 50_000,
  };
  expect(resolveAwsMetricDataQuota(request, 'eu-west-1', ACCOUNT_ID, Date.parse('2026-09-08T12:00:00Z')).cost).toBe(
    50_000,
  );
});

it.each([
  [undefined, new Date('2026-09-08T12:00:00Z')],
  [new Date('2026-09-08T11:00:00Z'), undefined],
  [new Date('invalid'), new Date('2026-09-08T12:00:00Z')],
  [new Date('2026-09-08T11:00:00Z'), new Date('invalid')],
  [new Date('2026-09-08T11:00:00Z'), new Date('2026-09-08T11:00:00Z')],
  [new Date('2026-09-08T12:00:00Z'), new Date('2026-09-08T11:00:00Z')],
])('uses the page bound for an uninspectable time window %s to %s', (StartTime, EndTime) => {
  const request = { StartTime, EndTime, MetricDataQueries: [{ Id: 'signal', MetricStat: { Period: 60 } }] };
  expect(resolveAwsMetricDataQuota(request, 'eu-west-1', ACCOUNT_ID, Date.parse('2026-09-08T12:00:00Z')).cost).toBe(
    100_800,
  );
});

it.each([
  [1_000, 1_000],
  [8_000, 7_000],
  [200_000, 7_000],
  [undefined, 7_000],
  [0, 7_000],
])('caps each page and retry independently when MaxDatapoints is %s', (MaxDatapoints, expected) => {
  const request = {
    StartTime: new Date('2026-08-25T00:00:00Z'),
    EndTime: new Date('2026-09-08T00:00:00Z'),
    MetricDataQueries: Array.from({ length: 500 }, (_, index) => ({
      Id: `daily${index}`,
      MetricStat: { Period: 86_400 },
    })),
    MaxDatapoints,
  };
  const now = Date.parse('2026-09-08T12:00:00Z');
  for (const input of [request, { ...request, NextToken: 'next-page' }, request]) {
    expect(resolveAwsMetricDataQuota(input, 'eu-west-1', ACCOUNT_ID, now).cost).toBe(expected);
  }
});

it('caps dense metric queries at the API maximum', () => {
  const request = {
    StartTime: new Date('2026-08-25T00:00:00Z'),
    EndTime: new Date('2026-09-08T00:00:00Z'),
    MetricDataQueries: Array.from({ length: 500 }, (_, index) => ({
      Id: `minute${index}`,
      MetricStat: { Period: 60 },
    })),
  };
  expect(resolveAwsMetricDataQuota(request, 'eu-west-1', ACCOUNT_ID, Date.parse('2026-09-08T12:00:00Z')).cost).toBe(
    100_800,
  );
});

it.each([
  undefined,
  null,
  0,
  -1,
  0.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_VALUE,
  '100',
])('reserves a full metric page when MaxDatapoints is missing or invalid: %s', (MaxDatapoints) => {
  expect(
    resolveAwsMetricDataQuota({ StartTime: new Date('invalid'), MaxDatapoints }, 'eu-west-1', ACCOUNT_ID, 0),
  ).toMatchObject({
    scope: { group: 'GetMetricData:recent-datapoints' },
    cost: 100_800,
  });
});

it('caps the metric page reservation at the API maximum and applies independent datapoint overrides', () => {
  const request = { StartTime: new Date('2026-09-07T12:00:00Z'), MaxDatapoints: 200_000 };
  expect(
    resolveAwsMetricDataQuota(request, 'us-gov-west-1', ACCOUNT_ID, Date.parse('2026-09-07T12:00:00Z'), {
      'cloudwatch:GetMetricData:recent-datapoints': { ratePerSecond: 150_000, burst: 150_000 },
    }),
  ).toEqual({
    scope: {
      accountId: ACCOUNT_ID,
      partition: 'aws-us-gov',
      region: 'us-gov-west-1',
      service: 'cloudwatch',
      group: 'GetMetricData:recent-datapoints',
    },
    policy: { ratePerSecond: 150_000, burst: 150_000, concurrency: 10, retryCapacity: 20 },
    cost: 100_800,
  });
});

it('uses bounded local fallback limits and keeps global service quotas independent of the selected scan region', () => {
  const fallback = resolveAwsRequestQuota('Uncataloged Service', 'ReadResource', 'eu-west-1', ACCOUNT_ID);
  expect(fallback).toEqual({
    scope: {
      accountId: ACCOUNT_ID,
      partition: 'aws',
      region: 'eu-west-1',
      service: 'uncataloged-service',
      group: 'ReadResource',
    },
    policy: { ratePerSecond: 10, burst: 10, concurrency: 10, retryCapacity: 20 },
  });
  expect(
    resolveAwsRequestQuota('Uncataloged Service', 'ReadResource', 'eu-west-1', ACCOUNT_ID, { resource: 'resource-a' })
      .scope,
  ).toMatchObject({ resource: 'resource-a' });
  expect(
    resolveAwsRequestQuota('Amazon S3', 'GetBucketLifecycleConfiguration', 'eu-west-1', ACCOUNT_ID, {
      resource: 'bucket-a',
    }).scope,
  ).not.toHaveProperty('resource');
  for (const service of ['Amazon CloudFront', 'AWS Budgets', 'AWS Cost Explorer', 'AWS Cost Optimization Hub']) {
    expect(resolveAwsRequestQuota(service, 'ReadResource', 'us-east-1', ACCOUNT_ID).scope).toEqual(
      resolveAwsRequestQuota(service, 'ReadResource', 'eu-west-1', ACCOUNT_ID).scope,
    );
  }
  expect(resolveAwsRequestQuota('AWS Secrets Manager', 'ListSecrets', 'eu-west-1', ACCOUNT_ID).scope.service).toBe(
    'secretsmanager',
  );
  expect(
    resolveAwsRequestQuota('AWS Application Auto Scaling', 'DescribeScalableTargets', 'eu-west-1', ACCOUNT_ID).scope
      .service,
  ).toBe('application-autoscaling');
});
