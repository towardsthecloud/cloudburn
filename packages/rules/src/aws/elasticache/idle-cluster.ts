import {
  createFinding,
  createFindingMatch,
  createLiveEvaluationCoverage,
  createRule,
  getAwsResourceScopeKey,
} from '../../shared/helpers.js';

const RULE_ID = 'CLDBRN-AWS-ELASTICACHE-2';
const RULE_SERVICE = 'elasticache';
const RULE_SEVERITY = 'high' as const;
const RULE_MESSAGE =
  'ElastiCache clusters with almost no cache hits and active connections should be reviewed for cleanup.';

/** Flag ElastiCache clusters with very low hit rates and almost no active connections. */
export const elastiCacheIdleClusterRule = createRule({
  severity: RULE_SEVERITY,
  id: RULE_ID,
  name: 'ElastiCache Cluster Idle',
  description:
    'Flag available ElastiCache clusters whose 14-day average cache hit rate stays below 5% and average current connections stay below 2.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['discovery'],
  discoveryDependencies: ['aws-elasticache-clusters', 'aws-elasticache-cluster-activity'],
  getLiveEvaluationCoverage: ({ resources }) => {
    const metricsByResource = new Map(
      resources
        .get('aws-elasticache-cluster-activity')
        .map((metric) => [getAwsResourceScopeKey(metric.accountId, metric.region, metric.cacheClusterId), metric]),
    );

    return createLiveEvaluationCoverage(
      resources.get('aws-elasticache-clusters'),
      (resource) => {
        const metric = metricsByResource.get(
          getAwsResourceScopeKey(resource.accountId, resource.region, resource.cacheClusterId),
        );

        return (
          resource.cacheClusterStatus !== 'available' ||
          (metric?.averageCacheHitRateLast14Days != null && metric.averageCurrentConnectionsLast14Days != null)
        );
      },
      (resource) => createFindingMatch(resource.cacheClusterId, resource.region, resource.accountId),
    );
  },
  evaluateLive: ({ resources }) => {
    const clustersById = new Map(
      resources
        .get('aws-elasticache-clusters')
        .map(
          (cluster) =>
            [getAwsResourceScopeKey(cluster.accountId, cluster.region, cluster.cacheClusterId), cluster] as const,
        ),
    );
    const findings = resources.get('aws-elasticache-cluster-activity').flatMap((activity) => {
      const cluster = clustersById.get(
        getAwsResourceScopeKey(activity.accountId, activity.region, activity.cacheClusterId),
      );

      if (cluster?.cacheClusterStatus !== 'available') {
        return [];
      }

      return activity.averageCacheHitRateLast14Days !== null &&
        activity.averageCurrentConnectionsLast14Days !== null &&
        activity.averageCacheHitRateLast14Days < 5 &&
        activity.averageCurrentConnectionsLast14Days < 2
        ? [createFindingMatch(cluster.cacheClusterId, cluster.region, cluster.accountId)]
        : [];
    });

    return createFinding(
      { id: RULE_ID, service: RULE_SERVICE, severity: RULE_SEVERITY, message: RULE_MESSAGE },
      'discovery',
      findings,
    );
  },
});
