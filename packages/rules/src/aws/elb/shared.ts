import type { AwsEc2LoadBalancer, AwsEc2TargetGroup } from '../../shared/metadata.js';

/**
 * Indexes registered target counts once for an entire rule evaluation.
 *
 * @param targetGroups - Hydrated target-group evidence.
 * @returns Counts keyed by globally unique target-group ARN.
 */
export const getTargetCountByArn = (targetGroups: AwsEc2TargetGroup[]): ReadonlyMap<string, number> =>
  new Map(targetGroups.map((targetGroup) => [targetGroup.targetGroupArn, targetGroup.registeredTargetCount] as const));

/**
 * Checks whether every attached target group has a known zero target count.
 *
 * @param loadBalancer - Load balancer and its attached target-group ARNs.
 * @param targetCountByArn - Shared target-count index for the evaluation.
 * @returns Whether the load balancer has no registered targets; unknown groups do not match.
 */
export const hasNoRegisteredTargets = (
  loadBalancer: AwsEc2LoadBalancer,
  targetCountByArn: ReadonlyMap<string, number>,
): boolean => loadBalancer.attachedTargetGroupArns.every((arn) => targetCountByArn.get(arn) === 0);
