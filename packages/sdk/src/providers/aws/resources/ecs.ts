import { DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { DescribeContainerInstancesCommand, DescribeServicesCommand } from '@aws-sdk/client-ecs';
import type { AwsDiscoveredResource, AwsEcsCluster, AwsEcsContainerInstance, AwsEcsService } from '@cloudburn/rules';
import { createEc2Client, createEcsClient } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const ECS_CONTAINER_INSTANCE_BATCH_SIZE = 100;
const ECS_SERVICE_BATCH_SIZE = 10;

type ParsedEcsClusterResource = {
  clusterArn: string;
  clusterName: string;
};

type ParsedEcsServiceResource = {
  serviceArn: string;
  clusterName: string;
  serviceName: string;
};

type ParsedEcsContainerInstanceResource = {
  containerInstanceArn: string;
  clusterArn: string;
  clusterName: string;
};

const parseEcsClusterResource = (arn: string): ParsedEcsClusterResource | null => {
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

const parseEcsServiceResource = (arn: string): ParsedEcsServiceResource | null => {
  const arnSegments = arn.split(':');
  const resourceSegment = arnSegments[5];

  if (!resourceSegment?.startsWith('service/')) {
    return null;
  }

  const resourceParts = resourceSegment.split('/');

  if (resourceParts.length < 3) {
    return null;
  }

  const clusterName = resourceParts[1];
  const serviceName = resourceParts[2];

  return clusterName && serviceName
    ? {
        clusterName,
        serviceArn: arn,
        serviceName,
      }
    : null;
};

const parseEcsContainerInstanceResource = (arn: string): ParsedEcsContainerInstanceResource | null => {
  const arnSegments = arn.split(':');
  const resourceSegment = arnSegments[5];

  if (!resourceSegment?.startsWith('container-instance/')) {
    return null;
  }

  const resourceParts = resourceSegment.split('/');

  if (resourceParts.length < 3) {
    return null;
  }

  const clusterName = resourceParts[1];

  if (!clusterName) {
    return null;
  }

  return {
    clusterArn: `arn:${arnSegments[1]}:${arnSegments[2]}:${arnSegments[3]}:${arnSegments[4]}:cluster/${clusterName}`,
    clusterName,
    containerInstanceArn: arn,
  };
};

/**
 * Hydrates discovered ECS clusters from Resource Explorer cluster resources.
 *
 * @param resources - Catalog resources filtered to ECS cluster resource types.
 * @returns Normalized ECS cluster models for rule evaluation.
 */
export const hydrateAwsEcsClusters = async (resources: AwsDiscoveredResource[]): Promise<AwsEcsCluster[]> =>
  resources
    .flatMap((resource) => {
      const parsed = parseEcsClusterResource(resource.arn);

      return parsed
        ? [
            {
              accountId: resource.accountId,
              clusterArn: parsed.clusterArn,
              clusterName: parsed.clusterName,
              region: resource.region,
            } satisfies AwsEcsCluster,
          ]
        : [];
    })
    .sort((left, right) => left.clusterArn.localeCompare(right.clusterArn));

/**
 * Hydrates discovered ECS services with scheduling and desired-count metadata.
 *
 * @param resources - Catalog resources filtered to ECS service resource types.
 * @returns Normalized ECS service models for rule evaluation.
 */
export const hydrateAwsEcsServices = async (resources: AwsDiscoveredResource[]): Promise<AwsEcsService[]> => {
  const servicesByRegionAndCluster = new Map<string, Array<{ accountId: string; serviceArn: string }>>();

  for (const resource of resources) {
    const parsed = parseEcsServiceResource(resource.arn);

    if (!parsed) {
      continue;
    }

    const mapKey = `${resource.region}:${parsed.clusterName}`;
    const clusterServices = servicesByRegionAndCluster.get(mapKey) ?? [];
    clusterServices.push({
      accountId: resource.accountId,
      serviceArn: parsed.serviceArn,
    });
    servicesByRegionAndCluster.set(mapKey, clusterServices);
  }

  const hydratedPages = await Promise.all(
    [...servicesByRegionAndCluster.entries()].map(async ([mapKey, clusterServices]) => {
      const separatorIndex = mapKey.indexOf(':');
      const region = mapKey.slice(0, separatorIndex);
      const clusterName = mapKey.slice(separatorIndex + 1);
      const client = createEcsClient({ region });
      const services: AwsEcsService[] = [];

      for (const batch of chunkItems(clusterServices, ECS_SERVICE_BATCH_SIZE)) {
        const batchAccountIds = new Map(batch.map((service) => [service.serviceArn, service.accountId] as const));
        const response = await withAwsServiceErrorContext('Amazon ECS', 'DescribeServices', region, () =>
          client.send(
            new DescribeServicesCommand({
              cluster: clusterName,
              services: batch.map((service) => service.serviceArn),
            }),
          ),
        );

        for (const service of response.services ?? []) {
          if (
            !service.serviceArn ||
            !service.serviceName ||
            !service.clusterArn ||
            service.desiredCount === undefined
          ) {
            continue;
          }

          services.push({
            accountId: batchAccountIds.get(service.serviceArn) ?? batch[0]?.accountId ?? '',
            clusterArn: service.clusterArn,
            clusterName,
            desiredCount: service.desiredCount,
            region,
            schedulingStrategy: service.schedulingStrategy ?? 'REPLICA',
            serviceArn: service.serviceArn,
            serviceName: service.serviceName,
            status: service.status,
          });
        }
      }

      return services.filter((service) => service.accountId.length > 0);
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.serviceArn.localeCompare(right.serviceArn));
};

/**
 * Hydrates discovered ECS container instances with backing EC2 instance metadata.
 *
 * @param resources - Catalog resources filtered to ECS container instance resource types.
 * @returns Normalized ECS container instance models for rule evaluation.
 */
export const hydrateAwsEcsContainerInstances = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsEcsContainerInstance[]> => {
  const resourcesByRegionAndCluster = new Map<
    string,
    Array<{ accountId: string; clusterArn: string; containerInstanceArn: string }>
  >();

  for (const resource of resources) {
    const parsed = parseEcsContainerInstanceResource(resource.arn);

    if (!parsed) {
      continue;
    }

    const mapKey = `${resource.region}:${parsed.clusterName}`;
    const clusterResources = resourcesByRegionAndCluster.get(mapKey) ?? [];
    clusterResources.push({
      accountId: resource.accountId,
      clusterArn: parsed.clusterArn,
      containerInstanceArn: parsed.containerInstanceArn,
    });
    resourcesByRegionAndCluster.set(mapKey, clusterResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegionAndCluster.entries()].map(async ([mapKey, clusterResources]) => {
      const separatorIndex = mapKey.indexOf(':');
      const region = mapKey.slice(0, separatorIndex);
      const clusterName = mapKey.slice(separatorIndex + 1);
      const ecsClient = createEcsClient({ region });
      const ec2Client = createEc2Client({ region });
      const containerInstances: AwsEcsContainerInstance[] = [];

      for (const batch of chunkItems(clusterResources, ECS_CONTAINER_INSTANCE_BATCH_SIZE)) {
        const response = await withAwsServiceErrorContext('Amazon ECS', 'DescribeContainerInstances', region, () =>
          ecsClient.send(
            new DescribeContainerInstancesCommand({
              cluster: clusterName,
              containerInstances: batch.map((resource) => resource.containerInstanceArn),
            }),
          ),
        );
        const ec2InstanceIds = (response.containerInstances ?? [])
          .flatMap((instance) => (instance.ec2InstanceId ? [instance.ec2InstanceId] : []))
          .sort((left, right) => left.localeCompare(right));
        const ec2Metadata = new Map<string, { architecture?: string; instanceType?: string }>();

        if (ec2InstanceIds.length > 0) {
          const ec2Response = await withAwsServiceErrorContext('Amazon EC2', 'DescribeInstances', region, () =>
            ec2Client.send(
              new DescribeInstancesCommand({
                InstanceIds: ec2InstanceIds,
              }),
            ),
          );

          for (const reservation of ec2Response.Reservations ?? []) {
            for (const instance of reservation.Instances ?? []) {
              if (!instance.InstanceId) {
                continue;
              }

              ec2Metadata.set(instance.InstanceId, {
                architecture: instance.Architecture,
                instanceType: instance.InstanceType,
              });
            }
          }
        }

        const batchAccountIds = new Map(
          batch.map(
            (resource) =>
              [
                resource.containerInstanceArn,
                { accountId: resource.accountId, clusterArn: resource.clusterArn },
              ] as const,
          ),
        );

        for (const containerInstance of response.containerInstances ?? []) {
          if (!containerInstance.containerInstanceArn) {
            continue;
          }

          const batchResource = batchAccountIds.get(containerInstance.containerInstanceArn);

          if (!batchResource) {
            continue;
          }

          const ec2Instance = containerInstance.ec2InstanceId
            ? ec2Metadata.get(containerInstance.ec2InstanceId)
            : undefined;

          containerInstances.push({
            accountId: batchResource.accountId,
            architecture: ec2Instance?.architecture,
            clusterArn: batchResource.clusterArn,
            containerInstanceArn: containerInstance.containerInstanceArn,
            ec2InstanceId: containerInstance.ec2InstanceId,
            instanceType: ec2Instance?.instanceType,
            region,
          });
        }
      }

      return containerInstances;
    }),
  );

  return hydratedPages
    .flat()
    .sort((left, right) => left.containerInstanceArn.localeCompare(right.containerInstanceArn));
};
