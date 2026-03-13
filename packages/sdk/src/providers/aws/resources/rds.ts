import { DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import type { AwsDiscoveredResource, AwsRdsInstance } from '@cloudburn/rules';
import { createRdsClient } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const RDS_DB_ARN_PREFIX = 'db:';
const RDS_HYDRATION_CONCURRENCY = 10;

const extractDbInstanceIdentifier = (arn: string): string | null => {
  const resourceSegment = arn.split(':').slice(5).join(':');

  if (!resourceSegment.startsWith(RDS_DB_ARN_PREFIX)) {
    return null;
  }

  return resourceSegment.slice(RDS_DB_ARN_PREFIX.length);
};

/**
 * Hydrates discovered RDS DB instances with normalized instance-class metadata.
 *
 * @param resources - Catalog resources filtered to RDS DB instance resource types.
 * @returns Hydrated RDS DB instance models for rule evaluation.
 */
export const hydrateAwsRdsInstances = async (resources: AwsDiscoveredResource[]): Promise<AwsRdsInstance[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; dbInstanceIdentifier: string }>>();

  for (const resource of resources) {
    const dbInstanceIdentifier = extractDbInstanceIdentifier(resource.arn);

    if (!dbInstanceIdentifier) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({
      accountId: resource.accountId,
      dbInstanceIdentifier,
    });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createRdsClient({ region });
      const instances: AwsRdsInstance[] = [];

      for (const batch of chunkItems(regionResources, RDS_HYDRATION_CONCURRENCY)) {
        const hydratedBatch = await Promise.all(
          batch.map(async (resource) => {
            const response = await withAwsServiceErrorContext('Amazon RDS', 'DescribeDBInstances', region, () =>
              client.send(
                new DescribeDBInstancesCommand({
                  DBInstanceIdentifier: resource.dbInstanceIdentifier,
                }),
              ),
            );
            const instance = response.DBInstances?.[0];

            if (!instance?.DBInstanceIdentifier || !instance.DBInstanceClass) {
              return null;
            }

            return {
              accountId: resource.accountId,
              dbInstanceIdentifier: instance.DBInstanceIdentifier,
              instanceClass: instance.DBInstanceClass,
              region,
            };
          }),
        );

        instances.push(...hydratedBatch.flatMap((instance) => (instance ? [instance] : [])));
      }

      return instances;
    }),
  );

  return hydratedPages
    .flat()
    .sort((left, right) => left.dbInstanceIdentifier.localeCompare(right.dbInstanceIdentifier));
};
