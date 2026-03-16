import type { AwsEc2LoadBalancer, AwsEc2TargetGroup } from '../../shared/metadata.js';

const getTargetCountByArn = (targetGroups: AwsEc2TargetGroup[]): Map<string, number> =>
  new Map(targetGroups.map((targetGroup) => [targetGroup.targetGroupArn, targetGroup.registeredTargetCount] as const));

/** Returns whether a load balancer has no registered targets across its attached target groups. */
export const hasNoRegisteredTargets = (
  loadBalancer: AwsEc2LoadBalancer,
  targetGroups: AwsEc2TargetGroup[],
): boolean => {
  if (loadBalancer.attachedTargetGroupArns.length === 0) {
    return true;
  }

  const targetCountByArn = getTargetCountByArn(targetGroups);

  const registeredTargetCounts = loadBalancer.attachedTargetGroupArns.map((targetGroupArn) =>
    targetCountByArn.get(targetGroupArn),
  );

  if (registeredTargetCounts.some((registeredTargetCount) => registeredTargetCount === undefined)) {
    return false;
  }

  return registeredTargetCounts.every(
    (registeredTargetCount): registeredTargetCount is number => registeredTargetCount !== undefined,
  )
    ? registeredTargetCounts.reduce((sum, registeredTargetCount) => sum + registeredTargetCount, 0) === 0
    : false;
};
