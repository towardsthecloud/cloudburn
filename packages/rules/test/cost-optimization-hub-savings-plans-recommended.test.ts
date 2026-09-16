import { describe, expect, it } from 'vitest';
import { costOptimizationHubSavingsPlansRecommendedRule } from '../src/aws/costoptimizationhub/savings-plans-recommended.js';
import type { AwsCostOptimizationHubSavingsPlansRecommendation } from '../src/index.js';
import { createAwsCostOptimizationHubFindingMatch, LiveResourceBag } from '../src/index.js';

const createRecommendation = (
  overrides: Partial<AwsCostOptimizationHubSavingsPlansRecommendation> = {},
): AwsCostOptimizationHubSavingsPlansRecommendation => ({
  accountId: '123456789012',
  accountScope: 'LINKED',
  actionType: 'PurchaseSavingsPlans',
  currencyCode: 'USD',
  estimatedMonthlyCost: 410,
  estimatedMonthlySavings: 107.85,
  estimatedSavingsPercentage: 26,
  hourlyCommitment: 0.42,
  implementationEffort: 'VeryLow',
  lastRefreshTimestamp: '2026-09-03T00:00:00.000Z',
  paymentOption: 'NoUpfront',
  recommendationId: 'recommendation-1',
  recommendationSource: 'CostExplorer',
  restartNeeded: false,
  rollbackPossible: false,
  savingsPlansType: 'ComputeSavingsPlans',
  term: 'OneYear',
  ...overrides,
});

describe('CLDBRN-AWS-COSTOPTIMIZATIONHUB-1', () => {
  it('reports Compute, EC2 Instance, and SageMaker Savings Plans purchase recommendations once', () => {
    const compute = createRecommendation();
    const ec2 = createRecommendation({
      instanceFamily: 'm7i',
      recommendationId: 'recommendation-2',
      savingsPlansRegion: 'eu-west-1',
      savingsPlansType: 'Ec2InstanceSavingsPlans',
    });
    const sageMaker = createRecommendation({
      recommendationId: 'recommendation-3',
      savingsPlansType: 'SageMakerSavingsPlans',
    });
    const finding = costOptimizationHubSavingsPlansRecommendedRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'eu-west-1',
      },
      resources: new LiveResourceBag({
        'aws-cost-optimization-hub-savings-plans-recommendations': [compute, ec2, sageMaker, sageMaker],
      }),
    });

    const purchase = (index: number, savingsPlansType: string) => ({
      accountId: '123456789012',
      actionType: 'PurchaseSavingsPlans',
      impact: {
        currentCost: { amount: 410, confidence: 'estimated', currency: 'USD', period: 'month' },
        potentialSavings: { amount: 107.85, confidence: 'estimated', currency: 'USD', period: 'month' },
        refreshedAt: '2026-09-03T00:00:00.000Z',
        source: 'aws-cost-optimization-hub',
        sourceDetail: 'CostExplorer',
        sourceId: `recommendation-${index}`,
      },
      recommendation: {
        refreshedAt: '2026-09-03T00:00:00.000Z',
        source: 'aws-cost-optimization-hub',
        sourceDetail: 'CostExplorer',
        sourceId: `recommendation-${index}`,
      },
      resourceId: `recommendation-${index}`,
      resourceType: `costoptimizationhub:savings-plans-recommendation:${savingsPlansType}`,
    });
    expect(finding).toEqual({
      findings: [
        purchase(1, 'ComputeSavingsPlans'),
        purchase(2, 'Ec2InstanceSavingsPlans'),
        purchase(3, 'SageMakerSavingsPlans'),
      ],
      message: 'Savings Plans eligible usage should use a Savings Plan when AWS recommends a purchase.',
      ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-1',
      service: 'costoptimizationhub',
      severity: 'medium',
      source: 'discovery',
    });
  });

  it('preserves different purchase types sharing the same source ID and scope', () => {
    const recommendations = [
      createRecommendation({ savingsPlansType: 'ComputeSavingsPlans', region: 'eu-west-1' }),
      createRecommendation({ savingsPlansType: 'Ec2InstanceSavingsPlans', region: 'eu-west-1' }),
      createRecommendation({ savingsPlansType: 'SageMakerSavingsPlans', region: 'eu-west-1' }),
    ];
    const evaluate = (items: AwsCostOptimizationHubSavingsPlansRecommendation[]) =>
      costOptimizationHubSavingsPlansRecommendedRule.evaluateLive?.({
        catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'eu-west-1' },
        resources: new LiveResourceBag({ 'aws-cost-optimization-hub-savings-plans-recommendations': items }),
      });
    const result = evaluate([
      ...recommendations,
      recommendations[0] as AwsCostOptimizationHubSavingsPlansRecommendation,
    ]);
    expect(result?.findings).toHaveLength(3);
    expect(result?.findings.map((match) => match.resourceType)).toEqual([
      'costoptimizationhub:savings-plans-recommendation:ComputeSavingsPlans',
      'costoptimizationhub:savings-plans-recommendation:Ec2InstanceSavingsPlans',
      'costoptimizationhub:savings-plans-recommendation:SageMakerSavingsPlans',
    ]);
    for (const match of result?.findings ?? []) {
      expect(match.recommendation?.sourceId).toBe('recommendation-1');
      expect(match.recommendation?.opportunityId).toBeUndefined();
    }
    expect(evaluate([...recommendations].reverse())).toEqual(result);
  });

  it('returns no finding when AWS has no Savings Plans purchase recommendation', () => {
    const finding = costOptimizationHubSavingsPlansRecommendedRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'eu-west-1',
      },
      resources: new LiveResourceBag({
        'aws-cost-optimization-hub-savings-plans-recommendations': [],
      }),
    });

    expect(finding).toBeNull();
  });

  it.each([
    { costWindow: 30, expected: { lookbackDays: 30 } },
    { costWindow: undefined, expected: undefined },
    { costWindow: 0, expected: undefined },
    { costWindow: Number.NaN, expected: undefined },
  ])('uses only the cost-calculation window for impact: $costWindow', ({ costWindow, expected }) => {
    const impact = createAwsCostOptimizationHubFindingMatch(
      createRecommendation({
        recommendationLookbackPeriodInDays: 14,
        costCalculationLookbackPeriodInDays: costWindow,
      }),
    ).impact;
    expect(impact?.window).toEqual(expected);
    expect(impact?.potentialSavings).toMatchObject({ amount: 107.85, currency: 'USD', period: 'month' });
  });
});
