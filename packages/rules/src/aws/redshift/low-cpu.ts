import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-REDSHIFT-1';
const RULE_SERVICE = 'redshift';
const RULE_MESSAGE = 'Redshift clusters with low CPU utilization should be reviewed.';
// Review provisioned warehouses whose 14-day average CPU stays at or below 10%.
const LOW_CPU_THRESHOLD = 10;

/** Flag available Redshift clusters with sustained low CPU utilization. */
export const redshiftLowCpuRule = createRule({
  id: RULE_ID,
  name: 'Redshift Cluster Low CPU Utilization',
  description: 'Flag available Redshift clusters whose 14-day average CPU stays at or below 10%.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-redshift-clusters', 'aws-redshift-cluster-metrics'],
  evaluateLive: ({ resources }) => {
    const clustersById = new Map(
      resources.get('aws-redshift-clusters').map((cluster) => [cluster.clusterIdentifier, cluster] as const),
    );

    const findings = resources
      .get('aws-redshift-cluster-metrics')
      .filter((metric) => {
        const cluster = clustersById.get(metric.clusterIdentifier);

        return (
          cluster?.clusterStatus === 'available' &&
          metric.averageCpuUtilizationLast14Days !== null &&
          metric.averageCpuUtilizationLast14Days <= LOW_CPU_THRESHOLD
        );
      })
      .flatMap((metric) => {
        const cluster = clustersById.get(metric.clusterIdentifier);

        return cluster ? [createFindingMatch(cluster.clusterIdentifier, cluster.region, cluster.accountId)] : [];
      });

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
