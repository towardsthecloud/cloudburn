import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import { getAwsCostOptimizationHubRightsizingResourceType } from './rightsizing-identity.js';

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
      [
        ...new Map(
          resources
            .get('aws-cost-optimization-hub-rightsizing-recommendations')
            .filter((recommendation) => recommendation.actionType === 'Rightsize')
            .map((recommendation) => [recommendation.recommendationId, recommendation]),
        ).values(),
      ].map((recommendation) => ({
        ...createFindingMatch(recommendation.resourceId, recommendation.region, recommendation.accountId),
        resourceType: getAwsCostOptimizationHubRightsizingResourceType(recommendation),
      })),
    ),
});
