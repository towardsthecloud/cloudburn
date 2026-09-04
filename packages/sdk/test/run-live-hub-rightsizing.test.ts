import { LiveResourceBag } from '@cloudburn/rules';
import { beforeEach, expect, it, vi } from 'vitest';
import { runLiveScan } from '../src/engine/run-live.js';
import { discoverAwsResources } from '../src/providers/aws/discovery.js';

vi.mock('../src/providers/aws/discovery.js', () => ({ discoverAwsResources: vi.fn() }));
const accountId = '123456789012';
const region = 'eu-west-1';
const resourceId = `arn:aws:lambda:${region}:${accountId}:function:example`;
const recommendation = {
  accountId,
  region,
  resourceId,
  resourceArn: resourceId,
  recommendationId: 'rec-1',
  actionType: 'Rightsize' as const,
  resourceType: 'LambdaFunction' as const,
  currencyCode: 'USD',
  estimatedMonthlyCost: 100,
  estimatedMonthlySavings: 50,
  estimatedSavingsPercentage: 50,
  recommendationSource: 'ComputeOptimizer' as const,
  lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
  currentConfiguration: { compute: { memorySizeInMB: 1024 } },
  recommendedConfiguration: { compute: { memorySizeInMB: 512 } },
};
beforeEach(() => vi.resetAllMocks());
it('keeps rightsizing alongside a generation or architecture policy for the same function', async () => {
  vi.mocked(discoverAwsResources).mockResolvedValue({
    catalog: { resources: [], indexType: 'LOCAL', searchRegion: region },
    resources: new LiveResourceBag({
      'aws-cost-optimization-hub-rightsizing-recommendations': [recommendation],
      'aws-lambda-functions': [
        { functionName: 'example', functionArn: resourceId, accountId, region, architectures: ['x86_64'] },
      ],
    }),
  });
  const result = await runLiveScan(
    { discovery: { enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-4', 'CLDBRN-AWS-LAMBDA-1'] }, iac: {} },
    { mode: 'current' },
  );
  expect(result.providers.flatMap((provider) => provider.rules.map((rule) => rule.ruleId))).toEqual(
    expect.arrayContaining(['CLDBRN-AWS-COSTOPTIMIZATIONHUB-4', 'CLDBRN-AWS-LAMBDA-1']),
  );
});
it.each([
  { functionArn: `${resourceId}-other`, accountId, region },
  { functionArn: resourceId, accountId: '999999999999', region },
  { functionArn: resourceId, accountId, region: 'us-east-1' },
])('keeps a Hub recommendation when the native identity differs: %j', async (native) => {
  vi.mocked(discoverAwsResources).mockResolvedValue({
    catalog: { resources: [], indexType: 'LOCAL', searchRegion: region },
    resources: new LiveResourceBag({
      'aws-cost-optimization-hub-rightsizing-recommendations': [recommendation],
      'aws-lambda-functions': [],
      'aws-lambda-memory-recommendations': [native],
    }),
  });
  const result = await runLiveScan(
    { discovery: { enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-4', 'CLDBRN-AWS-LAMBDA-4'] }, iac: {} },
    { mode: 'current' },
  );
  expect(result.providers.flatMap((provider) => provider.rules.map((rule) => rule.ruleId))).toContain(
    'CLDBRN-AWS-COSTOPTIMIZATIONHUB-4',
  );
});
it.each([
  'CostOptimizationHubNotEnrolled',
  'AccessDeniedException',
  'CostOptimizationHubRecommendationIncomplete',
])('projects %s as not applicable', async (code) => {
  const diagnostic = {
    code,
    message: 'Hub evidence unavailable',
    provider: 'aws' as const,
    service: 'costoptimizationhub',
    source: 'discovery' as const,
    status: 'skipped' as const,
  };
  vi.mocked(discoverAwsResources).mockResolvedValue({
    catalog: { resources: [], indexType: 'LOCAL', searchRegion: region },
    resources: new LiveResourceBag(),
    diagnostics: [diagnostic],
    unavailableDatasets: new Map([['aws-cost-optimization-hub-rightsizing-recommendations', [diagnostic]]]),
  });
  const result = await runLiveScan(
    { discovery: { enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-4'] }, iac: {} },
    { mode: 'current' },
    { includeEvaluationResources: true },
  );
  expect(result.providers).toEqual([]);
  expect(result.evaluations?.rules).toEqual([
    expect.objectContaining({ ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-4', status: 'not_applicable' }),
  ]);
  expect(result.diagnostics).toContainEqual(diagnostic);
});
it('reports enrolled accounts without recommendations as passed', async () => {
  vi.mocked(discoverAwsResources).mockResolvedValue({
    catalog: { resources: [], indexType: 'LOCAL', searchRegion: region },
    resources: new LiveResourceBag({ 'aws-cost-optimization-hub-rightsizing-recommendations': [] }),
  });
  const result = await runLiveScan(
    { discovery: { enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-4'] }, iac: {} },
    { mode: 'current' },
    { includeEvaluationResources: true },
  );
  expect(result.evaluations?.rules).toEqual([expect.objectContaining({ status: 'passed' })]);
});
it.each([
  false,
  true,
])('projects both configurations and suppresses only enabled stronger native evidence (enabled=%s)', async (enabled) => {
  vi.mocked(discoverAwsResources).mockResolvedValue({
    catalog: { resources: [], indexType: 'LOCAL', searchRegion: region },
    resources: new LiveResourceBag({
      'aws-cost-optimization-hub-rightsizing-recommendations': [recommendation],
      'aws-lambda-functions': [],
      'aws-lambda-memory-recommendations': [{ functionArn: resourceId, accountId, region }],
    }),
  });
  const result = await runLiveScan(
    {
      discovery: { enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-4', ...(enabled ? ['CLDBRN-AWS-LAMBDA-4'] : [])] },
      iac: {},
    },
    { mode: 'current' },
    { includeEvaluationResources: true },
  );
  expect(result.providers.flatMap((provider) => provider.rules.map((rule) => rule.ruleId))).toEqual([
    enabled ? 'CLDBRN-AWS-LAMBDA-4' : 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-4',
  ]);
  expect(result.evaluations?.resourceSets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'aws-cost-optimization-hub-rightsizing-recommendations',
        resources: [expect.objectContaining({ resourceId, resourceType: 'lambda:function', data: recommendation })],
      }),
    ]),
  );
});
