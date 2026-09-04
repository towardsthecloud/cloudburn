import { type AwsCostOptimizationHubIdleRecommendation, LiveResourceBag } from '@cloudburn/rules';
import { describe, expect, it, vi } from 'vitest';
import { runLiveScan } from '../src/engine/run-live.js';
import { discoverAwsResources } from '../src/providers/aws/discovery.js';

vi.mock('../src/providers/aws/discovery.js', () => ({ discoverAwsResources: vi.fn() }));

const ruleId = 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-3';
const accountId = '123456789012';
const region = 'eu-west-1';
const recommendation: AwsCostOptimizationHubIdleRecommendation = {
  accountId,
  region,
  resourceId: `arn:aws:ec2:${region}:${accountId}:volume/vol-test`,
  actionType: 'Delete',
  currentResourceType: 'EbsVolume',
  currentConfiguration: { storage: { type: 'gp3', sizeInGb: 20 } },
  recommendedConfiguration: null,
  currencyCode: 'USD',
  estimatedMonthlyCost: 20,
  estimatedMonthlySavings: 20,
  estimatedSavingsPercentage: 100,
  implementationEffort: 'Low',
  restartNeeded: false,
  rollbackPossible: false,
  recommendationId: 'rec-1',
  recommendationSource: 'ComputeOptimizer',
  lastRefreshTimestamp: '2026-09-04T00:00:00Z',
};
const run = (enabledRules: string[]) =>
  runLiveScan({ discovery: { enabledRules }, iac: {} }, { mode: 'current' }, { includeEvaluationResources: true });
const setup = (nativeAccount = accountId, nativeRegion = region, attachments: [] | [{ instanceId: string }] = []) => {
  vi.mocked(discoverAwsResources).mockResolvedValue({
    catalog: { resources: [], searchRegion: region, indexType: 'LOCAL' },
    resources: new LiveResourceBag({
      'aws-cost-optimization-hub-idle-recommendations': [recommendation],
      'aws-ebs-volumes': [
        {
          accountId: nativeAccount,
          region: nativeRegion,
          volumeId: 'vol-test',
          volumeType: 'gp3',
          sizeGiB: 20,
          attachments,
        },
      ],
    }),
  });
};
describe('idle capacity orchestration and evidence', () => {
  it('projects the complete typed recommendation through the selected registry entry', async () => {
    setup();
    const result = await run([ruleId]);
    expect(result.providers[0]?.rules[0]?.findings).toEqual([
      { accountId, region, resourceId: 'vol-test', resourceType: 'ec2:volume', actionType: 'Delete' },
    ]);
    expect(result.evaluations?.resourceSets[0]?.resources).toEqual([
      expect.objectContaining({ data: recommendation, resourceId: 'vol-test', resourceType: 'ec2:volume' }),
    ]);
  });
  it('suppresses only the enabled native unattached-volume finding for the same resource and action', async () => {
    setup();
    const result = await run([ruleId, 'CLDBRN-AWS-EBS-2']);
    expect(result.providers.flatMap((p) => p.rules).map((r) => r.ruleId)).toEqual(['CLDBRN-AWS-EBS-2']);
    expect(result.evaluations?.rules.find((r) => r.ruleId === ruleId)?.status).toBe('triggered');
  });
  it.each([
    'account',
    'region',
    'no-finding',
  ])('retains Hub evidence when native %s does not match', async (mismatch) => {
    setup(
      mismatch === 'account' ? '999999999999' : accountId,
      mismatch === 'region' ? 'us-east-1' : region,
      mismatch === 'no-finding' ? [{ instanceId: 'i-test' }] : [],
    );
    expect((await run([ruleId, 'CLDBRN-AWS-EBS-2'])).providers.flatMap((p) => p.rules).map((r) => r.ruleId)).toContain(
      ruleId,
    );
  });
  it('marks unavailable evidence not applicable and clean empty evidence passed', async () => {
    const base = {
      catalog: { resources: [], searchRegion: region, indexType: 'LOCAL' as const },
      resources: new LiveResourceBag({}),
    };
    vi.mocked(discoverAwsResources).mockResolvedValue({
      ...base,
      unavailableDatasets: new Map([['aws-cost-optimization-hub-idle-recommendations', []]]),
    });
    expect((await run([ruleId])).evaluations?.rules[0]?.status).toBe('not_applicable');
    vi.mocked(discoverAwsResources).mockResolvedValue(base);
    expect((await run([ruleId])).evaluations?.rules[0]?.status).toBe('passed');
  });
});
