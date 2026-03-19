import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-EMR-2';
const RULE_SERVICE = 'emr';
const RULE_MESSAGE = 'EMR clusters idle for more than 30 minutes should be reviewed.';
// EMR `IsIdle` publishes every 5 minutes, so six consecutive idle periods equals 30 minutes.
const IDLE_REVIEW_PERIODS = 6;

/** Flag active EMR clusters whose idle metric stays true for at least 30 minutes. */
export const emrIdleClusterRule = createRule({
  id: RULE_ID,
  name: 'EMR Cluster Idle',
  description: 'Flag active EMR clusters whose `IsIdle` metric stays true for at least 30 minutes.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-emr-clusters', 'aws-emr-cluster-metrics'],
  evaluateLive: ({ resources }) => {
    const clustersById = new Map(
      resources.get('aws-emr-clusters').map((cluster) => [cluster.clusterId, cluster] as const),
    );

    const findings = resources
      .get('aws-emr-cluster-metrics')
      .filter((metric) => {
        const cluster = clustersById.get(metric.clusterId);

        if (!cluster) {
          return false;
        }

        return (
          cluster.endDateTime === undefined &&
          (cluster.state === 'RUNNING' || cluster.state === 'WAITING') &&
          metric.idlePeriodsLast30Minutes !== null &&
          metric.idlePeriodsLast30Minutes >= IDLE_REVIEW_PERIODS
        );
      })
      .flatMap((metric) => {
        const cluster = clustersById.get(metric.clusterId);

        return cluster ? [createFindingMatch(cluster.clusterId, cluster.region, cluster.accountId)] : [];
      });

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
