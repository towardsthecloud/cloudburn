import type { AwsDiscoveredResource, AwsEcsClusterMetric } from '@cloudburn/rules';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { hydrateAwsEcsClusters } from './ecs.js';

const FOURTEEN_DAYS_IN_SECONDS = 14 * 24 * 60 * 60;
const DAILY_PERIOD_IN_SECONDS = 24 * 60 * 60;
const REQUIRED_ECS_DAILY_POINTS = FOURTEEN_DAYS_IN_SECONDS / DAILY_PERIOD_IN_SECONDS;

/**
 * Hydrates discovered ECS clusters with a 14-day CPU utilization summary.
 *
 * @param resources - Catalog resources filtered to ECS cluster resource types.
 * @returns Hydrated ECS cluster metric models for rule evaluation.
 */
export const hydrateAwsEcsClusterMetrics = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsEcsClusterMetric[]> => {
  const clusters = await hydrateAwsEcsClusters(resources);
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
          dimensions: [{ Name: 'ClusterName', Value: cluster.clusterName }],
          id: `ecsCluster${index}`,
          metricName: 'CPUUtilization',
          namespace: 'AWS/ECS',
          period: DAILY_PERIOD_IN_SECONDS,
          stat: 'Average',
        })),
        region,
        startTime: new Date(Date.now() - FOURTEEN_DAYS_IN_SECONDS * 1000),
      });

      return regionClusters.map((cluster, index) => {
        const points = metricData.get(`ecsCluster${index}`) ?? [];

        return {
          accountId: cluster.accountId,
          averageCpuUtilizationLast14Days:
            points.length >= REQUIRED_ECS_DAILY_POINTS
              ? points.reduce((sum, point) => sum + point.value, 0) / points.length
              : null,
          clusterArn: cluster.clusterArn,
          clusterName: cluster.clusterName,
          region,
        };
      });
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.clusterArn.localeCompare(right.clusterArn));
};
