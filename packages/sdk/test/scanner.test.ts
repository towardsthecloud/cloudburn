import { fileURLToPath } from 'node:url';
import { awsRules, LiveResourceBag } from '@cloudburn/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEc2Client } from '../src/providers/aws/client.js';
import { discoverAwsResources } from '../src/providers/aws/discovery.js';
import { CloudBurnClient } from '../src/scanner.js';

vi.mock('../src/providers/aws/discovery.js', () => ({
  discoverAwsResources: vi.fn(),
}));

const mockedDiscoverAwsResources = vi.mocked(discoverAwsResources);

const discoveryCatalog = {
  resources: [],
  searchRegion: 'us-east-1',
  indexType: 'LOCAL' as const,
};

const configRecordingReview = {
  accountId: '123456789012',
  allSupported: true,
  configurationItemsRecorded: 2_000,
  configuredResourceTypes: [],
  continuousRecordingUnitPriceUsd: 0.003,
  currentRecordingFrequency: 'CONTINUOUS' as const,
  dailyRecordingUnitPriceUsd: 0.012,
  defaultRecordingFrequency: 'CONTINUOUS' as const,
  estimatedMonthlyConfigurationItemReduction: 4_136,
  estimatedMonthlyRecordingCostReductionUsd: 11.06,
  excludedResourceTypes: [],
  firewallManagerDependent: false,
  includeGlobalResourceTypes: false,
  observationWindowDays: 14,
  paidServiceLinkedRecorderDependent: false,
  recorderArn: 'arn:aws:config:eu-central-1:123456789012:configuration-recorder/default/abc',
  recorderName: 'default',
  recordedResourceCount: 5,
  recordingModeOverrides: [],
  recordingScope: 'PAID',
  recordingStrategy: 'ALL_SUPPORTED_RESOURCE_TYPES',
  region: 'eu-central-1',
  resourceType: 'AWS::Lambda::Function',
};

describe('CloudBurnClient', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('passes the explicit discovery target to the aws provider scanner and returns gp2 findings', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [
          {
            accountId: '123456789012',
            iops: 3000,
            region: 'us-east-1',
            sizeGiB: 64,
            volumeId: 'vol-123',
            volumeType: 'gp2',
          },
          {
            accountId: '123456789012',
            iops: 3000,
            region: 'us-east-1',
            sizeGiB: 64,
            volumeId: 'vol-456',
            volumeType: 'gp3',
          },
        ],
      }),
    });

    const scanner = new CloudBurnClient();

    const result = await scanner.discover({
      target: {
        mode: 'regions',
        regions: ['us-east-1'],
      },
    });

    expect(mockedDiscoverAwsResources).toHaveBeenCalledWith(
      expect.any(Array),
      { mode: 'regions', regions: ['us-east-1'] },
      {},
    );

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EBS-1',
              service: 'ebs',
              severity: 'medium',
              source: 'discovery',
              message: 'EBS volumes should use current-generation storage.',
              findings: [
                {
                  resourceId: 'vol-123',
                  region: 'us-east-1',
                  accountId: '123456789012',
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns every resource evaluated by each rule when evaluation resources are requested', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [
          {
            accountId: '123456789012',
            iops: 3000,
            region: 'us-east-1',
            sizeGiB: 64,
            volumeId: 'vol-triggered',
            volumeType: 'gp2',
          },
          {
            accountId: '123456789012',
            iops: 3000,
            region: 'us-east-1',
            sizeGiB: 64,
            volumeId: 'vol-passed',
            volumeType: 'gp3',
          },
        ],
      }),
    });

    const scanner = new CloudBurnClient();
    const result = await scanner.discover({
      config: {
        discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'] },
        iac: {},
      },
      includeEvaluationResources: true,
      target: { mode: 'regions', regions: ['us-east-1'] },
    });

    expect(result.evaluations).toEqual({
      resourceSets: [
        {
          id: 'aws-ebs-volumes',
          resources: [
            {
              accountId: '123456789012',
              region: 'us-east-1',
              resourceId: 'vol-triggered',
              resourceType: 'ec2:volume',
            },
            {
              accountId: '123456789012',
              region: 'us-east-1',
              resourceId: 'vol-passed',
              resourceType: 'ec2:volume',
            },
          ],
        },
      ],
      rules: [
        {
          description:
            'Flag EBS volumes using previous-generation storage types when a current-generation replacement exists.',
          findingCount: 1,
          message: 'EBS volumes should use current-generation storage.',
          name: 'EBS Volume Type Not Current Generation',
          provider: 'aws',
          resourceSetId: 'aws-ebs-volumes',
          ruleId: 'CLDBRN-AWS-EBS-1',
          service: 'ebs',
          severity: 'medium',
          source: 'discovery',
          status: 'triggered',
          supports: ['discovery', 'iac'],
        },
      ],
    });
  });

  it('returns KMS churn counts and cost inputs as evaluation evidence', async () => {
    const kmsReview = {
      accountId: '123456789012',
      aliasPatternGroups: [{ keyCount: 12, patternId: 'pattern-123456789abc' }],
      aliasPatternsAvailable: true,
      creationWindowEnd: '2026-09-01T00:00:00.000Z',
      creationWindowStart: '2026-08-01T00:00:00.000Z',
      enabledCustomerManagedKeyCount: 50,
      estimatedMonthlyStorageCostUsd: 52,
      keyMetadataComplete: true,
      keyMetadataUnavailableCount: 0,
      keysCreatedInWindow: 10,
      multiRegionKeyCount: 2,
      noKmsUsageSinceCreationKeyCount: 4,
      region: 'eu-central-1',
      reviewId: 'kms-key-churn/eu-central-1',
      rotatedKeyCount: 2,
      storageCostEstimateComplete: true,
      unobservedBeforeTrackingKeyCount: 3,
      usageMetadataUnavailableKeyCount: 1,
      usedKeyCount: 42,
    };
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-kms-key-churn-reviews': [kmsReview],
      }),
    });

    const result = await new CloudBurnClient().discover({
      config: { discovery: { enabledRules: ['CLDBRN-AWS-KMS-1'] }, iac: {} },
      includeEvaluationResources: true,
    });

    expect(result.evaluations).toEqual({
      resourceSets: [
        {
          id: 'aws-kms-key-churn-reviews',
          resources: [
            {
              accountId: '123456789012',
              data: kmsReview,
              region: 'eu-central-1',
              resourceId: 'kms-key-churn/eu-central-1',
              resourceType: 'kms:key',
            },
          ],
        },
      ],
      rules: [
        expect.objectContaining({
          findingCount: 1,
          resourceSetId: 'aws-kms-key-churn-reviews',
          ruleId: 'CLDBRN-AWS-KMS-1',
          status: 'triggered',
        }),
      ],
    });
  });

  it('preserves concrete resource types for mixed account-wide evaluation resources', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-resource-explorer-untagged-resources': [
          {
            accountId: '123456789012',
            arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-123',
            region: 'us-east-1',
            resourceType: 'ec2:instance',
            service: 'ec2',
          },
          {
            accountId: '123456789012',
            arn: 'arn:aws:s3:::example-bucket',
            region: 'global',
            resourceType: 's3:bucket',
            service: 's3',
          },
        ],
      }),
    });

    const result = await new CloudBurnClient().discover({
      config: {
        discovery: { enabledRules: ['CLDBRN-AWS-TAGGING-1'] },
        iac: {},
      },
      includeEvaluationResources: true,
    });

    expect(result.evaluations?.resourceSets[0]?.resources).toEqual([
      expect.objectContaining({ resourceType: 'ec2:instance' }),
      expect.objectContaining({ resourceType: 's3:bucket' }),
    ]);
  });

  it('reports a completed rule with no findings as passed', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [
          {
            accountId: '123456789012',
            region: 'us-east-1',
            sizeGiB: 64,
            volumeId: 'vol-current',
            volumeType: 'gp3',
          },
        ],
      }),
    });

    const result = await new CloudBurnClient().discover({
      config: { discovery: { enabledRules: ['CLDBRN-AWS-EBS-1'] }, iac: {} },
      includeEvaluationResources: true,
    });

    expect(result.evaluations?.rules).toEqual([
      expect.objectContaining({
        findingCount: 0,
        ruleId: 'CLDBRN-AWS-EBS-1',
        status: 'passed',
      }),
    ]);
  });

  it('reports every Lambda function inspected by the memory-overprovisioning rule', async () => {
    const accountId = '123456789012';
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-lambda-functions': [
          {
            accountId,
            architectures: ['x86_64'],
            functionArn: `arn:aws:lambda:us-east-1:${accountId}:function:overprovisioned`,
            functionName: 'overprovisioned',
            region: 'us-east-1',
          },
          {
            accountId,
            architectures: ['arm64'],
            functionArn: `arn:aws:lambda:us-east-1:${accountId}:function:right-sized`,
            functionName: 'right-sized',
            region: 'us-east-1',
          },
        ],
        'aws-lambda-memory-recommendations': [
          {
            accountId,
            functionArn: `arn:aws:lambda:us-east-1:${accountId}:function:overprovisioned`,
            region: 'us-east-1',
          },
        ],
      }),
    });

    const result = await new CloudBurnClient().discover({
      config: { discovery: { enabledRules: ['CLDBRN-AWS-LAMBDA-4'] }, iac: {} },
      includeEvaluationResources: true,
    });

    expect(result.evaluations?.resourceSets).toEqual([
      {
        id: 'aws-lambda-functions',
        resources: [
          {
            accountId,
            region: 'us-east-1',
            arn: `arn:aws:lambda:us-east-1:${accountId}:function:overprovisioned`,
            name: 'overprovisioned',
            resourceId: `arn:aws:lambda:us-east-1:${accountId}:function:overprovisioned`,
            resourceType: 'lambda:function',
          },
          {
            accountId,
            region: 'us-east-1',
            arn: `arn:aws:lambda:us-east-1:${accountId}:function:right-sized`,
            name: 'right-sized',
            resourceId: `arn:aws:lambda:us-east-1:${accountId}:function:right-sized`,
            resourceType: 'lambda:function',
          },
        ],
      },
    ]);
  });

  it('exposes AWS Config recording evidence for each targeted daily override', async () => {
    const review = configRecordingReview;
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-config-recording-frequency-reviews': [review],
      }),
    });

    const result = await new CloudBurnClient().discover({
      config: { discovery: { enabledRules: ['CLDBRN-AWS-CONFIG-1'] }, iac: {} },
      includeEvaluationResources: true,
    });

    expect(result.evaluations?.resourceSets).toEqual([
      {
        id: 'aws-config-recording-frequency-reviews',
        resources: [
          {
            accountId: '123456789012',
            arn: review.recorderArn,
            data: review,
            name: 'default: AWS::Lambda::Function',
            region: 'eu-central-1',
            resourceId: `${review.recorderArn}#AWS::Lambda::Function`,
            resourceType: 'config:configuration-recorder',
          },
        ],
      },
    ]);
  });

  it('reports incomplete AWS Config turnover evidence as not applicable', async () => {
    const diagnostic = {
      code: 'ConfigResourceTurnoverLimitExceeded',
      details:
        'Turnover could not be established for AWS::Lambda::Function after inspecting 1,000 retained resource identities.',
      message:
        'Skipped AWS Config recording-frequency evaluation in eu-central-1 because retained-resource turnover exceeded the 1,000-identity inspection limit.',
      provider: 'aws' as const,
      region: 'eu-central-1',
      service: 'config',
      source: 'discovery' as const,
      status: 'skipped' as const,
    };
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      diagnostics: [diagnostic],
      resources: new LiveResourceBag({
        'aws-config-recording-frequency-reviews': [{ ...configRecordingReview, turnoverEstimateReliable: false }],
      }),
      unavailableDatasets: new Map([['aws-config-recording-frequency-reviews', [diagnostic]]]),
    });

    const result = await new CloudBurnClient().discover({
      config: { discovery: { enabledRules: ['CLDBRN-AWS-CONFIG-1'] }, iac: {} },
      includeEvaluationResources: true,
    });

    expect(result.providers).toEqual([]);
    expect(result.evaluations).toEqual({
      resourceSets: [],
      rules: [
        expect.objectContaining({
          findingCount: 0,
          reason:
            'Skipped rule CLDBRN-AWS-CONFIG-1 because required discovery datasets were unavailable: aws-config-recording-frequency-reviews.',
          ruleId: 'CLDBRN-AWS-CONFIG-1',
          status: 'not_applicable',
        }),
      ],
    });
    expect(result.diagnostics).toEqual([
      diagnostic,
      expect.objectContaining({
        message:
          'Skipped rule CLDBRN-AWS-CONFIG-1 because required discovery datasets were unavailable: aws-config-recording-frequency-reviews.',
        ruleId: 'CLDBRN-AWS-CONFIG-1',
        status: 'skipped',
      }),
    ]);
  });

  it('uses the same CloudWatch log group identity for findings and evaluation resources', async () => {
    const logGroupArn = 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app';
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [
          {
            accountId: '123456789012',
            logGroupArn,
            logGroupName: '/aws/lambda/app',
            region: 'us-east-1',
          },
        ],
        'aws-cloudwatch-log-group-recent-stream-activity': [
          {
            accountId: '123456789012',
            logGroupArn,
            logGroupName: '/aws/lambda/app',
            region: 'us-east-1',
          },
        ],
      }),
    });

    const result = await new CloudBurnClient().discover({
      config: {
        discovery: { enabledRules: ['CLDBRN-AWS-CLOUDWATCH-2'] },
        iac: {},
      },
      includeEvaluationResources: true,
    });

    expect(result.providers[0]?.rules[0]?.findings[0]?.resourceId).toBe(logGroupArn);
    expect(result.evaluations?.resourceSets[0]?.resources[0]).toEqual({
      accountId: '123456789012',
      arn: logGroupArn,
      name: '/aws/lambda/app',
      region: 'us-east-1',
      resourceId: logGroupArn,
      resourceType: 'logs:log-group',
    });
  });

  it('reports individual budgets as the resources evaluated by the exceeded-budget rule', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-cost-guardrail-budgets': [
          {
            accountId: '123456789012',
            budgetCount: 2,
            budgets: [
              { actualSpend: 120, budgetLimit: 100, budgetName: 'production', spendUnit: 'USD' },
              { actualSpend: 40, budgetLimit: 100, budgetName: 'sandbox', spendUnit: 'USD' },
            ],
          },
        ],
      }),
    });

    const result = await new CloudBurnClient().discover({
      config: {
        discovery: { enabledRules: ['CLDBRN-AWS-COSTGUARDRAILS-3'] },
        iac: {},
      },
      includeEvaluationResources: true,
    });

    expect(result.evaluations?.resourceSets[0]?.resources).toEqual([
      {
        accountId: '123456789012',
        region: 'global',
        resourceId: 'budget/production',
        resourceType: 'costguardrails',
      },
      {
        accountId: '123456789012',
        region: 'global',
        resourceId: 'budget/sandbox',
        resourceType: 'costguardrails',
      },
    ]);
  });

  it('reports individual budgets as the resources evaluated by the forecasted-breach rule', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-cost-guardrail-budgets': [
          {
            accountId: '123456789012',
            budgetCount: 2,
            budgets: [
              {
                actualSpend: 75,
                budgetLimit: 100,
                budgetName: 'production',
                forecastedSpend: 125,
                spendUnit: 'USD',
              },
              {
                actualSpend: 40,
                budgetLimit: 100,
                budgetName: 'sandbox',
                forecastedSpend: 80,
                spendUnit: 'USD',
              },
            ],
          },
        ],
      }),
    });

    const result = await new CloudBurnClient().discover({
      config: {
        discovery: { enabledRules: ['CLDBRN-AWS-COSTGUARDRAILS-4'] },
        iac: {},
      },
      includeEvaluationResources: true,
    });

    expect(result.providers[0]?.rules[0]?.findings).toEqual([
      {
        accountId: '123456789012',
        resourceId: 'budget/production',
      },
    ]);
    expect(result.evaluations?.resourceSets[0]?.resources).toEqual([
      {
        accountId: '123456789012',
        region: 'global',
        resourceId: 'budget/production',
        resourceType: 'costguardrails',
      },
      {
        accountId: '123456789012',
        region: 'global',
        resourceId: 'budget/sandbox',
        resourceType: 'costguardrails',
      },
    ]);
  });

  it('preserves global regions in evaluation resource identities', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-cloudfront-distributions': [
          {
            accountId: '123456789012',
            distributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
            distributionId: 'E1234567890ABC',
            priceClass: 'PriceClass_All',
            region: 'global',
          },
        ],
      }),
    });

    const result = await new CloudBurnClient().discover({
      config: {
        discovery: { enabledRules: ['CLDBRN-AWS-CLOUDFRONT-1'] },
        iac: {},
      },
      includeEvaluationResources: true,
    });

    expect(result.evaluations?.resourceSets[0]?.resources[0]).toEqual({
      accountId: '123456789012',
      region: 'global',
      resourceId: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
      resourceType: 'cloudfront:distribution',
    });
  });

  it('reports evaluation resources for every built-in discovery rule', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag(),
    });

    const scanner = new CloudBurnClient();
    const discoveryRuleIds = awsRules.filter((rule) => rule.supports.includes('discovery')).map((rule) => rule.id);
    const result = await scanner.discover({
      config: { discovery: { enabledRules: discoveryRuleIds }, iac: {} },
      includeEvaluationResources: true,
    });

    expect(result.evaluations?.rules).toHaveLength(discoveryRuleIds.length);
    expect(result.evaluations?.resourceSets.every((resourceSet) => resourceSet.resources.length === 0)).toBe(true);
  });

  it('returns lambda architecture findings discovered during live scans', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-lambda-functions': [
          { functionName: 'legacy-func', architectures: ['x86_64'], region: 'us-east-1', accountId: '123456789012' },
          { functionName: 'arm-func', architectures: ['arm64'], region: 'us-east-1', accountId: '123456789012' },
        ],
      }),
    });

    const scanner = new CloudBurnClient();

    const result = await scanner.discover({
      target: {
        mode: 'regions',
        regions: ['us-east-1'],
      },
    });

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-LAMBDA-1',
              service: 'lambda',
              severity: 'medium',
              source: 'discovery',
              message: 'Lambda functions should use arm64 architecture when compatible to reduce running costs.',
              findings: [
                {
                  resourceId: 'legacy-func',
                  region: 'us-east-1',
                  accountId: '123456789012',
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('reports the effective configured policy in discovery results', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-ebs-volumes': [
          {
            accountId: '123456789012',
            region: 'us-east-1',
            sizeGiB: 64,
            volumeId: 'vol-123',
            volumeType: 'gp2',
          },
        ],
      }),
    });
    const scanner = new CloudBurnClient();

    const result = await scanner.discover({ config: { discovery: { failOn: 'medium' } } });

    expect(result.policy).toEqual({
      qualifyingFindingCount: 1,
      threshold: 'medium',
      violated: true,
    });
  });

  it('returns non-preferred EC2 instance findings discovered during live scans', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-ec2-instances': [
          {
            accountId: '123456789012',
            instanceId: 'i-legacy',
            instanceType: 'c6i.large',
            region: 'us-east-1',
          },
          {
            accountId: '123456789012',
            instanceId: 'i-current',
            instanceType: 'm8i.large',
            region: 'us-east-1',
          },
        ],
      }),
    });

    const scanner = new CloudBurnClient();

    const result = await scanner.discover({
      target: {
        mode: 'regions',
        regions: ['us-east-1'],
      },
    });

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EC2-1',
              service: 'ec2',
              severity: 'medium',
              source: 'discovery',
              message: 'EC2 instances should use preferred instance types.',
              findings: [
                {
                  resourceId: 'i-legacy',
                  region: 'us-east-1',
                  accountId: '123456789012',
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns non-preferred RDS DB instance findings discovered during live scans', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-rds-instances': [
          {
            accountId: '123456789012',
            dbInstanceIdentifier: 'legacy-db',
            instanceClass: 'db.m6i.large',
            region: 'us-east-1',
          },
          {
            accountId: '123456789012',
            dbInstanceIdentifier: 'current-db',
            instanceClass: 'db.r8g.large',
            region: 'us-east-1',
          },
        ],
      } as never),
    });

    const scanner = new CloudBurnClient();

    const result = await scanner.discover({
      target: {
        mode: 'regions',
        regions: ['us-east-1'],
      },
    });

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-RDS-1',
              service: 'rds',
              severity: 'medium',
              source: 'discovery',
              message: 'RDS DB instances should use preferred instance classes.',
              findings: [
                {
                  resourceId: 'legacy-db',
                  region: 'us-east-1',
                  accountId: '123456789012',
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-RDS-4',
              service: 'rds',
              severity: 'medium',
              source: 'discovery',
              message: 'RDS DB instances without a Graviton equivalent in use should be reviewed.',
              findings: [
                {
                  resourceId: 'legacy-db',
                  region: 'us-east-1',
                  accountId: '123456789012',
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('skips rules whose required discovery datasets were unavailable', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      diagnostics: [
        {
          code: 'ThrottlingException',
          details:
            'Amazon CloudWatch Logs DescribeLogStreams failed in us-east-1 with ThrottlingException: Rate exceeded Request ID: req-log-streams.',
          message:
            'Skipped cloudwatch discovery in us-east-1 because AWS throttled the required dataset after retrying.',
          provider: 'aws',
          region: 'us-east-1',
          service: 'cloudwatch',
          source: 'discovery',
          status: 'throttled' as const,
        },
      ],
      resources: new LiveResourceBag({
        'aws-cloudwatch-log-groups': [
          {
            accountId: '123456789012',
            logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
            logGroupClass: 'STANDARD',
            logGroupName: '/aws/lambda/app',
            region: 'us-east-1',
            storedBytes: 1_073_741_824,
          },
        ],
      } as never),
      unavailableDatasets: new Map([
        [
          'aws-cloudwatch-log-group-recent-stream-activity',
          [
            {
              code: 'ThrottlingException',
              details:
                'Amazon CloudWatch Logs DescribeLogStreams failed in us-east-1 with ThrottlingException: Rate exceeded Request ID: req-log-streams.',
              message:
                'Skipped cloudwatch discovery in us-east-1 because AWS throttled the required dataset after retrying.',
              provider: 'aws' as const,
              region: 'us-east-1',
              service: 'cloudwatch',
              source: 'discovery' as const,
              status: 'throttled' as const,
            },
          ],
        ],
      ]),
    });

    const scanner = new CloudBurnClient();

    const result = await scanner.discover({
      config: {
        discovery: {
          enabledRules: ['CLDBRN-AWS-CLOUDWATCH-2'],
        },
        iac: {},
      },
      includeEvaluationResources: true,
      target: {
        mode: 'regions',
        regions: ['us-east-1'],
      },
    });

    expect(result).toEqual({
      diagnostics: [
        {
          code: 'ThrottlingException',
          details:
            'Amazon CloudWatch Logs DescribeLogStreams failed in us-east-1 with ThrottlingException: Rate exceeded Request ID: req-log-streams.',
          message:
            'Skipped cloudwatch discovery in us-east-1 because AWS throttled the required dataset after retrying.',
          provider: 'aws',
          region: 'us-east-1',
          service: 'cloudwatch',
          source: 'discovery',
          status: 'throttled',
        },
        {
          details:
            'Amazon CloudWatch Logs DescribeLogStreams failed in us-east-1 with ThrottlingException: Rate exceeded Request ID: req-log-streams.',
          message:
            'Skipped rule CLDBRN-AWS-CLOUDWATCH-2 because required discovery datasets were unavailable: aws-cloudwatch-log-group-recent-stream-activity.',
          provider: 'aws',
          ruleId: 'CLDBRN-AWS-CLOUDWATCH-2',
          service: 'cloudwatch',
          source: 'discovery',
          status: 'skipped',
        },
      ],
      evaluations: {
        resourceSets: [],
        rules: [
          expect.objectContaining({
            findingCount: 0,
            reason:
              'Skipped rule CLDBRN-AWS-CLOUDWATCH-2 because required discovery datasets were unavailable: aws-cloudwatch-log-group-recent-stream-activity.',
            ruleId: 'CLDBRN-AWS-CLOUDWATCH-2',
            status: 'not_applicable',
          }),
        ],
      },
      providers: [],
    });
  });

  it('scopes aws credentials around live discovery so provider clients use them', async () => {
    const scanCredentials = {
      accessKeyId: 'AKIASCAN',
      secretAccessKey: 'scan-secret',
      sessionToken: 'scan-session',
    };

    mockedDiscoverAwsResources.mockImplementation(async () => {
      const client = createEc2Client({ region: 'us-east-1' });
      const resolved = await (client.config.credentials as () => Promise<Record<string, unknown>>)();
      expect(resolved).toMatchObject(scanCredentials);

      return {
        catalog: discoveryCatalog,
        resources: new LiveResourceBag(),
      };
    });

    const scanner = new CloudBurnClient();

    await scanner.discover({
      target: { mode: 'regions', regions: ['us-east-1'] },
      aws: { credentials: scanCredentials },
    });

    expect(mockedDiscoverAwsResources).toHaveBeenCalledOnce();
  });

  it('defaults discover to the current region target when none is provided', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag(),
    });

    const scanner = new CloudBurnClient();

    await scanner.discover();

    expect(mockedDiscoverAwsResources).toHaveBeenCalledWith(expect.any(Array), { mode: 'current' }, {});
  });

  it('forwards the configured debug logger into live discovery', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag(),
    });

    const debugLogger = vi.fn();
    const scanner = new CloudBurnClient({ debugLogger });

    await scanner.discover();

    expect(mockedDiscoverAwsResources).toHaveBeenCalledWith(
      expect.any(Array),
      {
        mode: 'current',
      },
      {
        debugLogger,
      },
    );
    expect(debugLogger).toHaveBeenCalledWith('sdk: starting live discovery scan');
  });

  it('passes an explicit config path through discovery config loading', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag(),
    });

    const scanner = new CloudBurnClient();
    const loadConfig = vi.spyOn(scanner, 'loadConfig').mockResolvedValue({
      discovery: {},
      iac: {},
    });

    await scanner.discover({ configPath: '/tmp/cloudburn.yml' });

    expect(loadConfig).toHaveBeenCalledWith('/tmp/cloudburn.yml');
  });

  it('returns a static ebs finding from the generic terraform resource catalog', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/terraform/scan-dir', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EC2-1',
              service: 'ec2',
              severity: 'medium',
              source: 'iac',
              message: 'EC2 instances should use preferred instance types.',
              findings: [
                {
                  resourceId: 'aws_instance.web',
                  location: {
                    path: 'variables.tf',
                    line: 14,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-EC2-6',
              service: 'ec2',
              severity: 'medium',
              source: 'iac',
              message: 'EC2 instances without a Graviton equivalent in use should be reviewed.',
              findings: [
                {
                  resourceId: 'aws_instance.web',
                  location: {
                    path: 'variables.tf',
                    line: 14,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-EBS-1',
              service: 'ebs',
              severity: 'medium',
              source: 'iac',
              message: 'EBS volumes should use current-generation storage.',
              findings: [
                {
                  resourceId: 'aws_ebs_volume.gp2_logs',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-EBS-4',
              service: 'ebs',
              severity: 'high',
              source: 'iac',
              message: 'EBS volumes larger than 100 GiB should be reviewed.',
              findings: [
                {
                  resourceId: 'aws_ebs_volume.gp3_data',
                  location: {
                    path: 'main.tf',
                    line: 10,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static findings and diagnostics when a terraform sibling is malformed', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/terraform/invalid-syntax', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result.diagnostics).toEqual([
      {
        code: 'TERRAFORM_PARSE_ERROR',
        message: 'Skipped Terraform file broken.tf because it could not be parsed.',
        provider: 'aws',
        service: 'terraform',
        source: 'iac',
        status: 'skipped',
      },
    ]);
    expect(
      result.providers.flatMap((provider) =>
        provider.rules.flatMap((rule) => rule.findings.map((finding) => finding.resourceId)),
      ),
    ).toContain('aws_ebs_volume.gp2_sibling');
  });

  it('reports the effective configured policy in static scan results', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/terraform/scan-dir', import.meta.url));

    const result = await scanner.scanStatic(fixturePath, { iac: { failOn: 'medium' } });

    expect(result.policy).toEqual({
      qualifyingFindingCount: 4,
      threshold: 'medium',
      violated: true,
    });
  });

  it('returns a static EC2 finding from a CloudFormation template', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/cloudformation/ec2-instance.yaml', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EC2-1',
              service: 'ec2',
              severity: 'medium',
              source: 'iac',
              message: 'EC2 instances should use preferred instance types.',
              findings: [
                {
                  resourceId: 'LegacyWeb',
                  location: {
                    path: 'ec2-instance.yaml',
                    line: 7,
                    column: 7,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns diagnostics instead of aborting for a malformed cloudformation template', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/cloudformation/invalid-template.yaml', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      diagnostics: [
        {
          code: 'CLOUDFORMATION_PARSE_ERROR',
          message: 'Skipped CloudFormation file invalid-template.yaml because it could not be parsed.',
          provider: 'aws',
          service: 'cloudformation',
          source: 'iac',
          status: 'skipped',
        },
      ],
      providers: [],
    });
  });

  it('returns static ebs findings from terraform and cloudformation resources in the same directory', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EBS-1',
              service: 'ebs',
              severity: 'medium',
              source: 'iac',
              message: 'EBS volumes should use current-generation storage.',
              findings: [
                {
                  resourceId: 'aws_ebs_volume.gp2_logs',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
                {
                  resourceId: 'MyVolume',
                  location: {
                    path: 'template.yaml',
                    line: 7,
                    column: 7,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('partitions Terraform and CloudFormation suppressions from active static findings', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-suppressions', import.meta.url));

    const result = await scanner.scanStatic(fixturePath, {
      iac: { enabledRules: ['CLDBRN-AWS-EBS-1'] },
    });

    expect(result.providers[0]?.rules[0]?.findings.map((finding) => finding.resourceId)).toEqual([
      'aws_ebs_volume.active',
      'ActiveVolume',
    ]);
    expect(result.suppressed).toMatchObject([
      {
        finding: { resourceId: 'aws_ebs_volume.suppressed' },
        provider: 'aws',
        ruleId: 'CLDBRN-AWS-EBS-1',
        service: 'ebs',
        severity: 'medium',
        source: 'iac',
        suppression: {
          kind: 'rule',
          reason: 'legacy Terraform volume',
          ruleId: 'CLDBRN-AWS-EBS-1',
        },
      },
      {
        finding: { resourceId: 'SuppressedVolume' },
        provider: 'aws',
        ruleId: 'CLDBRN-AWS-EBS-1',
        service: 'ebs',
        severity: 'medium',
        source: 'iac',
        suppression: {
          kind: 'all',
          reason: 'approved CloudFormation exception',
        },
      },
    ]);
  });

  it('applies rule-specific suppressions to one rule and ignore-all suppressions to every rule', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-suppressions', import.meta.url));

    const result = await scanner.scanStatic(fixturePath, {
      iac: { enabledRules: ['CLDBRN-AWS-EBS-1', 'CLDBRN-AWS-EBS-4'] },
    });

    expect(
      result.providers.flatMap((provider) =>
        provider.rules.flatMap((rule) =>
          rule.findings.map((finding) => ({ resourceId: finding.resourceId, ruleId: rule.ruleId })),
        ),
      ),
    ).toEqual([
      { resourceId: 'aws_ebs_volume.active', ruleId: 'CLDBRN-AWS-EBS-1' },
      { resourceId: 'ActiveVolume', ruleId: 'CLDBRN-AWS-EBS-1' },
      { resourceId: 'aws_ebs_volume.suppressed', ruleId: 'CLDBRN-AWS-EBS-4' },
    ]);
    expect(
      result.suppressed?.map(({ finding, ruleId, suppression }) => ({
        kind: suppression.kind,
        resourceId: finding.resourceId,
        ruleId,
      })),
    ).toEqual([
      {
        kind: 'rule',
        resourceId: 'aws_ebs_volume.suppressed',
        ruleId: 'CLDBRN-AWS-EBS-1',
      },
      {
        kind: 'all',
        resourceId: 'SuppressedVolume',
        ruleId: 'CLDBRN-AWS-EBS-1',
      },
      {
        kind: 'all',
        resourceId: 'SuppressedVolume',
        ruleId: 'CLDBRN-AWS-EBS-4',
      },
    ]);
  });

  it('returns static RDS findings from Terraform DB instance resources', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/terraform/rds-scan-dir', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-RDS-1',
              service: 'rds',
              severity: 'medium',
              source: 'iac',
              message: 'RDS DB instances should use preferred instance classes.',
              findings: [
                {
                  resourceId: 'aws_db_instance.legacy',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-RDS-4',
              service: 'rds',
              severity: 'medium',
              source: 'iac',
              message: 'RDS DB instances without a Graviton equivalent in use should be reviewed.',
              findings: [
                {
                  resourceId: 'aws_db_instance.legacy',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static RDS findings from terraform and cloudformation resources in the same directory', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-rds-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-RDS-1',
              service: 'rds',
              severity: 'medium',
              source: 'iac',
              message: 'RDS DB instances should use preferred instance classes.',
              findings: [
                {
                  resourceId: 'aws_db_instance.legacy',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
                {
                  resourceId: 'LegacyDatabase',
                  location: {
                    path: 'template.yaml',
                    line: 7,
                    column: 7,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-RDS-4',
              service: 'rds',
              severity: 'medium',
              source: 'iac',
              message: 'RDS DB instances without a Graviton equivalent in use should be reviewed.',
              findings: [
                {
                  resourceId: 'aws_db_instance.legacy',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-RDS-11',
              service: 'rds',
              severity: 'medium',
              source: 'iac',
              message: 'RDS DB instances should use current-generation gp3 storage.',
              findings: [
                {
                  resourceId: 'aws_db_instance.current',
                  location: {
                    path: 'main.tf',
                    line: 10,
                    column: 3,
                  },
                },
                {
                  resourceId: 'CurrentDatabase',
                  location: {
                    path: 'template.yaml',
                    line: 13,
                    column: 7,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static ElastiCache findings from terraform and cloudformation resources in the same directory', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-elasticache-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-ELASTICACHE-3',
              service: 'elasticache',
              severity: 'medium',
              source: 'iac',
              message: 'ElastiCache clusters should use current-generation node types.',
              findings: [
                {
                  resourceId: 'aws_elasticache_cluster.sessions',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
                {
                  resourceId: 'SessionsCache',
                  location: {
                    path: 'template.yaml',
                    line: 6,
                    column: 7,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static EC2 endpoint findings from terraform and cloudformation resources in the same directory', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-ec2-endpoint-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EC2-2',
              service: 'ec2',
              severity: 'medium',
              source: 'iac',
              message: 'S3 access inside a VPC should prefer gateway endpoints over interface endpoints when possible.',
              findings: [
                {
                  resourceId: 'aws_vpc_endpoint.s3_private_link',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
                {
                  resourceId: 'S3Endpoint',
                  location: {
                    path: 'template.yaml',
                    line: 7,
                    column: 7,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static Lambda findings from terraform and cloudformation resources in the same directory', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-lambda-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-LAMBDA-1',
              service: 'lambda',
              severity: 'medium',
              source: 'iac',
              message: 'Lambda functions should use arm64 architecture when compatible to reduce running costs.',
              findings: [
                {
                  resourceId: 'aws_lambda_function.legacy',
                  location: {
                    path: 'main.tf',
                    line: 7,
                    column: 3,
                  },
                },
                {
                  resourceId: 'LegacyFunction',
                  location: {
                    path: 'template.yaml',
                    line: 10,
                    column: 7,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static CloudFront and CloudWatch findings from mixed IaC resources', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-config-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-CLOUDFRONT-1',
              service: 'cloudfront',
              severity: 'medium',
              source: 'iac',
              message: 'CloudFront distributions using PriceClass_All should be reviewed for cheaper edge coverage.',
              findings: [
                {
                  resourceId: 'aws_cloudfront_distribution.cdn',
                  location: {
                    path: 'main.tf',
                    line: 7,
                    column: 1,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-CLOUDWATCH-1',
              service: 'cloudwatch',
              severity: 'low',
              source: 'iac',
              message:
                'CloudWatch log groups should define a retention policy unless AWS manages lifecycle automatically.',
              findings: [
                {
                  resourceId: 'MissingRetentionGroup',
                  location: {
                    path: 'template.yaml',
                    line: 2,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static DynamoDB and Elastic IP findings from mixed IaC resources', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-capacity-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-DYNAMODB-2',
              service: 'dynamodb',
              severity: 'medium',
              source: 'iac',
              message: 'Provisioned-capacity DynamoDB tables should use auto-scaling.',
              findings: [
                {
                  resourceId: 'aws_dynamodb_table.logs',
                  location: {
                    path: 'main.tf',
                    line: 11,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-EC2-3',
              service: 'ec2',
              severity: 'low',
              source: 'iac',
              message: 'Elastic IP addresses should not remain unassociated.',
              findings: [
                {
                  resourceId: 'PublicAddress',
                  location: {
                    path: 'template.yaml',
                    line: 2,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static EKS and EMR findings from mixed IaC resources', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-compute-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-EKS-1',
              service: 'eks',
              severity: 'medium',
              source: 'iac',
              message: 'EKS node groups without a Graviton equivalent in use should be reviewed.',
              findings: [
                {
                  resourceId: 'aws_eks_node_group.workers',
                  location: {
                    path: 'main.tf',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-EMR-1',
              service: 'emr',
              severity: 'medium',
              source: 'iac',
              message: 'EMR clusters using previous-generation instance types should be reviewed.',
              findings: [
                {
                  resourceId: 'LegacyAnalytics',
                  location: {
                    path: 'template.yaml',
                    line: 2,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static Route 53 findings from mixed IaC resources', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-route53-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-ROUTE53-1',
              service: 'route53',
              severity: 'low',
              source: 'iac',
              message: 'Route 53 record sets should generally use TTL values of at least 3600 seconds.',
              findings: [
                {
                  resourceId: 'aws_route53_record.api',
                  location: {
                    path: 'main.tf',
                    line: 11,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-ROUTE53-2',
              service: 'route53',
              severity: 'low',
              source: 'iac',
              message: 'Route 53 health checks not associated with any DNS record should be deleted.',
              findings: [
                {
                  resourceId: 'UnusedCheck',
                  location: {
                    path: 'template.yaml',
                    line: 2,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns static S3 findings from terraform and cloudformation resources in the same directory', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/iac-s3-mixed', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [
        {
          provider: 'aws',
          rules: [
            {
              ruleId: 'CLDBRN-AWS-S3-1',
              service: 's3',
              severity: 'medium',
              source: 'iac',
              message: 'S3 buckets should define lifecycle management policies.',
              findings: [
                {
                  resourceId: 'aws_s3_bucket.missing_lifecycle',
                  location: {
                    path: 'main.tf',
                    line: 1,
                    column: 1,
                  },
                },
                {
                  resourceId: 'MissingLifecycleBucket',
                  location: {
                    path: 'template.yaml',
                    line: 2,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-S3-2',
              service: 's3',
              severity: 'medium',
              source: 'iac',
              message:
                'S3 buckets with lifecycle management should match object access patterns to the right storage class.',
              findings: [
                {
                  resourceId: 'aws_s3_bucket.expire_only',
                  location: {
                    path: 'main.tf',
                    line: 5,
                    column: 1,
                  },
                },
                {
                  resourceId: 'ExpireOnlyBucket',
                  location: {
                    path: 'template.yaml',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
            {
              ruleId: 'CLDBRN-AWS-S3-3',
              service: 's3',
              severity: 'low',
              source: 'iac',
              message: 'S3 buckets should abort incomplete multipart uploads within 7 days.',
              findings: [
                {
                  resourceId: 'aws_s3_bucket.missing_lifecycle',
                  location: {
                    path: 'main.tf',
                    line: 1,
                    column: 1,
                  },
                },
                {
                  resourceId: 'aws_s3_bucket.expire_only',
                  location: {
                    path: 'main.tf',
                    line: 5,
                    column: 1,
                  },
                },
                {
                  resourceId: 'MissingLifecycleBucket',
                  location: {
                    path: 'template.yaml',
                    line: 2,
                    column: 3,
                  },
                },
                {
                  resourceId: 'ExpireOnlyBucket',
                  location: {
                    path: 'template.yaml',
                    line: 4,
                    column: 3,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('returns an empty static scan result when terraform files have no aws resources', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/terraform/no-resources', import.meta.url));

    const result = await scanner.scanStatic(fixturePath);

    expect(result).toEqual({
      providers: [],
    });
  });

  it('passes an explicit config path through static scan config loading', async () => {
    const scanner = new CloudBurnClient();
    const fixturePath = fileURLToPath(new URL('./fixtures/terraform/no-resources', import.meta.url));
    const loadConfig = vi.spyOn(scanner, 'loadConfig').mockResolvedValue({
      discovery: {},
      iac: {},
    });

    await scanner.scanStatic(fixturePath, undefined, { configPath: '/tmp/cloudburn.yml' });

    expect(loadConfig).toHaveBeenCalledWith('/tmp/cloudburn.yml');
  });
});
