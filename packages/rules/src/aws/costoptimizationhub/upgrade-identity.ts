import type { AwsCostOptimizationHubUpgradeRecommendation } from '../../shared/metadata.js';

const resourceTypes = {
  Ec2Instance: 'ec2:instance',
  Ec2AutoScalingGroup: 'autoscaling:autoScalingGroup',
  EbsVolume: 'ec2:volume',
  RdsDbInstance: 'rds:db',
  RdsDbInstanceStorage: 'rds:db-storage',
} as const;

/**
 * Returns the service identity of an upgrade recommendation, including ARN-only evidence.
 * @param recommendation - Upgrade recommendation carrying AWS identity.
 * @returns Canonical service identifier, or the original identity when it cannot be parsed.
 */
export const getAwsCostOptimizationHubUpgradeResourceId = (
  recommendation: AwsCostOptimizationHubUpgradeRecommendation,
): string => {
  const identity = recommendation.resourceId ?? recommendation.resourceArn ?? recommendation.recommendationId;
  if (!identity.startsWith('arn:')) return identity;
  const [, , service, , , ...parts] = identity.split(':');
  const resource = parts.join(':');
  switch (recommendation.resourceType) {
    case 'Ec2Instance':
      return service === 'ec2' && resource.startsWith('instance/') ? resource.slice(9) : identity;
    case 'EbsVolume':
      return service === 'ec2' && resource.startsWith('volume/') ? resource.slice(7) : identity;
    case 'RdsDbInstance':
    case 'RdsDbInstanceStorage':
      return service === 'rds' && resource.startsWith('db:') ? resource.slice(3) : identity;
    case 'Ec2AutoScalingGroup':
      return service === 'autoscaling' && resource.includes(':autoScalingGroupName/')
        ? (resource.split(':autoScalingGroupName/')[1] ?? identity)
        : identity;
  }
};

/**
 * Returns the resource namespace, distinguishing RDS compute from storage upgrades.
 * @param recommendation - Upgrade whose resource namespace is required.
 * @returns Namespace shared by findings and projected evidence.
 */
export const getAwsCostOptimizationHubUpgradeResourceType = (
  recommendation: AwsCostOptimizationHubUpgradeRecommendation,
): string => resourceTypes[recommendation.resourceType];
