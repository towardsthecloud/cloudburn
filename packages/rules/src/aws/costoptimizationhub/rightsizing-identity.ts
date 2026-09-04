import type { AwsCostOptimizationHubRightsizingRecommendation } from '../../shared/metadata.js';

const resourceTypes = {
  Ec2Instance: 'ec2:instance',
  Ec2AutoScalingGroup: 'autoscaling:autoScalingGroup',
  EbsVolume: 'ec2:volume',
  LambdaFunction: 'lambda:function',
  EcsService: 'ecs:service',
  RdsDbInstance: 'rds:db',
  RdsDbInstanceStorage: 'rds:db-storage',
  AuroraDbClusterStorage: 'rds:cluster-storage',
} as const;

/**
 * Identifies the resource and configuration scope reviewed for rightsizing.
 * @param recommendation - A typed Hub rightsizing recommendation.
 * @returns The namespace used for finding identity and evaluation evidence.
 */
export const getAwsCostOptimizationHubRightsizingResourceType = (
  recommendation: Pick<AwsCostOptimizationHubRightsizingRecommendation, 'resourceType'>,
): string => resourceTypes[recommendation.resourceType];
