import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-SAGEMAKER-3';
const RULE_SERVICE = 'sagemaker';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE = 'SageMaker usage should use a Savings Plan when AWS recommends a purchase.';

/** Flag account-scoped SageMaker Savings Plans purchases recommended by AWS Cost Optimization Hub. */
export const sagemakerSavingsPlansRecommendedRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'SageMaker Savings Plans Purchase Recommended',
  description: 'Flag SageMaker Savings Plans purchases recommended by AWS Cost Optimization Hub.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-sagemaker-savings-plans-recommendations'],
  evaluateLive: ({ resources }) => {
    const recommendations = new Map(
      resources
        .get('aws-sagemaker-savings-plans-recommendations')
        .map((recommendation) => [recommendation.recommendationId, recommendation]),
    );
    const findings = [...recommendations.values()].map((recommendation) =>
      createFindingMatch(recommendation.recommendationId, recommendation.region, recommendation.accountId),
    );

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
