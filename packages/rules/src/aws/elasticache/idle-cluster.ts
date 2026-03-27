import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-ELASTICACHE-2';
const RULE_SERVICE = 'elasticache';
const RULE_MESSAGE =
  'ElastiCache clusters with almost no cache hits and active connections should be reviewed for cleanup.';

/** Flag ElastiCache clusters with very low hit rates and almost no active connections. */
export const elastiCacheIdleClusterRule = createRule({
  id: RULE_ID,
  name: 'ElastiCache Cluster Idle',
  description:
    'Flag available ElastiCache clusters whose 14-day average cache hit rate stays below 5% and average current connections stay below 2.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-elasticache-clusters', 'aws-elasticache-cluster-activity'],
  evaluateLive: ({ resources }) => {
    const clustersById = new Map(
      resources.get('aws-elasticache-clusters').map((cluster) => [cluster.cacheClusterId, cluster] as const),
    );
    const findings = resources.get('aws-elasticache-cluster-activity').flatMap((activity) => {
      const cluster = clustersById.get(activity.cacheClusterId);

      if (!cluster || cluster.cacheClusterStatus !== 'available') {
        return [];
      }

      return activity.averageCacheHitRateLast14Days !== null &&
        activity.averageCurrentConnectionsLast14Days !== null &&
        activity.averageCacheHitRateLast14Days < 5 &&
        activity.averageCurrentConnectionsLast14Days < 2
        ? [createFindingMatch(cluster.cacheClusterId, cluster.region, cluster.accountId)]
        : [];
    });

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
});
