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

    expect(finding).toEqual({
      findings: [
        { accountId: '123456789012', resourceId: 'recommendation-1' },
        { accountId: '123456789012', resourceId: 'recommendation-2' },
        { accountId: '123456789012', resourceId: 'recommendation-3' },
      ],
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
