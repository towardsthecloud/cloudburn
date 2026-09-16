import { createFinding, createRule } from '../../shared/helpers.js';
import { deduplicateRecommendationMatches } from '../../shared/recommendation.js';
import { createAwsCostOptimizationHubFindingMatch } from './finding.js';

const id = 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-4';
const service = 'costoptimizationhub';
const severity = 'medium';
const message = 'Resources should use the smaller configuration recommended by AWS Cost Optimization Hub.';

/** Flag rightsizing opportunities evaluated by AWS Cost Optimization Hub. */
export const costOptimizationHubRightsizingRecommendedRule = createRule({
  id,
  service,
  severity,
  message,
  name: 'Resource Configuration Oversized',
  description: 'Flag resource rightsizing recommendations from AWS Cost Optimization Hub.',
  provider: 'aws',
  supports: ['discovery'],
  discoveryDependencies: ['aws-cost-optimization-hub-rightsizing-recommendations'],
  evaluateLive: ({ resources }) =>
    createFinding(
      { id, service, severity, message },
      'discovery',
      deduplicateRecommendationMatches(
        resources
          .get('aws-cost-optimization-hub-rightsizing-recommendations')
          .filter((recommendation) => recommendation.actionType === 'Rightsize')
          .map(createAwsCostOptimizationHubFindingMatch),
      ),
    ),
});
