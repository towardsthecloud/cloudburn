import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import {
  getAwsCostOptimizationHubUpgradeResourceId,
  getAwsCostOptimizationHubUpgradeResourceType,
} from './upgrade-identity.js';

const id = 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-5';
const service = 'costoptimizationhub';
const severity = 'medium' as const;
const message = 'Resources should use newer-generation products when AWS recommends an upgrade.';

/** Flags product-generation upgrades recommended by AWS Cost Optimization Hub. */
export const costOptimizationHubUpgradesRecommendedRule = createRule({
  id,
  service,
  severity,
  message,
  provider: 'aws',
  name: 'Resource Product Generation Not Optimized',
  description:
    'Flag AWS-recommended generation upgrades for EC2 instances, Auto Scaling groups, EBS volumes, RDS instances, and RDS storage.',
  supports: ['discovery'],
  discoveryDependencies: ['aws-cost-optimization-hub-upgrade-recommendations'],
  evaluateLive: ({ resources }) =>
    createFinding(
      { id, service, severity, message },
      'discovery',
      [
        ...new Map(
          resources
            .get('aws-cost-optimization-hub-upgrade-recommendations')
            .map((item) => [item.recommendationId, item]),
        ).values(),
      ].map((item) => ({
        ...createFindingMatch(getAwsCostOptimizationHubUpgradeResourceId(item), item.region, item.accountId),
        resourceType: getAwsCostOptimizationHubUpgradeResourceType(item),
      })),
    ),
});
