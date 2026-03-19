import { DescribeCacheClustersCommand, DescribeReservedCacheNodesCommand } from '@aws-sdk/client-elasticache';
import type { AwsDiscoveredResource, AwsElastiCacheCluster, AwsElastiCacheReservedNode } from '@cloudburn/rules';
import { createElastiCacheClient } from '../client.js';
import { extractTerminalResourceIdentifier, withAwsServiceErrorContext } from './utils.js';

const ELASTICACHE_PAGE_SIZE = 100;

const sortByIdentifier = <T extends { region: string }>(items: T[], getIdentifier: (item: T) => string): T[] =>
  items.sort(
    (left, right) => left.region.localeCompare(right.region) || getIdentifier(left).localeCompare(getIdentifier(right)),
  );

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
