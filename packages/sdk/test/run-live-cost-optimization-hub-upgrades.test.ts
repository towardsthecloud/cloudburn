import { type AwsCostOptimizationHubUpgradeRecommendation, LiveResourceBag } from '@cloudburn/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRuleRegistry } from '../src/engine/registry.js';
import { runLiveScan } from '../src/engine/run-live.js';
import { discoverAwsResources } from '../src/providers/aws/discovery.js';

vi.mock('../src/providers/aws/discovery.js', () => ({ discoverAwsResources: vi.fn() }));
const ruleId = 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-5';
const datasetKey = 'aws-cost-optimization-hub-upgrade-recommendations';
const accountId = '123456789012';
const region = 'eu-west-1';
const recommendation: AwsCostOptimizationHubUpgradeRecommendation = {
  accountId,
  region,
  actionType: 'Upgrade',
  resourceType: 'EbsVolume',
  resourceId: 'vol-example',
  resourceArn: `arn:aws:ec2:${region}:${accountId}:volume/vol-example`,
  recommendationId: 'rec-1',
  currencyCode: 'USD',
  estimatedMonthlyCost: 100,
  estimatedMonthlySavings: 10,
  estimatedSavingsPercentage: 10,
  implementationEffort: 'Low',
  restartNeeded: false,
  rollbackPossible: true,
  recommendationSource: 'ComputeOptimizer',
  lastRefreshTimestamp: '2026-09-04T00:00:00Z',
  currentConfiguration: { storage: { type: 'io1', sizeInGb: 100 } },
  recommendedConfiguration: { storage: { type: 'io2', sizeInGb: 100 } },
};
const catalog = { indexType: 'LOCAL' as const, resources: [], searchRegion: region };
const scan = (enabledRules = [ruleId]) =>
  runLiveScan({ discovery: { enabledRules }, iac: {} }, { mode: 'current' }, { includeEvaluationResources: true });

describe('upgrade discovery orchestration', () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([
    true,
    false,
  ])('suppresses matching EBS upgrade only when the native generation rule is enabled: %s', async (enabled) => {
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog,
      resources: new LiveResourceBag({
        [datasetKey]: [{ ...recommendation, resourceId: recommendation.resourceArn }],
        'aws-ebs-volumes': [
          { accountId, region, volumeId: 'vol-example', volumeType: 'io1', size: 100, state: 'in-use' },
        ],
      }),
    });
    const result = await scan(enabled ? [ruleId, 'CLDBRN-AWS-EBS-1'] : [ruleId]);
    expect(result.providers.flatMap((provider) => provider.rules).some((rule) => rule.ruleId === ruleId)).toBe(
      !enabled,
    );
  });
  it('keeps Hub upgrades when native generation evidence describes another resource or account', async () => {
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog,
      resources: new LiveResourceBag({
        [datasetKey]: [recommendation],
        'aws-ebs-volumes': [
          { accountId, region, volumeId: 'vol-other', volumeType: 'io1', size: 100, state: 'in-use' },
          { accountId: '999999999999', region, volumeId: 'vol-example', volumeType: 'io1', size: 100, state: 'in-use' },
        ],
      }),
    });
    expect(
      (await scan([ruleId, 'CLDBRN-AWS-EBS-1'])).providers
        .flatMap((provider) => provider.rules)
        .some((rule) => rule.ruleId === ruleId),
    ).toBe(true);
  });
  it('suppresses RDS storage upgrades without suppressing RDS instance-generation upgrades', async () => {
    const common = { ...recommendation, resourceId: 'database-example', resourceArn: undefined };
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog,
      resources: new LiveResourceBag({
        [datasetKey]: [
          {
            ...common,
            resourceType: 'RdsDbInstanceStorage',
            currentConfiguration: { storageType: 'gp2', allocatedStorageInGb: 100 },
            recommendedConfiguration: { storageType: 'gp3', allocatedStorageInGb: 100 },
          },
          {
            ...common,
            recommendationId: 'rec-2',
            resourceType: 'RdsDbInstance',
            currentConfiguration: { instance: { dbInstanceClass: 'db.m5.large' } },
            recommendedConfiguration: { instance: { dbInstanceClass: 'db.m6i.large' } },
          },
        ],
        'aws-rds-instances': [
          {
            accountId,
            region,
            dbInstanceIdentifier: 'database-example',
            dbInstanceStatus: 'available',
            engine: 'postgres',
            instanceClass: 'db.m5.large',
            multiAz: false,
            storageType: 'gp2',
          },
        ],
      }),
    });
    const hub = (await scan([ruleId, 'CLDBRN-AWS-RDS-11'])).providers
      .flatMap((provider) => provider.rules)
      .find((rule) => rule.ruleId === ruleId);
    expect(hub?.findings).toEqual([{ accountId, region, resourceId: 'database-example', resourceType: 'rds:db' }]);
  });
  it('requires opt-in and projects the full typed recommendation through evaluation resources', async () => {
    expect(buildRuleRegistry({ discovery: {}, iac: {} }, 'discovery').activeRules.map((rule) => rule.id)).not.toContain(
      ruleId,
    );
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog,
      resources: new LiveResourceBag({ [datasetKey]: [recommendation] }),
    });
    const result = await scan();
    expect(result.providers.flatMap((provider) => provider.rules)).toEqual([
      expect.objectContaining({
        ruleId,
        findings: [{ accountId, region, resourceId: 'vol-example', resourceType: 'ec2:volume' }],
      }),
    ]);
    expect(result.evaluations?.resourceSets).toEqual([
      {
        id: datasetKey,
        resources: [
          {
            accountId,
            region,
            resourceId: 'vol-example',
            resourceType: 'ec2:volume',
            arn: recommendation.resourceArn,
            data: recommendation,
          },
        ],
      },
    ]);
  });
  it.each([
    'CostOptimizationHubRecommendationIncomplete',
    'CostOptimizationHubNotEnrolled',
    'AccessDeniedException',
  ])('reports %s as unavailable, never passed', async (code) => {
    const diagnostic = {
      code,
      message: 'Evidence unavailable',
      provider: 'aws' as const,
      service: 'costoptimizationhub',
      source: 'discovery' as const,
      status: 'skipped' as const,
    };
    vi.mocked(discoverAwsResources).mockResolvedValue({
      catalog,
      resources: new LiveResourceBag(),
      unavailableDatasets: new Map([[datasetKey, [diagnostic]]]),
    });
    expect((await scan()).evaluations?.rules).toEqual([expect.objectContaining({ ruleId, status: 'not_applicable' })]);
  });
});
