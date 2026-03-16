import { DescribeReservedInstancesCommand } from '@aws-sdk/client-ec2';
import type { AwsDiscoveredResource, AwsEc2ReservedInstance } from '@cloudburn/rules';
import { createEc2Client } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const EC2_RESERVED_INSTANCE_ARN_PREFIX = 'reserved-instances/';
const EC2_RESERVED_INSTANCE_BATCH_SIZE = 100;

const extractReservedInstanceId = (arn: string): string | null => {
  const arnSegments = arn.split(':');
  const resourceSegment = arnSegments[5];

  if (!resourceSegment?.startsWith(EC2_RESERVED_INSTANCE_ARN_PREFIX)) {
    return null;
  }

  return resourceSegment.slice(EC2_RESERVED_INSTANCE_ARN_PREFIX.length);
};

const isReservedInstanceMissingError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'InvalidReservedInstancesId.NotFound' ||
    error.message.includes('InvalidReservedInstancesId.NotFound'));

/**
 * Hydrates discovered EC2 reserved instances with their renewal metadata.
 *
 * @param resources - Catalog resources filtered to EC2 reserved-instance resource types.
 * @returns Hydrated EC2 reserved instances for rule evaluation.
 */
export const hydrateAwsEc2ReservedInstances = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsEc2ReservedInstance[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; reservedInstancesId: string }>>();

  for (const resource of resources) {
    const reservedInstancesId = extractReservedInstanceId(resource.arn);

    if (!reservedInstancesId) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({
      accountId: resource.accountId,
      reservedInstancesId,
    });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createEc2Client({ region });
      const reservedInstances: AwsEc2ReservedInstance[] = [];

      for (const batch of chunkItems(regionResources, EC2_RESERVED_INSTANCE_BATCH_SIZE)) {
        const accountIdByReservedInstanceId = new Map(
          batch.map((resource) => [resource.reservedInstancesId, resource.accountId] as const),
        );
        let describedReservedInstances: Array<{
          End?: Date;
          InstanceType?: string;
          ReservedInstancesId?: string;
          State?: string;
        }> = [];

        try {
          const response = await withAwsServiceErrorContext(
            'Amazon EC2',
            'DescribeReservedInstances',
            region,
            () =>
              client.send(
                new DescribeReservedInstancesCommand({
                  ReservedInstancesIds: batch.map((resource) => resource.reservedInstancesId),
                }),
              ),
            {
              passthrough: isReservedInstanceMissingError,
            },
          );
          describedReservedInstances = response.ReservedInstances ?? [];
        } catch (error) {
          if (!isReservedInstanceMissingError(error)) {
            throw error;
          }

          for (const resource of batch) {
            try {
              const response = await withAwsServiceErrorContext(
                'Amazon EC2',
                'DescribeReservedInstances',
                region,
                () =>
                  client.send(
                    new DescribeReservedInstancesCommand({
                      ReservedInstancesIds: [resource.reservedInstancesId],
                    }),
                  ),
                {
                  passthrough: isReservedInstanceMissingError,
                },
              );
              describedReservedInstances.push(...(response.ReservedInstances ?? []));
            } catch (innerError) {
              if (!isReservedInstanceMissingError(innerError)) {
                throw innerError;
              }
            }
          }
        }

        for (const reservedInstance of describedReservedInstances) {
          if (!reservedInstance.ReservedInstancesId || !reservedInstance.InstanceType) {
            continue;
          }

          const accountId = accountIdByReservedInstanceId.get(reservedInstance.ReservedInstancesId);

          if (!accountId) {
            continue;
          }

          reservedInstances.push({
            accountId,
            endTime: reservedInstance.End?.toISOString(),
            instanceType: reservedInstance.InstanceType,
            region,
            reservedInstancesId: reservedInstance.ReservedInstancesId,
            state: reservedInstance.State,
          });
        }
      }

      return reservedInstances;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.reservedInstancesId.localeCompare(right.reservedInstancesId));
};
