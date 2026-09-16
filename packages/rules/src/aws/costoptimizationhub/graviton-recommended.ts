import { createFinding, createRule } from '../../shared/helpers.js';
import { deduplicateRecommendationMatches } from '../../shared/recommendation.js';
import { createAwsCostOptimizationHubFindingMatch } from './finding.js';

export { gravitonResourceTypes } from './graviton-identity.js';

const metadata = {
  id: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-6',
  service: 'costoptimizationhub',
  severity: 'medium' as const,
  message: 'Review AWS-recommended Graviton migrations, workload compatibility, and rollback requirements.',
};

/** Reports architecture migration candidates without asserting workload compatibility. */
export const costOptimizationHubGravitonRecommendedRule = createRule({
  ...metadata,
  name: 'AWS-Identified Resources Without Graviton',
  description:
    'Flag EC2 instances, Auto Scaling groups, and RDS DB instances with AWS Graviton migration recommendations.',
  provider: 'aws',
  supports: ['discovery'],
  supersedesRuleIds: ['CLDBRN-AWS-EC2-6', 'CLDBRN-AWS-RDS-4'],
  discoveryDependencies: ['aws-cost-optimization-hub-graviton-recommendations'],
  evaluateLive: ({ resources }) =>
    createFinding(
      metadata,
      'discovery',
      deduplicateRecommendationMatches(
        resources
          .get('aws-cost-optimization-hub-graviton-recommendations')
          .map(createAwsCostOptimizationHubFindingMatch),
      ),
    ),
});
