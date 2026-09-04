import { describe, expect, it } from 'vitest';
import { sagemakerSavingsPlansCoverageRule } from '../src/aws/sagemaker/savings-plans-coverage.js';
import type {
  AwsCostOptimizationHubSavingsPlansRecommendation,
  AwsSageMakerSavingsPlansCoverage,
} from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const coverage = (overrides: Partial<AwsSageMakerSavingsPlansCoverage> = {}): AwsSageMakerSavingsPlansCoverage => ({
  accountId: '123456789012',
  coveragePercentage: 60,
  onDemandCost: 100,
  periodEnd: '2026-09-03',
  periodStart: '2026-08-04',
  spendCoveredBySavingsPlans: 150,
  totalCost: 250,
  ...overrides,
});

const sageMakerRecommendation = (): AwsCostOptimizationHubSavingsPlansRecommendation => ({
  accountId: '123456789012',
  accountScope: 'LINKED',
  actionType: 'PurchaseSavingsPlans',
  currencyCode: 'USD',
  estimatedMonthlyCost: 410,
  estimatedMonthlySavings: 107.85,
  estimatedSavingsPercentage: 26,
  hourlyCommitment: 0.42,
  lastRefreshTimestamp: '2026-09-03T00:00:00.000Z',
  paymentOption: 'NoUpfront',
  recommendationId: 'recommendation-1',
  recommendationSource: 'CostExplorer',
  savingsPlansType: 'SageMakerSavingsPlans',
  term: 'OneYear',
});

const evaluate = (
  coverageRecords: AwsSageMakerSavingsPlansCoverage[],
  recommendations: AwsCostOptimizationHubSavingsPlansRecommendation[] = [],
) =>
  sagemakerSavingsPlansCoverageRule.evaluateLive?.({
    catalog: {
      indexType: 'LOCAL',
      resources: [],
      searchRegion: 'eu-west-1',
    },
    resources: new LiveResourceBag({
      'aws-cost-optimization-hub-savings-plans-recommendations': recommendations,
      'aws-sagemaker-savings-plans-coverage': coverageRecords,
    }),
  });

describe('CLDBRN-AWS-SAGEMAKER-3', () => {
  it('reports low coverage when uncovered 30-day On-Demand cost is material', () => {
    expect(evaluate([coverage()])).toEqual({
      findings: [
        {
          accountId: '123456789012',
          resourceId: '123456789012',
        },
      ],
      message:
        'SageMaker Savings Plans eligible usage should maintain at least 80% coverage when uncovered On-Demand cost is material.',
      ruleId: 'CLDBRN-AWS-SAGEMAKER-3',
      service: 'sagemaker',
      severity: 'medium',
      source: 'discovery',
    });
  });

  it.each([
    ['coverage meets the threshold', coverage({ coveragePercentage: 80 })],
    ['uncovered cost is below the materiality threshold', coverage({ onDemandCost: 71.99 })],
  ])('returns no finding when %s', (_reason, record) => {
    expect(evaluate([record])).toBeNull();
  });

  it('defers to a SageMaker purchase recommendation from Cost Optimization Hub', () => {
    expect(evaluate([coverage()], [sageMakerRecommendation()])).toBeNull();
  });

  it('still reports the coverage gap when only another Savings Plans type is recommended', () => {
    expect(
      evaluate([coverage()], [{ ...sageMakerRecommendation(), savingsPlansType: 'ComputeSavingsPlans' }]),
    ).not.toBeNull();
  });

  it('does not suppress coverage for a different account', () => {
    expect(evaluate([coverage()], [{ ...sageMakerRecommendation(), accountId: '210987654321' }])).not.toBeNull();
  });
});
