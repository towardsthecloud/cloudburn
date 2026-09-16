import type { AwsCostOptimizationHubUpgradeRecommendation } from '../../shared/metadata.js';
import { canonicalizeAwsResourceId } from '../resource-identity.js';

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
): string =>
  canonicalizeAwsResourceId(
    resourceTypes[recommendation.resourceType],
    recommendation.resourceId ?? recommendation.resourceArn ?? recommendation.recommendationId,
  );

/**
 * Returns the resource namespace, distinguishing RDS compute from storage upgrades.
 * @param recommendation - Upgrade whose resource namespace is required.
 * @returns Namespace shared by findings and projected evidence.
 */
export const getAwsCostOptimizationHubUpgradeResourceType = (
  recommendation: AwsCostOptimizationHubUpgradeRecommendation,
): string => resourceTypes[recommendation.resourceType];
