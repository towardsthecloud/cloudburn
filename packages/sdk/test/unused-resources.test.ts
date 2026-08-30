import { LiveResourceBag } from '@cloudburn/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverAwsResources } from '../src/providers/aws/discovery.js';
import { getAwsRuleEvaluationResourceSet } from '../src/providers/aws/discovery-registry.js';
import { CloudBurnClient } from '../src/scanner.js';
import { awsUnusedResourcesProfile, buildUnusedResourcesScanResult } from '../src/unused-resources.js';
import { isUnusedResourceFinding, isUnusedResourcesScanSummary } from '../src/unused-resources-contract.js';

vi.mock('../src/providers/aws/discovery.js', () => ({
  discoverAwsResources: vi.fn(),
}));

const mockedDiscoverAwsResources = vi.mocked(discoverAwsResources);

describe('CloudBurnClient.discoverUnusedResources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('owns explicit opt-in profile membership', () => {
    expect(awsUnusedResourcesProfile.ruleIds).toContain('CLDBRN-AWS-CLOUDWATCH-1');
    expect(awsUnusedResourcesProfile.ruleIds).toContain('CLDBRN-AWS-CLOUDWATCH-2');
    expect(awsUnusedResourcesProfile.ruleIds).not.toContain('CLDBRN-AWS-COSTGUARDRAILS-1');
    expect(awsUnusedResourcesProfile.ruleIds).not.toContain('CLDBRN-AWS-EC2-7');
  });

  it('returns self-contained CloudWatch findings and check coverage', async () => {
    const lastActivityAt = new Date('2025-01-01T00:00:00.000Z');
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: {
        resources: [],
        searchRegion: 'eu-west-1',
        indexType: 'LOCAL',
      },
      diagnostics: [
        {
          message: 'CloudFront inventory is unavailable.',
          provider: 'aws',
          ruleId: 'CLDBRN-AWS-CLOUDFRONT-1',
          service: 'cloudfront',
          source: 'discovery',
          status: 'skipped',
        },
      ],
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [
          {
            accountId: '123456789012',
            logGroupArn: 'arn:aws:logs:eu-west-1:123456789012:log-group:/aws/lambda/missing-retention:*',
            logGroupName: '/aws/lambda/missing-retention',
            region: 'eu-west-1',
          },
          {
            accountId: '123456789012',
            logGroupArn: 'arn:aws:logs:eu-west-1:123456789012:log-group:/aws/lambda/inactive:*',
            logGroupName: '/aws/lambda/inactive',
            region: 'eu-west-1',
            retentionInDays: 30,
          },
          {
            accountId: '123456789012',
            logGroupArn: 'arn:aws:logs:eu-west-1:123456789012:log-group:/aws/lambda/compliant:*',
            logGroupName: '/aws/lambda/compliant',
            region: 'eu-west-1',
            retentionInDays: 30,
          },
        ],
        'aws-cloudwatch-log-group-recent-stream-activity': [
          {
            accountId: '123456789012',
            lastEventTimestamp: lastActivityAt.getTime(),
            lastActivityAt: lastActivityAt.toISOString(),
            logGroupArn: 'arn:aws:logs:eu-west-1:123456789012:log-group:/aws/lambda/inactive:*',
            logGroupName: '/aws/lambda/inactive',
            region: 'eu-west-1',
          },
          {
            accountId: '123456789012',
            lastEventTimestamp: Date.now(),
            lastActivityAt: new Date().toISOString(),
            logGroupArn: 'arn:aws:logs:eu-west-1:123456789012:log-group:/aws/lambda/compliant:*',
            logGroupName: '/aws/lambda/compliant',
            region: 'eu-west-1',
          },
        ],
      }),
    });

    const result = await new CloudBurnClient().discoverUnusedResources({
      target: { mode: 'regions', regions: ['eu-west-1'] },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'CLDBRN-AWS-CLOUDWATCH-1',
          resourceId: '/aws/lambda/missing-retention',
          resourceType: 'logs:log-group',
          serviceName: 'CloudWatch',
          remediationEffort: 'medium',
        }),
        expect.objectContaining({
          arn: 'arn:aws:logs:eu-west-1:123456789012:log-group:/aws/lambda/inactive:*',
          lastActivityAt: '2025-01-01T00:00:00.000Z',
          remediation: {
            command: {
              args: ['logs', 'delete-log-group', '--log-group-name', '/aws/lambda/inactive', '--region', 'eu-west-1'],
              program: 'aws',
            },
          },
          remediationEffort: 'low',
          resourceId: '/aws/lambda/inactive',
          ruleId: 'CLDBRN-AWS-CLOUDWATCH-2',
        }),
      ]),
    );
    const missingRetention = result.findings.find((finding) => finding.ruleId === 'CLDBRN-AWS-CLOUDWATCH-1');
    expect(missingRetention).not.toHaveProperty('createdAt');
    expect(missingRetention).not.toHaveProperty('lastActivityAt');

    expect(result.summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'CLDBRN-AWS-CLOUDWATCH-1', status: 'triggered' }),
        expect.objectContaining({
          ruleId: 'CLDBRN-AWS-CLOUDWATCH-2',
          status: 'triggered',
        }),
        expect.objectContaining({
          evaluatedResourceCount: 3,
          resources: expect.arrayContaining([
            expect.objectContaining({
              resourceId: '/aws/lambda/compliant',
              resourceType: 'logs:log-group',
            }),
          ]),
          ruleId: 'CLDBRN-AWS-CLOUDWATCH-3',
          status: 'passed',
        }),
        expect.objectContaining({
          reason: 'CloudFront inventory is unavailable.',
          ruleId: 'CLDBRN-AWS-CLOUDFRONT-1',
          status: 'not_applicable',
        }),
      ]),
    );
    expect(result.findings.every(isUnusedResourceFinding)).toBe(true);
    expect(isUnusedResourcesScanSummary(result.summary)).toBe(true);
    expect(isUnusedResourceFinding({ ...result.findings[0], remediationEffort: 'instant' })).toBe(false);
    expect(isUnusedResourceFinding({ ...result.findings[0], remediation: [] })).toBe(false);
    expect(isUnusedResourceFinding({ ...result.findings[0], tags: ['not', 'a', 'record'] })).toBe(false);
    expect(isUnusedResourcesScanSummary({ ...result.summary, checks: undefined })).toBe(false);
    expect(
      isUnusedResourcesScanSummary({
        ...result.summary,
        checks: result.summary.checks.map((check) =>
          check.status === 'not_applicable' ? { ...check, reason: undefined } : check,
        ),
      }),
    ).toBe(false);
  });

  it('counts unique affected resources independently from rule findings', () => {
    const resource = {
      accountId: '123456789012',
      region: 'eu-west-1',
      resourceId: 'vol-123',
      resourceType: 'ec2:volume',
    };
    const result = buildUnusedResourcesScanResult({
      evaluations: {
        resourceSets: [{ id: 'aws-ebs-volumes', resources: [resource] }],
        rules: [
          { provider: 'aws', resourceSetId: 'aws-ebs-volumes', ruleId: 'CLDBRN-AWS-EBS-2', service: 'ebs' },
          { provider: 'aws', resourceSetId: 'aws-ebs-volumes', ruleId: 'CLDBRN-AWS-EBS-3', service: 'ebs' },
        ],
      },
      providers: [
        {
          provider: 'aws',
          rules: ['CLDBRN-AWS-EBS-2', 'CLDBRN-AWS-EBS-3'].map((ruleId) => ({
            findings: [{ accountId: resource.accountId, region: resource.region, resourceId: resource.resourceId }],
            message: 'Unused volume',
            ruleId,
            service: 'ebs',
            severity: 'medium' as const,
            source: 'discovery' as const,
          })),
        },
      ],
    });

    expect(result.summary.findingCount).toBe(2);
    expect(result.summary.resourceCount).toBe(1);
    expect(result.summary.findingsByService).toEqual([expect.objectContaining({ resourceCount: 1, service: 'ebs' })]);
  });
});

describe('unused-resource evaluation evidence', () => {
  it('preserves each load balancer type, including for the idle check', () => {
    const resources = new LiveResourceBag({
      'aws-ec2-load-balancers': [
        {
          accountId: '123456789012',
          attachedTargetGroupArns: [],
          instanceCount: 0,
          loadBalancerArn: 'arn:aws:elasticloadbalancing:eu-west-1:123456789012:loadbalancer/net/api/123',
          loadBalancerName: 'api',
          loadBalancerType: 'network',
          region: 'eu-west-1',
        },
      ],
    });

    const result = getAwsRuleEvaluationResourceSet(
      {
        discoveryDependencies: ['aws-ec2-load-balancer-request-activity', 'aws-ec2-load-balancers'],
        id: 'CLDBRN-AWS-ELB-5',
      },
      resources,
    );

    expect(result.resources).toEqual([
      expect.objectContaining({
        name: 'api',
        resourceType: 'elasticloadbalancing:loadbalancer/net',
      }),
    ]);
  });

  it('does not present notebook configuration changes as user activity', () => {
    const resources = new LiveResourceBag({
      'aws-sagemaker-notebook-instances': [
        {
          accountId: '123456789012',
          instanceType: 'ml.t3.medium',
          lastModifiedTime: '2026-03-01T00:00:00.000Z',
          notebookInstanceName: 'analytics',
          notebookInstanceStatus: 'InService',
          region: 'eu-west-1',
        },
      ],
    });

    const result = getAwsRuleEvaluationResourceSet(
      { discoveryDependencies: ['aws-sagemaker-notebook-instances'], id: 'CLDBRN-AWS-SAGEMAKER-1' },
      resources,
    );

    expect(result.resources[0]).not.toHaveProperty('lastActivityAt');
  });

  it('distinguishes hydrated child resources from their catalog seed types', () => {
    const resources = new LiveResourceBag({
      'aws-eks-nodegroups': [
        {
          accountId: '123456789012',
          clusterArn: 'arn:aws:eks:eu-west-1:123456789012:cluster/production',
          clusterName: 'production',
          instanceTypes: ['m6g.large'],
          nodegroupArn: 'arn:aws:eks:eu-west-1:123456789012:nodegroup/production/workers/abc123',
          nodegroupName: 'workers',
          region: 'eu-west-1',
        },
      ],
      'aws-route53-records': [
        {
          accountId: '123456789012',
          hostedZoneId: 'Z123',
          isAlias: false,
          recordId: 'Z123/example.com./A',
          recordName: 'example.com.',
          recordType: 'A',
          region: 'global',
          ttl: 300,
        },
      ],
    });

    const nodegroups = getAwsRuleEvaluationResourceSet(
      { discoveryDependencies: ['aws-eks-nodegroups'], id: 'CLDBRN-AWS-EKS-1' },
      resources,
    );
    const records = getAwsRuleEvaluationResourceSet(
      { discoveryDependencies: ['aws-route53-zones', 'aws-route53-records'], id: 'CLDBRN-AWS-ROUTE53-1' },
      resources,
    );

    expect(nodegroups.resources[0]).toEqual(
      expect.objectContaining({ name: 'workers', resourceType: 'eks:nodegroup' }),
    );
    expect(records.resources[0]).toEqual(
      expect.objectContaining({ name: 'example.com.', resourceType: 'route53:record' }),
    );
  });
});
