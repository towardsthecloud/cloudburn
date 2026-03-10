import { DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import type { AwsDiscoveredResource, AwsEc2Instance } from '@cloudburn/rules';
import { createEc2Client } from '../client.js';
import { chunkItems } from './utils.js';

const EC2_INSTANCE_ARN_PREFIX = 'instance/';
const EC2_DESCRIBE_BATCH_SIZE = 100;

const extractInstanceId = (arn: string): string | null => {
  const arnSegments = arn.split(':');
  const resourceSegment = arnSegments[5];

  if (!resourceSegment?.startsWith(EC2_INSTANCE_ARN_PREFIX)) {
    return null;
  }

  return resourceSegment.slice(EC2_INSTANCE_ARN_PREFIX.length);
};

/**
 * Hydrates discovered EC2 instances with their instance type.
 *
 * @param resources - Catalog resources filtered to EC2 instance resource types.
 * @returns Hydrated EC2 instance models for rule evaluation.
 */
export const hydrateAwsEc2Instances = async (resources: AwsDiscoveredResource[]): Promise<AwsEc2Instance[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; instanceId: string }>>();

  for (const resource of resources) {
    const instanceId = extractInstanceId(resource.arn);

    if (!instanceId) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({
      accountId: resource.accountId,
      instanceId,
    });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createEc2Client({ region });
      const instances: AwsEc2Instance[] = [];

      for (const batch of chunkItems(regionResources, EC2_DESCRIBE_BATCH_SIZE)) {
        const response = await client.send(
          new DescribeInstancesCommand({
            InstanceIds: batch.map(({ instanceId }) => instanceId),
          }),
        );

        for (const reservation of response.Reservations ?? []) {
          for (const instance of reservation.Instances ?? []) {
            if (!instance.InstanceId || !instance.InstanceType) {
              continue;
            }

            const discoveredResource = batch.find(({ instanceId }) => instanceId === instance.InstanceId);

            if (!discoveredResource) {
              continue;
            }

            instances.push({
              accountId: discoveredResource.accountId,
              instanceId: instance.InstanceId,
              instanceType: instance.InstanceType,
              region,
            });
          }
        }
      }

      return instances;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.instanceId.localeCompare(right.instanceId));
};
