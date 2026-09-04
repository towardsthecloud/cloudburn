import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import type { AwsCostOptimizationHubIdleRecommendation } from '../../shared/metadata.js';

const RULE_ID = 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-3';
const RULE_SERVICE = 'costoptimizationhub';
const RULE_SEVERITY = 'medium' as const;
const RULE_MESSAGE = 'Idle capacity should be reviewed for the exact action recommended by AWS.';

/**
 * Returns the resource namespace for an idle recommendation.
 * @param recommendation - Normalized AWS recommendation.
 * @returns Resource namespace shared by findings and evidence.
 */
export const getAwsCostOptimizationHubIdleResourceType = (
  recommendation: AwsCostOptimizationHubIdleRecommendation,
): string =>
  ({
    Ec2Instance: 'ec2:instance',
    RdsDbInstance: 'rds:db',
    EbsVolume: 'ec2:volume',
    EcsService: 'ecs:service',
    Ec2AutoScalingGroup: 'autoscaling:autoScalingGroup',
  })[recommendation.currentResourceType];

/**
 * Canonicalizes AWS ARN resource identities for comparison with native findings.
 * @param recommendation - Normalized AWS recommendation.
 * @returns Service-local resource identity, retaining ECS cluster scope.
 */
export const getAwsCostOptimizationHubIdleResourceId = (
  recommendation: AwsCostOptimizationHubIdleRecommendation,
): string => {
  const id = recommendation.resourceId;
  if (!id.startsWith('arn:')) return id;
  const resource = id.split(':').slice(5).join(':');
  if (recommendation.currentResourceType === 'Ec2AutoScalingGroup')
    return resource.split(':autoScalingGroupName:')[1] ?? resource;
  return resource.replace(/^(instance\/|volume\/|db:|service\/)/, '');
};

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
      [
        ...new Map(
          resources.get('aws-cost-optimization-hub-idle-recommendations').map((r) => [r.recommendationId, r]),
        ).values(),
      ].map((r) => ({
        ...createFindingMatch(getAwsCostOptimizationHubIdleResourceId(r), r.region, r.accountId),
        resourceType: getAwsCostOptimizationHubIdleResourceType(r),
        actionType: r.actionType,
      })),
    ),
});
