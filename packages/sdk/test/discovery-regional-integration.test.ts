import { CloudWatchClient, type GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { EC2Client } from '@aws-sdk/client-ec2';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runLiveScan } from '../src/engine/run-live.js';
import { buildAwsDiscoveryCatalog } from '../src/providers/aws/resource-explorer.js';

vi.mock('../src/providers/aws/resource-explorer.js', async (original) => ({
  ...(await original<typeof import('../src/providers/aws/resource-explorer.js')>()),
  buildAwsDiscoveryCatalog: vi.fn(),
}));
const regions = ['eu-west-1', 'us-east-1', 'eu-central-1'];
beforeEach(() => {
  vi.stubEnv('AWS_REGION', 'eu-west-1');
  vi.mocked(buildAwsDiscoveryCatalog).mockResolvedValue({
    indexType: 'AGGREGATOR',
    searchRegion: 'eu-west-1',
    resources: regions.map((region) => ({
      accountId: '123456789012',
      region,
      resourceType: 'ec2:instance',
      service: 'ec2',
      arn: `arn:aws:ec2:${region}:123456789012:instance/i-test`,
    })),
  });
  vi.spyOn(EC2Client.prototype, 'send').mockResolvedValue({
    Reservations: [{ Instances: [{ InstanceId: 'i-test', InstanceType: 'm5.24xlarge' }] }],
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('loads each regional metric series once through real derived dataset orchestration', async () => {
  const send = vi.spyOn(CloudWatchClient.prototype, 'send').mockImplementation(async (command) => ({
    MetricDataResults: (command as GetMetricDataCommand).input.MetricDataQueries?.map((query) => ({
      Id: query.Id,
      StatusCode: 'Complete',
      Values: [0, 0, 0, 0],
      Timestamps: [1, 2, 3, 4].map((day) => new Date(`2026-09-0${day}T00:00:00Z`)),
    })),
  }));
  const result = await runLiveScan({ discovery: { enabledRules: ['CLDBRN-AWS-EC2-5'] } }, { mode: 'all' });
  expect(send).toHaveBeenCalledTimes(3);
  expect(result.providers[0]?.rules[0]?.findings).toHaveLength(3);
});

it('keeps healthy regional findings and evaluation evidence when another region fails', async () => {
  vi.spyOn(EC2Client.prototype, 'send').mockImplementation(async function (this: EC2Client) {
    if ((await this.config.region()) === 'us-east-1') throw new Error('regional outage');
    return { Reservations: [{ Instances: [{ InstanceId: 'i-test', InstanceType: 'm5.24xlarge' }] }] };
  });
  const result = await runLiveScan(
    { discovery: { enabledRules: ['CLDBRN-AWS-EC2-8'] } },
    { mode: 'all' },
    { includeEvaluationResources: true },
  );
  expect(result.providers[0]?.rules[0]?.findings.map((finding) => finding.region).sort()).toEqual([
    'eu-central-1',
    'eu-west-1',
  ]);
  expect(result.evaluations?.resourceSets[0]?.resources).toHaveLength(2);
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ region: 'us-east-1', status: 'error' })]),
  );
});
