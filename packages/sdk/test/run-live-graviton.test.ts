import { LiveResourceBag } from '@cloudburn/rules';
import { expect, it, vi } from 'vitest';
import { runLiveScan } from '../src/engine/run-live.js';
import { discoverAwsResources } from '../src/providers/aws/discovery.js';

vi.mock('../src/providers/aws/discovery.js', () => ({ discoverAwsResources: vi.fn() }));

const recommendation = {
  accountId: '123456789012',
  actionType: 'MigrateToGraviton' as const,
  currentResourceType: 'Ec2Instance' as const,
  currentConfiguration: { instanceType: 'm6i.large' },
  recommendedConfiguration: { instanceType: 'm7g.large' },
  workloadCompatibility: 'unclassified' as const,
  currencyCode: 'USD',
  estimatedMonthlyCost: 100,
  estimatedMonthlySavings: 20,
  estimatedSavingsPercentage: 20,
  implementationEffort: 'VeryHigh',
  lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
  recommendationId: 'rec-1',
  recommendationSource: 'ComputeOptimizer' as const,
  region: 'eu-west-1',
  resourceId: 'i-example',
  resourceArn: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-example',
  restartNeeded: true,
  rollbackPossible: true,
};

const expectedRecommendation = {
  opportunityId: '["opportunity",1,"aws","123456789012","eu-west-1","ec2:instance","i-example","MigrateToGraviton"]',
  refreshedAt: '2026-09-04T00:00:00.000Z',
  resourceKey: '["resource",1,"aws","123456789012","eu-west-1","ec2:instance","i-example"]',
  source: 'aws-cost-optimization-hub',
  sourceDetail: 'ComputeOptimizer',
  sourceId: 'rec-1',
};

it.each([false, true])(
  'prefers the normalized Hub match when native family heuristics enabled=%s',
  async (nativeEnabled) => {
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog: { indexType: 'LOCAL', searchRegion: 'eu-west-1', resources: [] },
      diagnostics: [],
      resources: new LiveResourceBag({
        'aws-cost-optimization-hub-graviton-recommendations': [recommendation],
        'aws-ec2-instances': [
          {
            accountId: recommendation.accountId,
            region: recommendation.region,
            instanceId: recommendation.resourceId,
            instanceType: 'm6i.large',
            architecture: 'x86_64',
          },
        ],
      }),
    });
    const result = await runLiveScan(
      {
        discovery: {
          enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-6', ...(nativeEnabled ? ['CLDBRN-AWS-EC2-6'] : [])],
        },
        iac: {},
      },
      { mode: 'current' },
      { includeEvaluationResources: true },
    );
    expect(result.evaluations?.resourceSets).toEqual(
      expect.arrayContaining([
        {
          id: 'aws-cost-optimization-hub-graviton-recommendations',
          resources: [
            {
              accountId: recommendation.accountId,
              actionType: 'MigrateToGraviton',
              region: recommendation.region,
              arn: recommendation.resourceArn,
              resourceId: recommendation.resourceId,
              resourceType: 'ec2:instance',
              recommendation: expectedRecommendation,
              data: recommendation,
            },
          ],
        },
      ]),
    );
    expect(result.providers[0]?.rules).toHaveLength(1);
    expect(result.providers[0]?.rules[0]?.ruleId).toBe('CLDBRN-AWS-COSTOPTIMIZATIONHUB-6');
    expect(result.providers[0]?.rules[0]?.findings).toEqual([
      expect.objectContaining({
        actionType: 'MigrateToGraviton',
        resourceId: 'i-example',
        resourceType: 'ec2:instance',
        recommendation: expectedRecommendation,
      }),
    ]);
  },
);

it('keeps ECS and EKS Graviton findings distinct from the Hub EC2 opportunity', async () => {
  vi.mocked(discoverAwsResources).mockResolvedValue({
    catalog: { indexType: 'LOCAL', searchRegion: 'eu-west-1', resources: [] },
    diagnostics: [],
    resources: new LiveResourceBag({
      'aws-cost-optimization-hub-graviton-recommendations': [recommendation],
      'aws-ec2-instances': [
        {
          accountId: recommendation.accountId,
          region: recommendation.region,
          instanceId: recommendation.resourceId,
          instanceType: 'm6i.large',
          architecture: 'x86_64',
        },
      ],
      'aws-ecs-container-instances': [
        {
          accountId: recommendation.accountId,
          region: recommendation.region,
          clusterArn: 'arn:aws:ecs:eu-west-1:123456789012:cluster/production',
          containerInstanceArn: 'arn:aws:ecs:eu-west-1:123456789012:container-instance/production/abc123',
          instanceType: 'm6i.large',
          architecture: 'x86_64',
        },
      ],
      'aws-eks-nodegroups': [
        {
          accountId: recommendation.accountId,
          region: recommendation.region,
          clusterArn: 'arn:aws:eks:eu-west-1:123456789012:cluster/production',
          clusterName: 'production',
          instanceTypes: ['m6i.large'],
          nodegroupArn: 'arn:aws:eks:eu-west-1:123456789012:nodegroup/production/workers/abc123',
          nodegroupName: 'workers',
        },
      ],
    }),
  });
  const result = await runLiveScan(
    {
      discovery: {
        enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-6', 'CLDBRN-AWS-EC2-6', 'CLDBRN-AWS-ECS-1', 'CLDBRN-AWS-EKS-1'],
      },
      iac: {},
    },
    { mode: 'current' },
  );
  const ruleIds = result.providers[0]?.rules.map((entry) => entry.ruleId);
  expect(ruleIds).toEqual(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-6', 'CLDBRN-AWS-ECS-1', 'CLDBRN-AWS-EKS-1']);
  const ecsFinding = result.providers[0]?.rules.find((entry) => entry.ruleId === 'CLDBRN-AWS-ECS-1');
  expect(ecsFinding?.findings).toEqual([
    expect.objectContaining({
      actionType: 'MigrateToGraviton',
      resourceType: 'ecs:container-instance',
      recommendation: expect.objectContaining({ source: 'cloudburn' }),
    }),
  ]);
});

it('falls back to the native finding when Hub evidence is absent', async () => {
  vi.mocked(discoverAwsResources).mockResolvedValue({
    catalog: { indexType: 'LOCAL', searchRegion: 'eu-west-1', resources: [] },
    diagnostics: [],
    resources: new LiveResourceBag({
      'aws-cost-optimization-hub-graviton-recommendations': [],
      'aws-ec2-instances': [
        {
          accountId: recommendation.accountId,
          region: recommendation.region,
          instanceId: recommendation.resourceId,
          instanceType: 'm6i.large',
          architecture: 'x86_64',
        },
      ],
    }),
  });
  const result = await runLiveScan(
    {
      discovery: { enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-6', 'CLDBRN-AWS-EC2-6'] },
      iac: {},
    },
    { mode: 'current' },
  );
  expect(result.providers[0]?.rules).toHaveLength(1);
  expect(result.providers[0]?.rules[0]?.ruleId).toBe('CLDBRN-AWS-EC2-6');
  expect(result.providers[0]?.rules[0]?.findings).toEqual([
    expect.objectContaining({
      actionType: 'MigrateToGraviton',
      resourceId: 'i-example',
      resourceType: 'ec2:instance',
      recommendation: expect.objectContaining({ source: 'cloudburn' }),
    }),
  ]);
});

it.each(['CostOptimizationHubNotEnrolled', 'CostOptimizationHubRecommendationIncomplete', 'AccessDeniedException'])(
  'reports %s as unavailable rather than passed',
  async (code) => {
    const diagnostic = {
      code,
      message: 'Hub evidence unavailable',
      provider: 'aws' as const,
      service: 'costoptimizationhub',
      source: 'discovery' as const,
      status: 'skipped' as const,
    };
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog: { indexType: 'LOCAL', searchRegion: 'eu-west-1', resources: [] },
      resources: new LiveResourceBag({}),
      diagnostics: [diagnostic],
      unavailableDatasets: new Map([['aws-cost-optimization-hub-graviton-recommendations', [diagnostic]]]),
    });
    const result = await runLiveScan(
      { discovery: { enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-6'] }, iac: {} },
      { mode: 'current' },
      { includeEvaluationResources: true },
    );
    expect(result.providers).toEqual([]);
    expect(result.diagnostics).toContainEqual(diagnostic);
    expect(result.evaluations?.rules).toEqual([
      expect.objectContaining({ ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-6', status: 'not_applicable' }),
    ]);
  },
);
