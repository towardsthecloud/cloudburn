import { DescribeAddressesCommand } from '@aws-sdk/client-ec2';
import type { AwsDiscoveredResource, AwsEc2ElasticIp } from '@cloudburn/rules';
import { createEc2Client } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const ELASTIC_IP_ARN_PREFIX = 'elastic-ip/';
const EIP_DESCRIBE_BATCH_SIZE = 100;

const isElasticIpMissingError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const serviceError = error as Error & { code?: string; Code?: string };
  const candidates = [error.name, serviceError.code, serviceError.Code, error.message]
    .filter((value): value is string => value !== undefined)
    .map((value) => value.toLowerCase());

  return candidates.some(
    (value) =>
      value.includes('invalidallocationid.notfound') ||
      (value.includes('allocation id') && value.includes('does not exist')),
  );
};

const describeElasticIpBatch = async (
  region: string,
  batch: Array<{ accountId: string; allocationId: string }>,
): Promise<
  Array<{
    accountId: string;
    allocationId: string;
    publicIp: string;
    associationId?: string;
    instanceId?: string;
    networkInterfaceId?: string;
  }>
> => {
  const client = createEc2Client({ region });

  try {
    const response = await withAwsServiceErrorContext(
      'Amazon EC2',
      'DescribeAddresses',
      region,
      () =>
        client.send(
          new DescribeAddressesCommand({
            AllocationIds: batch.map(({ allocationId }) => allocationId),
          }),
        ),
      {
        passthrough: isElasticIpMissingError,
      },
    );

    return (response.Addresses ?? []).flatMap((address) => {
      if (!address.AllocationId || !address.PublicIp) {
        return [];
      }

      const discoveredResource = batch.find(({ allocationId }) => allocationId === address.AllocationId);

      if (!discoveredResource) {
        return [];
      }

      return [
        {
          accountId: discoveredResource.accountId,
          allocationId: address.AllocationId,
          ...(address.AssociationId ? { associationId: address.AssociationId } : {}),
          ...(address.InstanceId ? { instanceId: address.InstanceId } : {}),
          ...(address.NetworkInterfaceId ? { networkInterfaceId: address.NetworkInterfaceId } : {}),
          publicIp: address.PublicIp,
        },
      ];
    });
  } catch (error) {
    if (!isElasticIpMissingError(error)) {
      throw error;
    }

    if (batch.length === 1) {
      return [];
    }

    const describedResources = await Promise.all(
      batch.map(async (resource) => describeElasticIpBatch(region, [resource])),
    );
    return describedResources.flat();
  }
};

const extractAllocationId = (resource: AwsDiscoveredResource): string | null => {
  if (resource.name?.startsWith('eipalloc-')) {
    return resource.name;
  }

  const arnSegments = resource.arn.split(':');
  const resourceSegment = arnSegments[5];

  if (!resourceSegment?.startsWith(ELASTIC_IP_ARN_PREFIX)) {
    return null;
  }

  return resourceSegment.slice(ELASTIC_IP_ARN_PREFIX.length);
};

/**
 * Hydrates discovered Elastic IP resources with association metadata.
 *
 * @param resources - Catalog resources filtered to Elastic IP resource types.
 * @returns Hydrated Elastic IP models for rule evaluation.
 */
export const hydrateAwsEc2ElasticIps = async (resources: AwsDiscoveredResource[]): Promise<AwsEc2ElasticIp[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; allocationId: string }>>();

  for (const resource of resources) {
    const allocationId = extractAllocationId(resource);

    if (!allocationId) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({
      accountId: resource.accountId,
      allocationId,
    });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const addresses: AwsEc2ElasticIp[] = [];

      for (const batch of chunkItems(regionResources, EIP_DESCRIBE_BATCH_SIZE)) {
        addresses.push(
          ...(await describeElasticIpBatch(region, batch)).map((address) => ({
            ...address,
            region,
          })),
        );
      }

      return addresses;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.allocationId.localeCompare(right.allocationId));
};
