import { DescribeCacheClustersCommand, DescribeReservedCacheNodesCommand } from '@aws-sdk/client-elasticache';
import type {
  AwsDiscoveredResource,
  AwsElastiCacheCluster,
  AwsElastiCacheClusterActivity,
  AwsElastiCacheReservedNode,
} from '@cloudburn/rules';
import { createElastiCacheClient } from '../client.js';
import type { AwsDiscoveryDatasetLoadContext } from '../discovery-registry.js';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { extractTerminalResourceIdentifier, withAwsServiceErrorContext } from './utils.js';

const ELASTICACHE_PAGE_SIZE = 100;
const FOURTEEN_DAYS_IN_SECONDS = 14 * 24 * 60 * 60;
const DAILY_PERIOD_IN_SECONDS = 24 * 60 * 60;
const REQUIRED_ELASTICACHE_DAILY_POINTS = FOURTEEN_DAYS_IN_SECONDS / DAILY_PERIOD_IN_SECONDS;

const sortByIdentifier = <T extends { region: string }>(items: T[], getIdentifier: (item: T) => string): T[] =>
  items.sort(
    (left, right) => left.region.localeCompare(right.region) || getIdentifier(left).localeCompare(getIdentifier(right)),
  );

const isSupportedElastiCacheActivityEngine = (engine: string): boolean => ['redis', 'valkey'].includes(engine);

/**
 * Hydrates discovered ElastiCache clusters with their normalized node metadata.
 *
 * @param resources - Catalog resources filtered to ElastiCache cluster resource types.
 * @returns Hydrated ElastiCache clusters for rule evaluation.
 */
export const hydrateAwsElastiCacheClusters = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsElastiCacheCluster[]> => {
  const clusterIdsByRegion = new Map<string, Map<string, string>>();

  for (const resource of resources) {
    const cacheClusterId = extractTerminalResourceIdentifier(resource.name, resource.arn);

    if (!cacheClusterId) {
      continue;
    }

    const regionClusterIds = clusterIdsByRegion.get(resource.region) ?? new Map<string, string>();
    regionClusterIds.set(cacheClusterId, resource.accountId);
    clusterIdsByRegion.set(resource.region, regionClusterIds);
  }

  const hydratedPages = await Promise.all(
    [...clusterIdsByRegion.entries()].map(async ([region, clusterIds]) => {
      const client = createElastiCacheClient({ region });
      const clusters: AwsElastiCacheCluster[] = [];
      let marker: string | undefined;

      do {
        const response = await withAwsServiceErrorContext('Amazon ElastiCache', 'DescribeCacheClusters', region, () =>
          client.send(
            new DescribeCacheClustersCommand({
              Marker: marker,
              MaxRecords: ELASTICACHE_PAGE_SIZE,
            }),
          ),
        );

        for (const cluster of response.CacheClusters ?? []) {
          if (!cluster.CacheClusterId || !cluster.CacheNodeType || !cluster.Engine || !cluster.NumCacheNodes) {
            continue;
          }

          const accountId = clusterIds.get(cluster.CacheClusterId);

          if (!accountId) {
            continue;
          }

          clusters.push({
            accountId,
            cacheClusterCreateTime: cluster.CacheClusterCreateTime?.toISOString(),
            cacheClusterId: cluster.CacheClusterId,
            cacheClusterStatus: cluster.CacheClusterStatus,
            cacheNodeType: cluster.CacheNodeType,
            engine: cluster.Engine,
            numCacheNodes: cluster.NumCacheNodes,
            region,
          });
        }

        marker = response.Marker;
      } while (marker);

      return clusters;
    }),
  );

  return sortByIdentifier(hydratedPages.flat(), (cluster) => cluster.cacheClusterId);
};

/**
 * Hydrates discovered ElastiCache reserved nodes with their coverage metadata.
 *
 * @param resources - Catalog resources filtered to ElastiCache reserved-node resource types.
 * @returns Hydrated ElastiCache reserved nodes for rule evaluation.
 */
export const hydrateAwsElastiCacheReservedNodes = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsElastiCacheReservedNode[]> => {
  const reservedNodeIdsByRegion = new Map<string, Map<string, string>>();

  for (const resource of resources) {
    const reservedCacheNodeId = extractTerminalResourceIdentifier(resource.name, resource.arn);

    if (!reservedCacheNodeId) {
      continue;
    }

    const regionReservedNodeIds = reservedNodeIdsByRegion.get(resource.region) ?? new Map<string, string>();
    regionReservedNodeIds.set(reservedCacheNodeId, resource.accountId);
    reservedNodeIdsByRegion.set(resource.region, regionReservedNodeIds);
  }

  const hydratedPages = await Promise.all(
    [...reservedNodeIdsByRegion.entries()].map(async ([region, reservedNodeIds]) => {
      const client = createElastiCacheClient({ region });
      const reservedNodes: AwsElastiCacheReservedNode[] = [];
      let marker: string | undefined;

      do {
        const response = await withAwsServiceErrorContext(
          'Amazon ElastiCache',
          'DescribeReservedCacheNodes',
          region,
          () =>
            client.send(
              new DescribeReservedCacheNodesCommand({
                Marker: marker,
                MaxRecords: ELASTICACHE_PAGE_SIZE,
              }),
            ),
        );

        for (const reservedNode of response.ReservedCacheNodes ?? []) {
          if (!reservedNode.ReservedCacheNodeId || !reservedNode.CacheNodeType || !reservedNode.CacheNodeCount) {
            continue;
          }

          const accountId = reservedNodeIds.get(reservedNode.ReservedCacheNodeId);

          if (!accountId) {
            continue;
          }

          reservedNodes.push({
            accountId,
            cacheNodeCount: reservedNode.CacheNodeCount,
            cacheNodeType: reservedNode.CacheNodeType,
            productDescription: reservedNode.ProductDescription,
            region,
            reservedCacheNodeId: reservedNode.ReservedCacheNodeId,
            startTime: reservedNode.StartTime?.toISOString(),
            state: reservedNode.State,
          });
        }

        marker = response.Marker;
      } while (marker);

      return reservedNodes;
    }),
  );

  return sortByIdentifier(hydratedPages.flat(), (reservedNode) => reservedNode.reservedCacheNodeId);
};

/**
 * Hydrates discovered ElastiCache clusters with 14-day cache hit-rate and connection activity.
 *
 * v1 supports Redis and Valkey clusters only. Unsupported engines return `null` activity fields.
 *
 * @param resources - Catalog resources filtered to ElastiCache cluster resource types.
 * @returns Activity coverage for ElastiCache cluster evaluation.
 */
export const hydrateAwsElastiCacheClusterActivity = async (
  resources: AwsDiscoveredResource[],
  context?: AwsDiscoveryDatasetLoadContext,
): Promise<AwsElastiCacheClusterActivity[]> => {
  const clusters = context
    ? await context.loadDataset('aws-elasticache-clusters')
    : await hydrateAwsElastiCacheClusters(resources);
  const clustersByRegion = new Map<string, AwsElastiCacheCluster[]>();

  for (const cluster of clusters) {
    const regionClusters = clustersByRegion.get(cluster.region) ?? [];
    regionClusters.push(cluster);
    clustersByRegion.set(cluster.region, regionClusters);
  }

  const hydratedPages = await Promise.all(
    [...clustersByRegion.entries()].map(async ([region, regionClusters]) => {
      const supportedClusters = regionClusters.filter((cluster) =>
        isSupportedElastiCacheActivityEngine(cluster.engine),
      );
      const metricData =
        supportedClusters.length > 0
          ? await fetchCloudWatchSignals({
              endTime: new Date(),
              queries: supportedClusters.flatMap((cluster, index) => [
                {
                  dimensions: [{ Name: 'CacheClusterId', Value: cluster.cacheClusterId }],
                  id: `hits${index}`,
                  metricName: 'CacheHits',
                  namespace: 'AWS/ElastiCache',
                  period: DAILY_PERIOD_IN_SECONDS,
                  stat: 'Sum' as const,
                },
                {
                  dimensions: [{ Name: 'CacheClusterId', Value: cluster.cacheClusterId }],
                  id: `misses${index}`,
                  metricName: 'CacheMisses',
                  namespace: 'AWS/ElastiCache',
                  period: DAILY_PERIOD_IN_SECONDS,
                  stat: 'Sum' as const,
                },
                {
                  dimensions: [{ Name: 'CacheClusterId', Value: cluster.cacheClusterId }],
                  id: `connections${index}`,
                  metricName: 'CurrConnections',
                  namespace: 'AWS/ElastiCache',
                  period: DAILY_PERIOD_IN_SECONDS,
                  stat: 'Average' as const,
                },
              ]),
              region,
              startTime: new Date(Date.now() - FOURTEEN_DAYS_IN_SECONDS * 1000),
            })
          : new Map();

      const supportedIndexByClusterId = new Map(
        supportedClusters.map((cluster, index) => [cluster.cacheClusterId, index] as const),
      );

      return regionClusters.map((cluster) => {
        const supportedIndex = supportedIndexByClusterId.get(cluster.cacheClusterId);

        if (supportedIndex === undefined) {
          return {
            accountId: cluster.accountId,
            averageCacheHitRateLast14Days: null,
            averageCurrentConnectionsLast14Days: null,
            cacheClusterId: cluster.cacheClusterId,
            region: cluster.region,
          } satisfies AwsElastiCacheClusterActivity;
        }

        const hitPoints = metricData.get(`hits${supportedIndex}`) ?? [];
        const missPoints = metricData.get(`misses${supportedIndex}`) ?? [];
        const connectionPoints = metricData.get(`connections${supportedIndex}`) ?? [];
        const hasCompleteCoverage =
          hitPoints.length >= REQUIRED_ELASTICACHE_DAILY_POINTS &&
          missPoints.length >= REQUIRED_ELASTICACHE_DAILY_POINTS &&
          connectionPoints.length >= REQUIRED_ELASTICACHE_DAILY_POINTS;
        const totalHits = hitPoints.reduce((sum: number, point: { value: number }) => sum + point.value, 0);
        const totalMisses = missPoints.reduce((sum: number, point: { value: number }) => sum + point.value, 0);
        const totalLookups = totalHits + totalMisses;

        return {
          accountId: cluster.accountId,
          averageCacheHitRateLast14Days:
            hasCompleteCoverage && totalLookups > 0 ? (totalHits / totalLookups) * 100 : hasCompleteCoverage ? 0 : null,
          averageCurrentConnectionsLast14Days: hasCompleteCoverage
            ? connectionPoints.reduce((sum: number, point: { value: number }) => sum + point.value, 0) /
              connectionPoints.length
            : null,
          cacheClusterId: cluster.cacheClusterId,
          region: cluster.region,
        } satisfies AwsElastiCacheClusterActivity;
      });
    }),
  );

  return sortByIdentifier(hydratedPages.flat(), (cluster) => cluster.cacheClusterId);
};
