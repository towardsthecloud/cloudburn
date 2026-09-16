import { createFinding, createRule } from '../../shared/helpers.js';
import { deduplicateRecommendationMatches } from '../../shared/recommendation.js';
import { createAwsCostOptimizationHubFindingMatch } from './finding.js';

export {
  getAwsCostOptimizationHubIdleResourceId,
  getAwsCostOptimizationHubIdleResourceType,
} from './idle-identity.js';

const RULE_ID = 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-3';
const RULE_SERVICE = 'costoptimizationhub';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE = 'Idle capacity should be reviewed for the exact action recommended by AWS.';

/** Flag idle capacity classified by AWS Cost Optimization Hub. */
export const costOptimizationHubIdleCapacityRule = createRule({
  id: RULE_ID,
  name: 'AWS-Classified Idle Capacity',
  description: 'Flag AWS recommendations to stop, delete, or scale in idle capacity.',
  message: RULE_MESSAGE,
  severity: RULE_SEVERITY,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-cost-optimization-hub-idle-recommendations'],
  evaluateLive: ({ resources }) =>
    createFinding(
      {
        id: RULE_ID,
        service: RULE_SERVICE,
        severity: RULE_SEVERITY,
        message: RULE_MESSAGE,
      },
      'discovery',
      deduplicateRecommendationMatches(
        resources.get('aws-cost-optimization-hub-idle-recommendations').map(createAwsCostOptimizationHubFindingMatch),
      ),
    ),
});
