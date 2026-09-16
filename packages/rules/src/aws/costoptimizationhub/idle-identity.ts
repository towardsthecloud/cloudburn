import type { AwsCostOptimizationHubIdleRecommendation } from '../../shared/metadata.js';
import { canonicalizeAwsResourceId } from '../resource-identity.js';

const idleResourceTypes = {
  Ec2Instance: 'ec2:instance',
  RdsDbInstance: 'rds:db',
  EbsVolume: 'ec2:volume',
  EcsService: 'ecs:service',
  Ec2AutoScalingGroup: 'autoscaling:autoScalingGroup',
} as const;

/**
 * Returns the resource namespace for an idle recommendation.
 * @param recommendation - Normalized AWS recommendation.
 * @returns Resource namespace shared by findings and evidence.
 */
export const getAwsCostOptimizationHubIdleResourceType = (
  recommendation: AwsCostOptimizationHubIdleRecommendation,
): string => idleResourceTypes[recommendation.currentResourceType];

/**
 * Canonicalizes AWS ARN resource identities for comparison with native findings.
 * @param recommendation - Normalized AWS recommendation.
 * @returns Service-local resource identity, retaining ECS cluster scope.
 */
export const getAwsCostOptimizationHubIdleResourceId = (
  recommendation: AwsCostOptimizationHubIdleRecommendation,
): string =>
  canonicalizeAwsResourceId(getAwsCostOptimizationHubIdleResourceType(recommendation), recommendation.resourceId);
