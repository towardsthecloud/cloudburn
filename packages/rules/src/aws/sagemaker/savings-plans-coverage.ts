import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

export const AWS_SAGEMAKER_SAVINGS_PLANS_MINIMUM_COVERAGE_PERCENTAGE = 80;
export const AWS_SAGEMAKER_SAVINGS_PLANS_MINIMUM_UNCOVERED_COST = 72;

const RULE_ID = 'CLDBRN-AWS-SAGEMAKER-3';
const RULE_SERVICE = 'sagemaker';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE =
  'SageMaker Savings Plans eligible usage should maintain at least 80% coverage when uncovered On-Demand cost is material.';

/** Flag material SageMaker Savings Plans coverage gaps without duplicating an AWS purchase recommendation. */
export const sagemakerSavingsPlansCoverageRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'SageMaker Savings Plans Coverage Low',
  description:
    'Flag SageMaker Savings Plans eligible usage with less than 80% coverage and at least 72 cost units of uncovered 30-day On-Demand usage.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-sagemaker-savings-plans-coverage'],
  optionalDiscoveryDependencies: ['aws-cost-optimization-hub-savings-plans-recommendations'],
  evaluateLive: ({ resources }) => {
    const recommendations = resources.get('aws-cost-optimization-hub-savings-plans-recommendations');
    const findings = resources
      .get('aws-sagemaker-savings-plans-coverage')
      .filter(
        (coverage) =>
          !recommendations.some(
            (recommendation) =>
              recommendation.accountId === coverage.accountId &&
              recommendation.savingsPlansType === 'SageMakerSavingsPlans',
          ) &&
          coverage.coveragePercentage < AWS_SAGEMAKER_SAVINGS_PLANS_MINIMUM_COVERAGE_PERCENTAGE &&
          coverage.onDemandCost >= AWS_SAGEMAKER_SAVINGS_PLANS_MINIMUM_UNCOVERED_COST,
      )
      .map((coverage) => createFindingMatch(coverage.accountId, undefined, coverage.accountId));

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
