import {
  DescribeClustersCommand,
  DescribeReservedNodesCommand,
  DescribeScheduledActionsCommand,
} from '@aws-sdk/client-redshift';
import type {
  AwsDiscoveredResource,
  AwsRedshiftCluster,
  AwsRedshiftClusterMetric,
  AwsRedshiftReservedNode,
} from '@cloudburn/rules';
import type { ScanDiagnostic } from '../../../types.js';
import { createRedshiftClient } from '../client.js';
import { getAwsErrorCode, isAwsAccessDeniedError } from '../errors.js';
import { fetchCloudWatchSignals } from './cloudwatch.js';
import { chunkItems, extractTerminalResourceIdentifier, withAwsServiceErrorContext } from './utils.js';

const REDSHIFT_PAGE_SIZE = 100;
const REDSHIFT_CPU_LOOKBACK_DAYS = 14;
const REDSHIFT_DAILY_PERIOD_IN_SECONDS = 24 * 60 * 60;
const REDSHIFT_SCHEDULED_ACTION_FILTER_BATCH_SIZE = 100;

const isScpAccessDeniedError = (err: unknown): boolean =>
  err instanceof Error &&
  (err.message.toLowerCase().includes('service control policy') || err.message.toLowerCase().includes('by scp'));

const buildRedshiftScheduleAccessDeniedMessage = (region: string, err: unknown): string =>
  isScpAccessDeniedError(err)
    ? `Skipped redshift schedule discovery in ${region} because access is denied by a service control policy (SCP). Pause/resume findings may be incomplete.`
    : `Skipped redshift schedule discovery in ${region} because access is denied by AWS permissions. Pause/resume findings may be incomplete.`;

/**
 * Hydrates discovered Redshift clusters with normalized node metadata.
 *
 * @param resources - Catalog resources filtered to Redshift cluster resource types.
 * @returns Hydrated Redshift clusters plus non-fatal schedule diagnostics.
 */
export const hydrateAwsRedshiftClusters = async (
  resources: AwsDiscoveredResource[],
): Promise<{ diagnostics?: ScanDiagnostic[]; resources: AwsRedshiftCluster[] }> => {
  const clusterIdsByRegion = new Map<string, Map<string, string>>();

  for (const resource of resources) {
    const clusterIdentifier = extractTerminalResourceIdentifier(resource.name, resource.arn);

    if (!clusterIdentifier) {
      continue;
    }

    const regionClusterIds = clusterIdsByRegion.get(resource.region) ?? new Map<string, string>();
    regionClusterIds.set(clusterIdentifier, resource.accountId);
    clusterIdsByRegion.set(resource.region, regionClusterIds);
  }

  const hydratedPages = await Promise.all(
    [...clusterIdsByRegion.entries()].map(async ([region, clusterIds]) => {
      const client = createRedshiftClient({ region });
      const clusters: AwsRedshiftCluster[] = [];
      let marker: string | undefined;

      do {
        const response = await withAwsServiceErrorContext('Amazon Redshift', 'DescribeClusters', region, () =>
          client.send(
            new DescribeClustersCommand({
              Marker: marker,
              MaxRecords: REDSHIFT_PAGE_SIZE,
            }),
          ),
        );

        for (const cluster of response.Clusters ?? []) {
          if (!cluster.ClusterIdentifier || !cluster.NodeType || !cluster.NumberOfNodes) {
            continue;
          }

          const accountId = clusterIds.get(cluster.ClusterIdentifier);

          if (!accountId) {
            continue;
          }

          clusters.push({
            accountId,
            automatedSnapshotRetentionPeriod: cluster.AutomatedSnapshotRetentionPeriod,
            clusterCreateTime: cluster.ClusterCreateTime?.toISOString(),
            clusterIdentifier: cluster.ClusterIdentifier,
            clusterStatus: cluster.ClusterStatus,
            hasPauseSchedule: false,
            hasResumeSchedule: false,
            hsmEnabled: Boolean(cluster.HsmStatus?.HsmConfigurationIdentifier ?? cluster.HsmStatus?.Status),
            multiAz: cluster.MultiAZ,
            nodeType: cluster.NodeType,
            numberOfNodes: cluster.NumberOfNodes,
            region,
            vpcId: cluster.VpcId,
          });
        }

        marker = response.Marker;
      } while (marker);

      const { diagnostic, pauseResumeStateAvailable, scheduleStateByCluster } =
        await loadRedshiftScheduledClusterStateSafely(client, region, clusters);

      return {
        diagnostics: diagnostic ? [diagnostic] : [],
        resources: clusters.map((cluster) => ({
          ...cluster,
          hasPauseSchedule: scheduleStateByCluster.get(cluster.clusterIdentifier)?.hasPauseSchedule ?? false,
          hasResumeSchedule: scheduleStateByCluster.get(cluster.clusterIdentifier)?.hasResumeSchedule ?? false,
          pauseResumeStateAvailable,
        })),
      };
    }),
  );

  return {
    diagnostics: hydratedPages.flatMap((page) => page.diagnostics),
    resources: hydratedPages
      .flatMap((page) => page.resources)
      .sort(
        (left, right) =>
          left.region.localeCompare(right.region) || left.clusterIdentifier.localeCompare(right.clusterIdentifier),
      ),
  };
};

/**
 * Hydrates discovered Redshift clusters with their recent CPU summary.
 *
 * @param resources - Catalog resources filtered to Redshift cluster resource types.
 * @returns Hydrated Redshift cluster metrics for rule evaluation.
 */
export const hydrateAwsRedshiftClusterMetrics = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsRedshiftClusterMetric[]> => {
  const { resources: clusters } = await hydrateAwsRedshiftClusters(resources);
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
          dimensions: [{ Name: 'ClusterIdentifier', Value: cluster.clusterIdentifier }],
          id: `cpu${index}`,
          metricName: 'CPUUtilization',
          namespace: 'AWS/Redshift',
          period: REDSHIFT_DAILY_PERIOD_IN_SECONDS,
          stat: 'Average',
        })),
        region,
        startTime: new Date(Date.now() - REDSHIFT_CPU_LOOKBACK_DAYS * REDSHIFT_DAILY_PERIOD_IN_SECONDS * 1000),
      });

      return regionClusters.map((cluster, index) => {
        const points = metricData.get(`cpu${index}`) ?? [];

        return {
          accountId: cluster.accountId,
          averageCpuUtilizationLast14Days:
            points.length >= REDSHIFT_CPU_LOOKBACK_DAYS
              ? points.reduce((sum, point) => sum + point.value, 0) / points.length
              : null,
          clusterIdentifier: cluster.clusterIdentifier,
          region,
        } satisfies AwsRedshiftClusterMetric;
      });
    }),
  );

  return hydratedPages
    .flat()
    .sort(
      (left, right) =>
        left.region.localeCompare(right.region) || left.clusterIdentifier.localeCompare(right.clusterIdentifier),
    );
};

/**
 * Hydrates discovered Redshift reserved nodes with their coverage metadata.
 *
 * Resource Explorer does not expose Redshift reserved nodes, so cluster
 * resources seed the regions queried by `DescribeReservedNodes`.
 *
 * @param resources - Catalog resources filtered to Redshift cluster resource types.
 * @returns Hydrated Redshift reserved nodes for rule evaluation.
 */
export const hydrateAwsRedshiftReservedNodes = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsRedshiftReservedNode[]> => {
  const accountIdsByRegion = new Map<string, string>();

  for (const resource of resources) {
    accountIdsByRegion.set(resource.region, accountIdsByRegion.get(resource.region) ?? resource.accountId);
  }

  const hydratedPages = await Promise.all(
    [...accountIdsByRegion.entries()].map(async ([region, accountId]) => {
      const client = createRedshiftClient({ region });
      const reservedNodes: AwsRedshiftReservedNode[] = [];
      let marker: string | undefined;

      do {
        const response = await withAwsServiceErrorContext('Amazon Redshift', 'DescribeReservedNodes', region, () =>
          client.send(
            new DescribeReservedNodesCommand({
              Marker: marker,
              MaxRecords: REDSHIFT_PAGE_SIZE,
            }),
          ),
        );

        for (const reservedNode of response.ReservedNodes ?? []) {
          if (!reservedNode.ReservedNodeId || !reservedNode.NodeType || !reservedNode.NodeCount) {
            continue;
          }

          reservedNodes.push({
            accountId,
            nodeCount: reservedNode.NodeCount,
            nodeType: reservedNode.NodeType,
            region,
            reservedNodeId: reservedNode.ReservedNodeId,
            startTime: reservedNode.StartTime?.toISOString(),
            state: reservedNode.State,
          });
        }

        marker = response.Marker;
      } while (marker);

      return reservedNodes;
    }),
  );

  return hydratedPages
    .flat()
    .sort(
      (left, right) =>
        left.region.localeCompare(right.region) || left.reservedNodeId.localeCompare(right.reservedNodeId),
    );
};

const loadRedshiftScheduledClusterStateSafely = async (
  client: ReturnType<typeof createRedshiftClient>,
  region: string,
  clusters: AwsRedshiftCluster[],
): Promise<{
  diagnostic?: ScanDiagnostic;
  pauseResumeStateAvailable: boolean;
  scheduleStateByCluster: Map<string, { hasPauseSchedule: boolean; hasResumeSchedule: boolean }>;
}> => {
  try {
    return {
      diagnostic: undefined,
      pauseResumeStateAvailable: true,
      scheduleStateByCluster: await loadRedshiftScheduledClusterState(client, region, clusters),
    };
  } catch (err) {
    if (!isAwsAccessDeniedError(err)) {
      throw err;
    }

    // Schedule hydration is best-effort so missing DescribeScheduledActions
    // permission does not suppress unrelated Redshift discovery rules.
    return {
      diagnostic: {
        code: getAwsErrorCode(err),
        details: err instanceof Error ? err.message : String(err),
        message: buildRedshiftScheduleAccessDeniedMessage(region, err),
        provider: 'aws',
        region,
        service: 'redshift',
        source: 'discovery',
        status: 'access_denied',
      },
      pauseResumeStateAvailable: false,
      scheduleStateByCluster: new Map(),
    };
  }
};

const loadRedshiftScheduledClusterState = async (
  client: ReturnType<typeof createRedshiftClient>,
  region: string,
  clusters: AwsRedshiftCluster[],
): Promise<Map<string, { hasPauseSchedule: boolean; hasResumeSchedule: boolean }>> => {
  const scheduleStateByCluster = new Map<string, { hasPauseSchedule: boolean; hasResumeSchedule: boolean }>();

  for (const cluster of clusters) {
    scheduleStateByCluster.set(cluster.clusterIdentifier, {
      hasPauseSchedule: false,
      hasResumeSchedule: false,
    });
  }

  for (const batch of chunkItems(clusters, REDSHIFT_SCHEDULED_ACTION_FILTER_BATCH_SIZE)) {
    let marker: string | undefined;

    do {
      const response = await withAwsServiceErrorContext('Amazon Redshift', 'DescribeScheduledActions', region, () =>
        client.send(
          new DescribeScheduledActionsCommand({
            Active: true,
            Filters: [
              {
                Name: 'cluster-identifier',
                Values: batch.map((cluster) => cluster.clusterIdentifier),
              },
            ],
            Marker: marker,
            MaxRecords: REDSHIFT_PAGE_SIZE,
          }),
        ),
      );

      for (const scheduledAction of response.ScheduledActions ?? []) {
        if (scheduledAction.State !== 'ACTIVE') {
          continue;
        }

        const pauseClusterId = scheduledAction.TargetAction?.PauseCluster?.ClusterIdentifier;
        const resumeClusterId = scheduledAction.TargetAction?.ResumeCluster?.ClusterIdentifier;

        if (pauseClusterId && scheduleStateByCluster.has(pauseClusterId)) {
          const clusterState = scheduleStateByCluster.get(pauseClusterId);

          if (clusterState) {
            clusterState.hasPauseSchedule = true;
          }
        }

        if (resumeClusterId && scheduleStateByCluster.has(resumeClusterId)) {
          const clusterState = scheduleStateByCluster.get(resumeClusterId);

          if (clusterState) {
            clusterState.hasResumeSchedule = true;
          }
        }
      }

      marker = response.Marker;
    } while (marker);
  }

  return scheduleStateByCluster;
};
