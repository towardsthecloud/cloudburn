import { DescribeClusterCommand, ListInstancesCommand } from '@aws-sdk/client-emr';
import type { AwsDiscoveredResource, AwsEmrCluster, AwsEmrClusterMetric } from '@cloudburn/rules';
import { createEmrClient } from '../client.js';
import type { AwsDiscoveryDatasetLoadContext } from '../discovery-registry.js';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { extractTerminalArnResourceIdentifier, withAwsServiceErrorContext } from './utils.js';

const EMR_CLUSTER_HYDRATION_CONCURRENCY = 10;
const EMR_IDLE_PERIOD_IN_SECONDS = 5 * 60;
const EMR_IDLE_LOOKBACK_PERIODS = 6;

/**
 * Hydrates discovered EMR clusters with normalized instance-type metadata.
 *
 * @param resources - Catalog resources filtered to EMR cluster resource types.
 * @returns Hydrated EMR clusters for rule evaluation.
 */
export const hydrateAwsEmrClusters = async (resources: AwsDiscoveredResource[]): Promise<AwsEmrCluster[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; clusterId: string }>>();

  for (const resource of resources) {
    // EMR Resource Explorer names can be display labels, so use the ARN suffix
    // as the stable cluster identifier for DescribeCluster/ListInstances.
    const clusterId = extractTerminalArnResourceIdentifier(resource.arn);

    if (!clusterId) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({
      accountId: resource.accountId,
      clusterId,
    });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createEmrClient({ region });
      const clusters: AwsEmrCluster[] = [];

      for (let index = 0; index < regionResources.length; index += EMR_CLUSTER_HYDRATION_CONCURRENCY) {
        const batch = regionResources.slice(index, index + EMR_CLUSTER_HYDRATION_CONCURRENCY);
        const hydratedBatch = await Promise.all(
          batch.map(async (resource) => {
            const [clusterResponse, instanceTypes] = await Promise.all([
              withAwsServiceErrorContext('Amazon EMR', 'DescribeCluster', region, () =>
                client.send(
                  new DescribeClusterCommand({
                    ClusterId: resource.clusterId,
                  }),
                ),
              ),
              listEmrClusterInstanceTypes(client, region, resource.clusterId),
            ]);
            const cluster = clusterResponse.Cluster;
            const state = cluster?.Status?.State;

            if (!cluster?.Id || !cluster.Name || instanceTypes.length === 0) {
              return null;
            }

            return {
              accountId: resource.accountId,
              clusterId: cluster.Id,
              clusterName: cluster.Name,
              endDateTime: cluster.Status?.Timeline?.EndDateTime?.toISOString(),
              instanceTypes,
              normalizedInstanceHours: cluster.NormalizedInstanceHours,
              readyDateTime: cluster.Status?.Timeline?.ReadyDateTime?.toISOString(),
              region,
              state,
            } satisfies AwsEmrCluster;
          }),
        );

        clusters.push(...hydratedBatch.flatMap((cluster) => (cluster ? [cluster] : [])));
      }

      return clusters;
    }),
  );

  return hydratedPages
    .flat()
    .sort((left, right) => left.region.localeCompare(right.region) || left.clusterId.localeCompare(right.clusterId));
};

const listEmrClusterInstanceTypes = async (
  client: ReturnType<typeof createEmrClient>,
  region: string,
  clusterId: string,
): Promise<string[]> => {
  const instanceTypes = new Set<string>();
  let marker: string | undefined;

  do {
    const response = await withAwsServiceErrorContext('Amazon EMR', 'ListInstances', region, () =>
      client.send(
        new ListInstancesCommand({
          ClusterId: clusterId,
          Marker: marker,
        }),
      ),
    );

    for (const instance of response.Instances ?? []) {
      if (instance.InstanceType) {
        instanceTypes.add(instance.InstanceType);
      }
    }

    marker = response.Marker;
  } while (marker);

  return [...instanceTypes].sort((left, right) => left.localeCompare(right));
};

/**
 * Hydrates discovered EMR clusters with their recent idle summary.
 *
 * @param resources - Catalog resources filtered to EMR cluster resource types.
 * @returns Hydrated EMR cluster metrics for rule evaluation.
 */
export const hydrateAwsEmrClusterMetrics = async (
  resources: AwsDiscoveredResource[],
  context?: AwsDiscoveryDatasetLoadContext,
): Promise<AwsEmrClusterMetric[]> => {
  const clusters = context ? await context.loadDataset('aws-emr-clusters') : await hydrateAwsEmrClusters(resources);
  const clustersByRegion = new Map<string, typeof clusters>();

  for (const cluster of clusters) {
    const regionClusters = clustersByRegion.get(cluster.region) ?? [];
    regionClusters.push(cluster);
    clustersByRegion.set(cluster.region, regionClusters);
  }

  const hydratedPages = await Promise.all(
    [...clustersByRegion.entries()].map(async ([region, regionClusters]) => {
      const metricData = await fetchCloudWatchSignals({
        endTime: new Date(),
        queries: regionClusters.map((cluster, index) => ({
          dimensions: [{ Name: 'JobFlowId', Value: cluster.clusterId }],
          id: `idle${index}`,
          metricName: 'IsIdle',
          namespace: 'AWS/ElasticMapReduce',
          period: EMR_IDLE_PERIOD_IN_SECONDS,
          stat: 'Average',
        })),
        region,
        startTime: new Date(Date.now() - EMR_IDLE_LOOKBACK_PERIODS * EMR_IDLE_PERIOD_IN_SECONDS * 1000),
      });

      return regionClusters.map((cluster, index) => {
        const points = (metricData.get(`idle${index}`) ?? []).slice(-EMR_IDLE_LOOKBACK_PERIODS);

        return {
          accountId: cluster.accountId,
          clusterId: cluster.clusterId,
          idlePeriodsLast30Minutes:
            points.length >= EMR_IDLE_LOOKBACK_PERIODS ? points.filter((point) => point.value >= 1).length : null,
          region,
        } satisfies AwsEmrClusterMetric;
      });
    }),
  );

  return hydratedPages
    .flat()
    .sort((left, right) => left.region.localeCompare(right.region) || left.clusterId.localeCompare(right.clusterId));
};
