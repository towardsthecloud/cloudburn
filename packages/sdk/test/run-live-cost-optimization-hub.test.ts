import { LiveResourceBag } from '@cloudburn/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runLiveScan } from '../src/engine/run-live.js';
import { discoverAwsResources } from '../src/providers/aws/discovery.js';

vi.mock('../src/providers/aws/discovery.js', () => ({
  discoverAwsResources: vi.fn(),
}));

const mockedDiscoverAwsResources = vi.mocked(discoverAwsResources);
const accountId = '123456789012';
const region = 'eu-west-1';
const reservationRecommendation = {
  accountId,
  actionType: 'PurchaseReservedInstances' as const,
  configuration: {
    accountScope: 'LINKED',
    databaseEngine: 'postgres',
    instanceType: 'db.r7g.large',
    numberOfInstancesToPurchase: 1,
    paymentOption: 'NoUpfront',
    reservedInstancesRegion: region,
    service: 'AmazonRDS',
    term: 'OneYear',
  },
  currencyCode: 'USD',
  estimatedMonthlyCost: 200,
  estimatedMonthlySavings: 50,
  estimatedSavingsPercentage: 25,
  implementationEffort: 'VeryLow',
  lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
  recommendationId: 'recommendation-1',
  recommendationSource: 'CostExplorer' as const,
  region,
  reservationType: 'RdsReservedInstances' as const,
  resourceArn: `arn:aws:rds:${region}:${accountId}:db:orders`,
  resourceId: 'orders',
  restartNeeded: false,
  rollbackPossible: false,
};

const discoveryCatalog = {
  indexType: 'LOCAL' as const,
  resources: [],
  searchRegion: region,
};

describe('Cost Optimization Hub reservation orchestration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('aligns provisional counts with deduplicated findings while retaining raw evaluation counts', async () => {
    const volume = { accountId, region, volumeId: 'vol-duplicate', volumeType: 'gp3', sizeGiB: 20, attachments: [] };
    const context = {
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({ 'aws-ebs-volumes': [volume, volume] }),
      diagnostics: [],
    };
    mockedDiscoverAwsResources.mockImplementation(async (rules, _target, options) => {
      for (const rule of rules) options?.onRuleReady?.(rule, context);
      return context;
    });
    const events: unknown[] = [];
    const result = await runLiveScan(
      { discovery: { enabledRules: ['CLDBRN-AWS-EBS-2'] }, iac: {} },
      { mode: 'current' },
      { includeEvaluationResources: true, onProgress: (event) => events.push(event) },
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: 'rule',
        ruleId: 'CLDBRN-AWS-EBS-2',
        findingCount: 1,
        findings: [expect.objectContaining({ resourceId: 'vol-duplicate' })],
      }),
    );
    expect(result.evaluations?.rules[0]).toMatchObject({ findingCount: 2 });
    expect(result.providers[0]?.rules[0]?.findings).toHaveLength(1);
  });

  it('keeps a Hub finding when a matching native rule only exists in the catalog and projects full evidence', async () => {
    const arnIdentifiedRecommendation = {
      ...reservationRecommendation,
      region: undefined,
      resourceId: undefined,
    };
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-cost-optimization-hub-reservation-recommendations': [arnIdentifiedRecommendation],
      }),
      diagnostics: [],
    });

    const result = await runLiveScan(
      { discovery: { enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-2'] }, iac: {} },
      { mode: 'current' },
      { includeEvaluationResources: true },
    );

    const expectedRecommendation = {
      opportunityId: '["opportunity",1,"aws","123456789012","eu-west-1","rds:db","orders","PurchaseReservedInstances"]',
      refreshedAt: '2026-09-04T00:00:00.000Z',
      resourceKey: '["resource",1,"aws","123456789012","eu-west-1","rds:db","orders"]',
      source: 'aws-cost-optimization-hub',
      sourceDetail: 'CostExplorer',
      sourceId: 'recommendation-1',
    };
    const expectedImpact = {
      currentCost: { amount: 200, confidence: 'estimated', currency: 'USD', period: 'month' },
      potentialSavings: { amount: 50, confidence: 'estimated', currency: 'USD', period: 'month' },
      refreshedAt: '2026-09-04T00:00:00.000Z',
      source: 'aws-cost-optimization-hub',
      sourceDetail: 'CostExplorer',
      sourceId: 'recommendation-1',
    };
    expect(result.providers).toEqual([
      expect.objectContaining({
        rules: [
          expect.objectContaining({
            findings: [
              {
                accountId,
                actionType: 'PurchaseReservedInstances',
                impact: expectedImpact,
                recommendation: expectedRecommendation,
                region,
                resourceId: 'orders',
                resourceType: 'rds:db',
              },
            ],
            ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-2',
          }),
        ],
      }),
    ]);
    expect(result.evaluations).toEqual({
      resourceSets: [
        {
          id: 'aws-cost-optimization-hub-reservation-recommendations',
          resources: [
            {
              accountId,
              actionType: 'PurchaseReservedInstances',
              arn: reservationRecommendation.resourceArn,
              data: { ...arnIdentifiedRecommendation, region },
              impact: expectedImpact,
              recommendation: expectedRecommendation,
              region,
              resourceId: 'orders',
              resourceType: 'rds:db',
            },
          ],
        },
      ],
      rules: [
        expect.objectContaining({
          findingCount: 1,
          resourceSetId: 'aws-cost-optimization-hub-reservation-recommendations',
          ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-2',
          status: 'triggered',
        }),
      ],
    });
  });

  it('suppresses the Hub duplicate only when an enabled native rule reports the same resource and action', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-cost-optimization-hub-reservation-recommendations': [reservationRecommendation],
        'aws-rds-instances': [
          {
            accountId,
            dbInstanceIdentifier: 'orders',
            dbInstanceStatus: 'available',
            engine: 'postgres',
            instanceClass: 'db.r7g.large',
            instanceCreateTime: '2025-01-01T00:00:00.000Z',
            multiAz: false,
            region,
          },
        ],
        'aws-rds-reserved-instances': [],
      }),
      diagnostics: [],
    });

    const result = await runLiveScan(
      {
        discovery: { enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-2', 'CLDBRN-AWS-RDS-3'] },
        iac: {},
      },
      { mode: 'current' },
      { includeEvaluationResources: true },
    );

    expect(result.providers.flatMap((provider) => provider.rules.map((rule) => rule.ruleId))).toEqual([
      'CLDBRN-AWS-RDS-3',
    ]);
    expect(result.evaluations?.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          findingCount: 1,
          ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-2',
          status: 'triggered',
        }),
        expect.objectContaining({ findingCount: 1, ruleId: 'CLDBRN-AWS-RDS-3', status: 'triggered' }),
      ]),
    );
  });

  it('suppresses an ARN-only Hub recommendation when native evidence uses the service identifier', async () => {
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-cost-optimization-hub-reservation-recommendations': [
          { ...reservationRecommendation, resourceId: undefined },
        ],
        'aws-rds-instances': [
          {
            accountId,
            dbInstanceIdentifier: 'orders',
            dbInstanceStatus: 'available',
            engine: 'postgres',
            instanceClass: 'db.r7g.large',
            instanceCreateTime: '2025-01-01T00:00:00.000Z',
            multiAz: false,
            region,
          },
        ],
        'aws-rds-reserved-instances': [],
      }),
      diagnostics: [],
    });

    const result = await runLiveScan(
      {
        discovery: { enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-2', 'CLDBRN-AWS-RDS-3'] },
        iac: {},
      },
      { mode: 'current' },
    );

    expect(result.providers.flatMap((provider) => provider.rules.map((rule) => rule.ruleId))).toEqual([
      'CLDBRN-AWS-RDS-3',
    ]);
  });

  it('does not suppress for a different resource or a native finding with a different action', async () => {
    const ec2Recommendation = {
      ...reservationRecommendation,
      configuration: {
        accountScope: 'LINKED',
        instanceType: 'm7i.large',
        paymentOption: 'NoUpfront',
        term: 'OneYear',
      },
      recommendationId: 'recommendation-2',
      reservationType: 'Ec2ReservedInstances' as const,
      resourceId: 'reservation-current',
    };
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-cost-optimization-hub-reservation-recommendations': [reservationRecommendation, ec2Recommendation],
        'aws-ec2-reserved-instances': [
          {
            accountId,
            endTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            instanceType: 'm7i.large',
            region,
            reservedInstancesId: 'reservation-current',
            state: 'active',
          },
        ],
        'aws-rds-instances': [
          {
            accountId,
            dbInstanceIdentifier: 'other-database',
            dbInstanceStatus: 'available',
            engine: 'postgres',
            instanceClass: 'db.r7g.large',
            instanceCreateTime: '2025-01-01T00:00:00.000Z',
            multiAz: false,
            region,
          },
        ],
        'aws-rds-reserved-instances': [],
      }),
      diagnostics: [],
    });

    const result = await runLiveScan(
      {
        discovery: {
          enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-2', 'CLDBRN-AWS-EC2-7', 'CLDBRN-AWS-RDS-3'],
        },
        iac: {},
      },
      { mode: 'current' },
    );

    const hubFinding = result.providers
      .flatMap((provider) => provider.rules)
      .find((rule) => rule.ruleId === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-2');
    expect(hubFinding?.findings.map((finding) => finding.resourceId)).toEqual(['orders', 'reservation-current']);
  });

  it('does not suppress the same resource ID from a different service namespace', async () => {
    const elastiCacheRecommendation = {
      ...reservationRecommendation,
      configuration: {
        accountScope: 'LINKED',
        instanceType: 'cache.r7g.large',
        numberOfInstancesToPurchase: 1,
        paymentOption: 'NoUpfront',
        reservedInstancesRegion: region,
        service: 'AmazonElastiCache',
        term: 'OneYear',
      },
      recommendationId: 'recommendation-2',
      reservationType: 'ElastiCacheReservedInstances' as const,
      resourceArn: undefined,
    };
    mockedDiscoverAwsResources.mockResolvedValue({
      catalog: discoveryCatalog,
      resources: new LiveResourceBag({
        'aws-cost-optimization-hub-reservation-recommendations': [elastiCacheRecommendation],
        'aws-rds-instances': [
          {
            accountId,
            dbInstanceIdentifier: 'orders',
            dbInstanceStatus: 'available',
            engine: 'postgres',
            instanceClass: 'db.r7g.large',
            instanceCreateTime: '2025-01-01T00:00:00.000Z',
            multiAz: false,
            region,
          },
        ],
        'aws-rds-reserved-instances': [],
      }),
      diagnostics: [],
    });

    const result = await runLiveScan(
      {
        discovery: { enabledRules: ['CLDBRN-AWS-COSTOPTIMIZATIONHUB-2', 'CLDBRN-AWS-RDS-3'] },
        iac: {},
      },
      { mode: 'current' },
    );

    expect(
      result.providers
        .flatMap((provider) => provider.rules)
        .find((rule) => rule.ruleId === 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-2')?.findings,
    ).toEqual([
      {
        accountId,
        actionType: 'PurchaseReservedInstances',
        impact: {
          currentCost: { amount: 200, confidence: 'estimated', currency: 'USD', period: 'month' },
          potentialSavings: { amount: 50, confidence: 'estimated', currency: 'USD', period: 'month' },
          refreshedAt: '2026-09-04T00:00:00.000Z',
          source: 'aws-cost-optimization-hub',
          sourceDetail: 'CostExplorer',
          sourceId: 'recommendation-2',
        },
        recommendation: {
          opportunityId:
            '["opportunity",1,"aws","123456789012","eu-west-1","elasticache:cluster","orders","PurchaseReservedInstances"]',
          refreshedAt: '2026-09-04T00:00:00.000Z',
          resourceKey: '["resource",1,"aws","123456789012","eu-west-1","elasticache:cluster","orders"]',
          source: 'aws-cost-optimization-hub',
          sourceDetail: 'CostExplorer',
          sourceId: 'recommendation-2',
        },
        region,
        resourceId: 'orders',
        resourceType: 'elasticache:cluster',
      },
    ]);
  });
});
