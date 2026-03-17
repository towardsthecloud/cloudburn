import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-ECS-2';
const RULE_SERVICE = 'ecs';
const RULE_MESSAGE =
  'ECS clusters should be reviewed when average CPU utilization stays below 10% for the previous 14 days.';
const LOW_CPU_THRESHOLD = 10;

/** Flag ECS clusters with sustained low average CPU utilization. */
export const ecsLowCpuUtilizationRule = createRule({
  id: RULE_ID,
  name: 'ECS Cluster Low CPU Utilization',
  description: 'Flag ECS clusters whose average CPU utilization stays below 10% over the previous 14 days.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-ecs-clusters', 'aws-ecs-cluster-metrics'],
  evaluateLive: ({ resources }) => {
    const metricsByClusterArn = new Map(
      resources.get('aws-ecs-cluster-metrics').map((cluster) => [cluster.clusterArn, cluster] as const),
    );
    const findings = resources
      .get('aws-ecs-clusters')
      .filter((cluster) => {
        const metric = metricsByClusterArn.get(cluster.clusterArn);

        // Skip clusters with incomplete CloudWatch history so the advisory stays conservative.
        return metric?.averageCpuUtilizationLast14Days !== null && metric?.averageCpuUtilizationLast14Days !== undefined
          ? metric.averageCpuUtilizationLast14Days < LOW_CPU_THRESHOLD
          : false;
      })
      .map((cluster) => createFindingMatch(cluster.clusterArn, cluster.region, cluster.accountId));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
