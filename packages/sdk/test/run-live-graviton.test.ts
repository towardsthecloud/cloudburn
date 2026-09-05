import { LiveResourceBag } from '@cloudburn/rules';
import { expect, it, vi } from 'vitest';
import { runLiveScan } from '../src/engine/run-live.js';
import { discoverAwsResources } from '../src/providers/aws/discovery.js';

vi.mock('../src/providers/aws/discovery.js', () => ({ discoverAwsResources: vi.fn() }));

it.each([false, true])('retains full Hub evidence with native family heuristics enabled=%s', async (nativeEnabled) => {
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
  vi.mocked(discoverAwsResources).mockResolvedValue({
    catalog: { indexType: 'LOCAL', searchRegion: 'eu-west-1', resources: [] },
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
      discovery: { enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-6', ...(nativeEnabled ? ['CLDBRN-AWS-EC2-6'] : [])] },
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
            region: recommendation.region,
            arn: recommendation.resourceArn,
            resourceId: recommendation.resourceId,
            resourceType: 'ec2:instance',
            data: recommendation,
          },
        ],
      },
    ]),
  );
  expect(result.providers[0]?.rules[0]?.ruleId).toBe('CLDBRN-AWS-COSTOPTIMIZATIONHUB-6');
});

it.each([
  'CostOptimizationHubNotEnrolled',
  'CostOptimizationHubRecommendationIncomplete',
  'AccessDeniedException',
])('reports %s as unavailable rather than passed', async (code) => {
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
});
