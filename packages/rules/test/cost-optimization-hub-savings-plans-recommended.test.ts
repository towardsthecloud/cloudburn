import { describe, expect, it } from 'vitest';
import { costOptimizationHubSavingsPlansRecommendedRule } from '../src/aws/costoptimizationhub/savings-plans-recommended.js';
import type { AwsCostOptimizationHubSavingsPlansRecommendation } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

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

    const purchase = (index: number) => ({
      accountId: '123456789012',
      actionType: 'PurchaseSavingsPlans',
      recommendation: {
        refreshedAt: '2026-09-03T00:00:00.000Z',
        source: 'aws-cost-optimization-hub',
        sourceDetail: 'CostExplorer',
        sourceId: `recommendation-${index}`,
      },
      resourceId: `recommendation-${index}`,
      resourceType: 'costoptimizationhub:savings-plans-recommendation',
    });
    expect(finding).toEqual({
      findings: [purchase(1), purchase(2), purchase(3)],
      message: 'Savings Plans eligible usage should use a Savings Plan when AWS recommends a purchase.',
      ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-1',
      service: 'costoptimizationhub',
      severity: 'medium',
      source: 'discovery',
    });
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
});
