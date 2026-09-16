import { createFinding, createRule } from '../../shared/helpers.js';
import { deduplicateRecommendationMatches } from '../../shared/recommendation.js';
import { createAwsCostOptimizationHubFindingMatch } from './finding.js';

const RULE_ID = 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-1';
const RULE_SERVICE = 'costoptimizationhub';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE = 'Savings Plans eligible usage should use a Savings Plan when AWS recommends a purchase.';

/** Flag Savings Plans purchases recommended by AWS Cost Optimization Hub. */
export const costOptimizationHubSavingsPlansRecommendedRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'Cost Optimization Hub Savings Plans Purchase Recommended',
  description: 'Flag Compute, EC2 Instance, and SageMaker Savings Plans purchases recommended by AWS.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cost-optimization-hub-savings-plans-recommendations'],
  evaluateLive: ({ resources }) =>
    createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      deduplicateRecommendationMatches(
        resources
          .get('aws-cost-optimization-hub-savings-plans-recommendations')
          .map(createAwsCostOptimizationHubFindingMatch),
      ),
    ),
});
