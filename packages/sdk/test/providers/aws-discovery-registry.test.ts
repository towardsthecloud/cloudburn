import type { AwsEc2LoadBalancerRequestActivity } from '@cloudburn/rules';
import { describe, expect, it } from 'vitest';
import {
  assessAwsDiscoveryDatasetEvidence,
  getAwsDiscoveryDatasetDefinition,
  resolveAwsDiscoveryDatasetDependencies,
  resolveAwsDiscoveryObservationWindow,
  validateAwsDiscoveryDatasetDependencies,
} from '../../src/providers/aws/discovery-registry.js';

describe('AWS discovery registry', () => {
  it.each<{
    label: string;
    activity?: Pick<AwsEc2LoadBalancerRequestActivity, 'requestActivityStatus' | 'averageRequestsPerDayLast14Days'>;
    assessed: boolean;
  }>([
    {
      label: 'complete zero requests',
      activity: { requestActivityStatus: 'complete', averageRequestsPerDayLast14Days: 0 },
      assessed: true,
    },
    { label: 'legacy complete zero requests', activity: { averageRequestsPerDayLast14Days: 0 }, assessed: true },
    {
      label: 'unsupported request semantics',
      activity: { requestActivityStatus: 'unsupported', averageRequestsPerDayLast14Days: 0 },
      assessed: false,
    },
    { label: 'missing activity', assessed: false },
    {
      label: 'non-finite requests',
      activity: { requestActivityStatus: 'complete', averageRequestsPerDayLast14Days: Number.POSITIVE_INFINITY },
      assessed: false,
    },
  ])('retains dataset-level ELB coverage for $label', ({ activity, assessed }) => {
    const arn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/test/1';
    const identity = { accountId: '123456789012', region: 'us-east-1' };
    expect(
      assessAwsDiscoveryDatasetEvidence(
        'aws-ec2-load-balancer-request-activity',
        {
          'aws-ec2-load-balancers': [
            {
              loadBalancerArn: arn,
              loadBalancerName: 'test',
              loadBalancerType: 'application',
              attachedTargetGroupArns: [],
              instanceCount: 0,
              ...identity,
            },
          ],
          'aws-ec2-load-balancer-request-activity': activity
            ? [{ loadBalancerArn: arn, ...identity, ...activity }]
            : [],
        },
        { resources: [], searchRegion: 'us-east-1', indexType: 'LOCAL' },
      ),
    ).toEqual({
      assessed: assessed ? [{ resourceId: arn, ...identity }] : [],
      unknown: assessed ? [] : [{ resourceId: arn, ...identity }],
    });
  });
  it('keeps incomplete ELB request evidence unknown even when cleanup can assess the load balancer', () => {
    const arn = 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/test/1';
    expect(
      assessAwsDiscoveryDatasetEvidence(
        'aws-ec2-load-balancer-request-activity',
        {
          'aws-ec2-load-balancers': [
            {
              loadBalancerArn: arn,
              loadBalancerName: 'test',
              loadBalancerType: 'application',
              attachedTargetGroupArns: [],
              instanceCount: 0,
              accountId: '123456789012',
              region: 'us-east-1',
            },
          ],
          'aws-ec2-load-balancer-request-activity': [
            {
              loadBalancerArn: arn,
              requestActivityStatus: 'unknown',
              averageRequestsPerDayLast14Days: null,
              accountId: '123456789012',
              region: 'us-east-1',
            },
          ],
        },
        { resources: [], searchRegion: 'us-east-1', indexType: 'LOCAL' },
      ),
    ).toEqual({
      assessed: [],
      unknown: [{ resourceId: arn, accountId: '123456789012', region: 'us-east-1' }],
    });
  });
  it('declares the tagging loader query so its catalog evidence can be resolved before cached dataset reuse', async () => {
    const definition = getAwsDiscoveryDatasetDefinition('aws-resource-explorer-untagged-resources');
    if (!definition) throw new Error('Missing tagging dataset');
    const candidate = {
      arn: 'arn:aws:ec2:us-east-1:123456789012:volume/vol-1',
      accountId: '123456789012',
      region: 'us-east-1',
      service: 'ec2',
      resourceType: 'ec2:volume',
      properties: [],
    };
    await expect(
      definition.load([], {
        loadDataset: async () => [],
        resolveAccountId: async () => '123456789012',
        listResourcesByFilter: async (filterString, options) => {
          expect(definition.catalogQueries).toContainEqual({ filterString, ...options });
          return [candidate];
        },
      }),
    ).resolves.toEqual([
      {
        arn: candidate.arn,
        accountId: candidate.accountId,
        region: candidate.region,
        service: candidate.service,
        resourceType: candidate.resourceType,
      },
    ]);
  });
  it('does not mistake a terminal path segment for a complete resource name', () => {
    // Log groups have no coverage callback, so catalog reconciliation decides their unknown identities.
    expect(
      assessAwsDiscoveryDatasetEvidence(
        'aws-cloudwatch-log-groups',
        {
          'aws-cloudwatch-log-groups': [
            {
              logGroupName: 'images',
              logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:images',
              accountId: '123456789012',
              region: 'us-east-1',
            },
          ],
        },
        {
          resources: [
            {
              arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/team/images',
              accountId: '123456789012',
              region: 'us-east-1',
              service: 'logs',
              resourceType: 'logs:log-group',
              properties: [],
            },
          ],
          searchRegion: 'us-east-1',
          indexType: 'LOCAL',
        },
      ).unknown,
    ).toMatchObject([{ resourceId: 'arn:aws:logs:us-east-1:123456789012:log-group:/team/images' }]);
  });
  it('does not use another account or region to satisfy a missing inventory identity', () => {
    const unknown = assessAwsDiscoveryDatasetEvidence(
      'aws-ebs-volumes',
      {
        'aws-ebs-volumes': [
          { volumeId: 'vol-1', volumeType: 'gp3', sizeGiB: 8, accountId: '222222222222', region: 'us-east-1' },
          { volumeId: 'vol-1', volumeType: 'gp3', sizeGiB: 8, accountId: '123456789012', region: 'eu-west-1' },
        ],
      },
      {
        resources: [
          {
            arn: 'arn:aws:ec2:us-east-1:123456789012:volume/vol-1',
            accountId: '123456789012',
            region: 'us-east-1',
            service: 'ec2',
            resourceType: 'ec2:volume',
            properties: [],
          },
        ],
        searchRegion: 'us-east-1',
        indexType: 'LOCAL',
      },
    ).unknown;
    expect(unknown).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceType: 'ec2:volume',
        resourceId: 'arn:aws:ec2:us-east-1:123456789012:volume/vol-1',
      },
    ]);
  });
  it('keeps enumeration seed coverage unknown when normalized children cannot prove it complete', () => {
    expect(
      assessAwsDiscoveryDatasetEvidence(
        'aws-route53-records',
        {
          'aws-route53-records': [
            {
              recordId: 'Z1:A:example.com',
              hostedZoneId: 'Z1',
              recordName: 'example.com',
              recordType: 'A',
              isAlias: false,
              region: 'global',
              accountId: '123456789012',
            },
          ],
        },
        {
          resources: [
            {
              arn: 'arn:aws:route53:::hostedzone/Z1',
              accountId: '123456789012',
              region: 'global',
              service: 'route53',
              resourceType: 'route53:hostedzone',
              properties: [],
            },
          ],
          searchRegion: 'us-east-1',
          indexType: 'LOCAL',
        },
      ).unknown,
    ).toMatchObject([{ resourceId: 'arn:aws:route53:::hostedzone/Z1' }]);
  });
  it('accepts successful empty account evidence without inventing inventory candidates', () => {
    expect(
      assessAwsDiscoveryDatasetEvidence(
        'aws-cost-usage',
        { 'aws-cost-usage': [] },
        {
          resources: [],
          searchRegion: 'us-east-1',
          indexType: 'LOCAL',
        },
      ),
    ).toEqual({ assessed: [], unknown: [] });
  });
  it('retains catalog inventory candidates omitted by hydration as unknown', () => {
    const catalog = {
      resources: ['vol-1', 'vol-2'].map((volumeId) => ({
        arn: `arn:aws:ec2:us-east-1:123456789012:volume/${volumeId}`,
        accountId: '123456789012',
        region: 'us-east-1',
        service: 'ec2',
        resourceType: 'ec2:volume',
        properties: [],
      })),
      searchRegion: 'us-east-1',
      indexType: 'LOCAL' as const,
    };
    expect(
      assessAwsDiscoveryDatasetEvidence(
        'aws-ebs-volumes',
        {
          'aws-ebs-volumes': [
            { volumeId: 'vol-1', volumeType: 'gp3', sizeGiB: 8, accountId: '123456789012', region: 'us-east-1' },
          ],
        },
        catalog,
      ),
    ).toMatchObject({
      assessed: [{ resourceId: 'vol-1' }],
      unknown: [
        {
          resourceId: 'arn:aws:ec2:us-east-1:123456789012:volume/vol-2',
          accountId: '123456789012',
          region: 'us-east-1',
        },
      ],
    });
  });
  it('keeps successful transit activity complete when optional public pricing is missing', () => {
    expect(
      assessAwsDiscoveryDatasetEvidence(
        'aws-ec2-transit-gateway-vpc-attachment-activity',
        {
          'aws-ec2-transit-gateway-vpc-attachment-activity': [
            {
              accountId: '123456789012',
              region: 'us-east-1',
              transitGatewayAttachmentId: 'tgw-attach-1',
              transitGatewayId: 'tgw-1',
              vpcId: 'vpc-1',
              state: 'available',
              lookbackDays: 30,
              bytesInLast30Days: 0,
              bytesOutLast30Days: 0,
              hourlyAttachmentCostUsd: null,
              estimatedMonthlyAttachmentCostUsd: null,
            },
          ],
        },
        { resources: [], searchRegion: 'us-east-1', indexType: 'LOCAL' },
      ),
    ).toEqual({
      assessed: [{ accountId: '123456789012', region: 'us-east-1', resourceId: 'tgw-attach-1' }],
      unknown: [],
    });
  });
  it.each([
    ['aws-emr-cluster-metrics', '2026-09-08T12:04:00.000Z', '2026-09-08T12:34:00.000Z'],
    ['aws-lambda-function-metrics', '2026-09-01T12:34:00.000Z', '2026-09-08T12:34:00.000Z'],
    ['aws-cost-usage', '2026-07-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'],
    ['aws-kms-key-churn-reviews', '2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'],
  ])('matches the actual observation interval for %s', (key, startTime, endTime) => {
    const definition = getAwsDiscoveryDatasetDefinition(key);
    if (!definition) throw new Error(`Missing dataset ${key}`);
    expect(
      resolveAwsDiscoveryObservationWindow(definition.freshness.observation, Date.parse('2026-09-08T12:34:56Z')),
    ).toEqual({ startTime, endTime });
  });
  it('rejects a requested unknown dataset before planning work', () => {
    expect(() => resolveAwsDiscoveryDatasetDependencies(['missing'])).toThrow(
      'Unknown AWS discovery dataset "missing"',
    );
  });
  it('retains missing metric candidates independently of the selected rules', () => {
    expect(
      assessAwsDiscoveryDatasetEvidence(
        'aws-ec2-instance-utilization',
        {
          'aws-ec2-instances': [
            { accountId: '123456789012', region: 'us-east-1', instanceId: 'i-missing', instanceType: 't3.small' },
          ],
          'aws-ec2-instance-utilization': [],
        },
        { resources: [], searchRegion: 'us-east-1', indexType: 'LOCAL' },
      ),
    ).toEqual({
      assessed: [],
      unknown: [{ accountId: '123456789012', region: 'us-east-1', resourceId: 'i-missing' }],
    });
  });
  it('fingerprints the complete-day observation interval actually queried by RDS CPU metrics', () => {
    const definition = getAwsDiscoveryDatasetDefinition('aws-rds-instance-cpu-metrics');
    if (!definition) throw new Error('Missing RDS dataset');
    expect(definition).toMatchObject({ schemaVersion: '1', loaderVersion: '1', freshness: { ttlMs: 300_000 } });
    expect(
      resolveAwsDiscoveryObservationWindow(definition.freshness.observation, Date.parse('2026-09-08T12:34:56Z')),
    ).toEqual({ startTime: '2026-08-09T00:00:00.000Z', endTime: '2026-09-08T00:00:00.000Z' });
  });
  it('plans base inventory before derived metrics and loads shared dependencies once', () => {
    expect(
      resolveAwsDiscoveryDatasetDependencies([
        'aws-rds-instance-activity',
        'aws-rds-instance-cpu-metrics',
        'aws-rds-instances',
      ]),
    ).toEqual(['aws-rds-instances', 'aws-rds-instance-activity', 'aws-rds-instance-cpu-metrics']);
  });
  it('rejects unknown dependencies before any loader can run', () => {
    expect(() =>
      validateAwsDiscoveryDatasetDependencies([{ datasetKey: 'derived', dependencies: ['missing'] }]),
    ).toThrow('Unknown AWS discovery dataset dependency "missing" required by "derived"');
  });
  it('rejects dependency cycles with the cycle path', () => {
    expect(() =>
      validateAwsDiscoveryDatasetDependencies([
        { datasetKey: 'activity', dependencies: ['inventory'] },
        { datasetKey: 'inventory', dependencies: ['activity'] },
      ]),
    ).toThrow('AWS discovery dataset dependency cycle: activity -> inventory -> activity');
  });
});
