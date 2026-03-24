import {
  DescribeDBInstancesCommand,
  DescribeDBSnapshotsCommand,
  DescribeReservedDBInstancesCommand,
} from '@aws-sdk/client-rds';
import type { AwsDiscoveredResource, AwsRdsInstance, AwsRdsReservedInstance, AwsRdsSnapshot } from '@cloudburn/rules';
import { createRdsClient } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const RDS_DB_ARN_PREFIX = 'db:';
const RDS_SNAPSHOT_ARN_PREFIX = 'snapshot:';
const RDS_HYDRATION_CONCURRENCY = 10;

const isDbSnapshotMissingError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'DBSnapshotNotFound' ||
    error.name === 'DBSnapshotNotFoundFault' ||
    error.message.includes('DBSnapshotNotFound'));

const extractDbInstanceIdentifier = (arn: string): string | null => {
  const resourceSegment = arn.split(':').slice(5).join(':');

  if (!resourceSegment.startsWith(RDS_DB_ARN_PREFIX)) {
    return null;
  }

  return resourceSegment.slice(RDS_DB_ARN_PREFIX.length);
};

const extractDbSnapshotIdentifier = (arn: string): string | null => {
  const resourceSegment = arn.split(':').slice(5).join(':');

  if (!resourceSegment.startsWith(RDS_SNAPSHOT_ARN_PREFIX)) {
    return null;
  }

  return resourceSegment.slice(RDS_SNAPSHOT_ARN_PREFIX.length);
};

const listAccountRegionSeeds = (resources: AwsDiscoveredResource[]): Array<{ region: string; accountId: string }> => {
  const regionSeeds = new Map<string, { region: string; accountId: string }>();

  for (const resource of resources) {
    const seedKey = `${resource.accountId}:${resource.region}`;

    if (!regionSeeds.has(seedKey)) {
      regionSeeds.set(seedKey, {
        accountId: resource.accountId,
        region: resource.region,
      });
    }
  }

  return [...regionSeeds.values()];
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
              dbInstanceStatus: instance.DBInstanceStatus,
              engine: instance.Engine,
              engineVersion: instance.EngineVersion,
              instanceClass: instance.DBInstanceClass,
              instanceCreateTime: instance.InstanceCreateTime?.toISOString(),
              multiAz: instance.MultiAZ,
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

/**
 * Hydrates discovered RDS regions with their reserved DB instances for coverage checks.
 *
 * @param resources - Catalog resources filtered to RDS DB instance resource types.
 * @returns Hydrated RDS reserved DB instances for rule evaluation.
 */
export const hydrateAwsRdsReservedInstances = async (
  resources: AwsDiscoveredResource[],
): Promise<AwsRdsReservedInstance[]> => {
  const hydratedPages = await Promise.all(
    listAccountRegionSeeds(resources).map(async ({ region, accountId }) => {
      const client = createRdsClient({ region });
      const reservedInstances: AwsRdsReservedInstance[] = [];
      let marker: string | undefined;

      do {
        const response = await withAwsServiceErrorContext('Amazon RDS', 'DescribeReservedDBInstances', region, () =>
          client.send(
            new DescribeReservedDBInstancesCommand({
              Marker: marker,
            }),
          ),
        );

        for (const reservedInstance of response.ReservedDBInstances ?? []) {
          if (!reservedInstance.ReservedDBInstanceId || !reservedInstance.DBInstanceClass) {
            continue;
          }

          reservedInstances.push({
            accountId,
            instanceClass: reservedInstance.DBInstanceClass,
            instanceCount: reservedInstance.DBInstanceCount ?? 0,
            multiAz: reservedInstance.MultiAZ,
            productDescription: reservedInstance.ProductDescription,
            region,
            reservedDbInstanceId: reservedInstance.ReservedDBInstanceId,
            startTime: reservedInstance.StartTime?.toISOString(),
            state: reservedInstance.State,
          });
        }

        marker = response.Marker;
      } while (marker);

      return reservedInstances;
    }),
  );

  return hydratedPages
    .flat()
    .sort(
      (left, right) =>
        left.accountId.localeCompare(right.accountId) ||
        left.region.localeCompare(right.region) ||
        left.reservedDbInstanceId.localeCompare(right.reservedDbInstanceId),
    );
};

/**
 * Hydrates discovered RDS DB snapshots for orphaned snapshot checks.
 *
 * @param resources - Catalog resources filtered to RDS DB snapshot resource types.
 * @returns Hydrated RDS snapshot models for rule evaluation.
 */
export const hydrateAwsRdsSnapshots = async (resources: AwsDiscoveredResource[]): Promise<AwsRdsSnapshot[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; dbSnapshotIdentifier: string }>>();

  for (const resource of resources) {
    const dbSnapshotIdentifier = extractDbSnapshotIdentifier(resource.arn);

    if (!dbSnapshotIdentifier) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({
      accountId: resource.accountId,
      dbSnapshotIdentifier,
    });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createRdsClient({ region });
      const snapshots: AwsRdsSnapshot[] = [];

      for (const batch of chunkItems(regionResources, RDS_HYDRATION_CONCURRENCY)) {
        const hydratedBatch = await Promise.all(
          batch.map(async (resource) => {
            try {
              const response = await withAwsServiceErrorContext(
                'Amazon RDS',
                'DescribeDBSnapshots',
                region,
                () =>
                  client.send(
                    new DescribeDBSnapshotsCommand({
                      DBSnapshotIdentifier: resource.dbSnapshotIdentifier,
                    }),
                  ),
                {
                  passthrough: isDbSnapshotMissingError,
                },
              );
              const snapshot = response.DBSnapshots?.[0];

              if (!snapshot?.DBSnapshotIdentifier) {
                return null;
              }

              return {
                accountId: resource.accountId,
                dbInstanceIdentifier: snapshot.DBInstanceIdentifier,
                dbSnapshotIdentifier: snapshot.DBSnapshotIdentifier,
                region,
                snapshotCreateTime: snapshot.SnapshotCreateTime?.toISOString(),
                snapshotType: snapshot.SnapshotType,
              } satisfies AwsRdsSnapshot;
            } catch (error) {
              if (isDbSnapshotMissingError(error)) {
                return null;
              }

              throw error;
            }
          }),
        );

        snapshots.push(...hydratedBatch.flatMap((snapshot) => (snapshot ? [snapshot] : [])));
      }

      return snapshots;
    }),
  );

  return hydratedPages
    .flat()
    .sort((left, right) => left.dbSnapshotIdentifier.localeCompare(right.dbSnapshotIdentifier));
};
