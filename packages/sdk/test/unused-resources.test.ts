import { LiveResourceBag } from '@cloudburn/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverAwsResources } from '../src/providers/aws/discovery.js';
import { CloudBurnClient } from '../src/scanner.js';
import { awsUnusedResourcesProfile } from '../src/unused-resources.js';
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
    expect(isUnusedResourcesScanSummary({ ...result.summary, checks: undefined })).toBe(false);
  });
});
