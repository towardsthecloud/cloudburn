import { DescribeNodegroupCommand, ListNodegroupsCommand } from '@aws-sdk/client-eks';
import type { AwsDiscoveredResource, AwsEksNodegroup } from '@cloudburn/rules';
import { createEksClient } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const EKS_NODEGROUP_CONCURRENCY = 5;

type ParsedEksClusterResource = {
  clusterArn: string;
  clusterName: string;
};

const parseEksClusterResource = (arn: string): ParsedEksClusterResource | null => {
  const arnSegments = arn.split(':');
  const resourceSegment = arnSegments[5];

  if (!resourceSegment?.startsWith('cluster/')) {
    return null;
  }

  const clusterName = resourceSegment.slice('cluster/'.length);

  return clusterName
    ? {
        clusterArn: arn,
        clusterName,
      }
    : null;
};

/**
 * Hydrates discovered EKS clusters into managed node group resources.
 *
 * @param resources - Catalog resources filtered to EKS cluster resource types.
 * @returns Normalized EKS node group models for rule evaluation.
 */
export const hydrateAwsEksNodegroups = async (resources: AwsDiscoveredResource[]): Promise<AwsEksNodegroup[]> => {
  const clustersByRegion = new Map<string, Array<{ accountId: string } & ParsedEksClusterResource>>();

  for (const resource of resources) {
    const parsed = parseEksClusterResource(resource.arn);

    if (!parsed) {
      continue;
    }

    const regionClusters = clustersByRegion.get(resource.region) ?? [];
    regionClusters.push({
      accountId: resource.accountId,
      ...parsed,
    });
    clustersByRegion.set(resource.region, regionClusters);
  }

  const hydratedPages = await Promise.all(
    [...clustersByRegion.entries()].map(async ([region, regionClusters]) => {
      const client = createEksClient({ region });
      const nodegroups: AwsEksNodegroup[] = [];

      for (const cluster of regionClusters) {
        let nextToken: string | undefined;
        const nodegroupNames: string[] = [];

        do {
          const response = await withAwsServiceErrorContext('Amazon EKS', 'ListNodegroups', region, () =>
            client.send(
              new ListNodegroupsCommand({
                clusterName: cluster.clusterName,
                nextToken,
              }),
            ),
          );

          nodegroupNames.push(...(response.nodegroups ?? []));
          nextToken = response.nextToken;
        } while (nextToken);

        for (const batch of chunkItems(nodegroupNames, EKS_NODEGROUP_CONCURRENCY)) {
          const describedBatch = await Promise.all(
            batch.map(async (nodegroupName) => {
              const response = await withAwsServiceErrorContext('Amazon EKS', 'DescribeNodegroup', region, () =>
                client.send(
                  new DescribeNodegroupCommand({
                    clusterName: cluster.clusterName,
                    nodegroupName,
                  }),
                ),
              );

              if (!response.nodegroup?.nodegroupArn || !response.nodegroup.nodegroupName) {
                return null;
              }

              return {
                accountId: cluster.accountId,
                amiType: response.nodegroup.amiType,
                clusterArn: cluster.clusterArn,
                clusterName: cluster.clusterName,
                instanceTypes: response.nodegroup.instanceTypes?.map(String) ?? [],
                nodegroupArn: response.nodegroup.nodegroupArn,
                nodegroupName: response.nodegroup.nodegroupName,
                region,
              } satisfies AwsEksNodegroup;
            }),
          );

          nodegroups.push(...describedBatch.flatMap((nodegroup): AwsEksNodegroup[] => (nodegroup ? [nodegroup] : [])));
        }
      }

      return nodegroups;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.nodegroupArn.localeCompare(right.nodegroupArn));
};
