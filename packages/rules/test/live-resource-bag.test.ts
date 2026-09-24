import { describe, expect, it } from 'vitest';
import { LiveResourceBag } from '../src/index.js';

describe('LiveResourceBag', () => {
  it('creates a derived bag without unavailable datasets', () => {
    const bag = new LiveResourceBag({
      'aws-cost-optimization-hub-savings-plans-recommendations': [
        {
          accountId: '123456789012',
          accountScope: 'LINKED',
          actionType: 'PurchaseSavingsPlans',
          currencyCode: 'USD',
          estimatedMonthlyCost: 200,
          estimatedMonthlySavings: 50,
          estimatedSavingsPercentage: 25,
          hourlyCommitment: 0.25,
          lastRefreshTimestamp: '2026-09-03T00:00:00.000Z',
          paymentOption: 'NoUpfront',
          recommendationId: 'recommendation-1',
          recommendationSource: 'CostExplorer',
          savingsPlansType: 'SageMakerSavingsPlans',
          term: 'OneYear',
        },
      ],
    });

    const derived = bag.without(['aws-cost-optimization-hub-savings-plans-recommendations']);

    expect(derived.get('aws-cost-optimization-hub-savings-plans-recommendations')).toEqual([]);
    expect(bag.get('aws-cost-optimization-hub-savings-plans-recommendations')).toHaveLength(1);
  });
});
