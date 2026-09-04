import { describe, expect, it } from 'vitest';
import { sagemakerSavingsPlansRecommendedRule } from '../src/aws/sagemaker/savings-plans-recommended.js';
import type { AwsSageMakerSavingsPlansRecommendation } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createRecommendation = (
  overrides: Partial<AwsSageMakerSavingsPlansRecommendation> = {},
): AwsSageMakerSavingsPlansRecommendation => ({
  accountId: '123456789012',
  actionType: 'PurchaseSavingsPlans',
  currencyCode: 'USD',
  estimatedMonthlyCost: 410,
  estimatedMonthlySavings: 107.85,
  estimatedSavingsPercentage: 26,
  implementationEffort: 'VeryLow',
  lastRefreshTimestamp: '2026-09-03T00:00:00.000Z',
  paymentOption: 'NoUpfront',
  recommendationId: 'recommendation-1',
  recommendationSource: 'CostExplorer',
  restartNeeded: false,
  rollbackPossible: false,
  term: 'OneYear',
  ...overrides,
});

describe('CLDBRN-AWS-SAGEMAKER-3', () => {
  it('reports each SageMaker Savings Plans purchase recommendation once', () => {
    const recommendation = createRecommendation();
    const finding = sagemakerSavingsPlansRecommendedRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'eu-west-1',
      },
      resources: new LiveResourceBag({
        'aws-sagemaker-savings-plans-recommendations': [recommendation, recommendation],
      }),
    });

    expect(finding).toEqual({
      findings: [
        {
          accountId: '123456789012',
          resourceId: 'recommendation-1',
        },
      ],
      message: 'SageMaker usage should use a Savings Plan when AWS recommends a purchase.',
      ruleId: 'CLDBRN-AWS-SAGEMAKER-3',
      service: 'sagemaker',
      severity: 'medium',
      source: 'discovery',
    });
  });

  it('returns no finding when AWS has no SageMaker Savings Plans recommendation', () => {
    const finding = sagemakerSavingsPlansRecommendedRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'eu-west-1',
      },
      resources: new LiveResourceBag({
        'aws-sagemaker-savings-plans-recommendations': [],
      }),
    });

    expect(finding).toBeNull();
  });
});
