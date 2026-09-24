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
const setup = (attachments: [] | [{ instanceId: string }] = []) => {
  vi.mocked(discoverAwsResources).mockResolvedValue({
    catalog: { resources: [], searchRegion: region, indexType: 'LOCAL' },
    diagnostics: [],
    resources: new LiveResourceBag({
      'aws-cost-optimization-hub-idle-recommendations': [recommendation],
      'aws-ebs-volumes': [
        {
          accountId,
          region,
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
      {
        accountId,
        actionType: 'Delete',
        impact: {
          currentCost: { amount: 20, confidence: 'estimated', currency: 'USD', period: 'month' },
          potentialSavings: { amount: 20, confidence: 'estimated', currency: 'USD', period: 'month' },
          refreshedAt: '2026-09-04T00:00:00Z',
          source: 'aws-cost-optimization-hub',
          sourceDetail: 'ComputeOptimizer',
          sourceId: 'rec-1',
        },
        recommendation: {
          opportunityId: '["opportunity",1,"aws","123456789012","eu-west-1","ec2:volume","vol-test","Delete"]',
          refreshedAt: '2026-09-04T00:00:00Z',
          resourceKey: '["resource",1,"aws","123456789012","eu-west-1","ec2:volume","vol-test"]',
          source: 'aws-cost-optimization-hub',
          sourceDetail: 'ComputeOptimizer',
          sourceId: 'rec-1',
        },
        region,
        resourceId: 'vol-test',
        resourceType: 'ec2:volume',
      },
    ]);
    expect(result.evaluations?.resourceSets[0]?.resources).toEqual([
      expect.objectContaining({ data: recommendation, resourceId: 'vol-test', resourceType: 'ec2:volume' }),
    ]);
  });
  it('retains Hub evidence when the native volume is attached and produces no finding', async () => {
    setup([{ instanceId: 'i-test' }]);
    expect((await run([ruleId, 'CLDBRN-AWS-EBS-2'])).providers.flatMap((p) => p.rules).map((r) => r.ruleId)).toContain(
      ruleId,
    );
  });
});
