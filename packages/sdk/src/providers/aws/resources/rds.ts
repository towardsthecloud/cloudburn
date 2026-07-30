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
// The db-instance-id / db-snapshot-id filters accept many identifiers per
// call, so identifiers are described in batches instead of one call each.
const RDS_DESCRIBE_FILTER_BATCH_SIZE = 100;

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

const listRegionSeeds = (resources: AwsDiscoveredResource[]): Array<{ region: string; accountId: string }> => {
  const regionSeeds = new Map<string, { region: string; accountId: string }>();

  for (const resource of resources) {
    if (!regionSeeds.has(resource.region)) {
      regionSeeds.set(resource.region, {
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
      const accountIdsByIdentifier = new Map(
        regionResources.map((resource) => [resource.dbInstanceIdentifier, resource.accountId]),
      );

      // Batches are independent identifier sets, so they run concurrently;
      // only marker pagination within one batch is inherently sequential.
      const batchPages = await Promise.all(
        chunkItems([...accountIdsByIdentifier.keys()], RDS_DESCRIBE_FILTER_BATCH_SIZE).map(async (batch) => {
          const instances: AwsRdsInstance[] = [];
          let marker: string | undefined;

          do {
            const response = await withAwsServiceErrorContext('Amazon RDS', 'DescribeDBInstances', region, () =>
              client.send(
                new DescribeDBInstancesCommand({
                  Filters: [
                    {
                      Name: 'db-instance-id',
                      Values: batch,
                    },
                  ],
                  Marker: marker,
                }),
              ),
            );

            for (const instance of response.DBInstances ?? []) {
              if (!instance.DBInstanceIdentifier || !instance.DBInstanceClass) {
                continue;
              }

              const accountId = accountIdsByIdentifier.get(instance.DBInstanceIdentifier);

              if (!accountId) {
                continue;
              }

              instances.push({
                accountId,
                dbInstanceIdentifier: instance.DBInstanceIdentifier,
                dbInstanceStatus: instance.DBInstanceStatus,
                engine: instance.Engine,
                engineVersion: instance.EngineVersion,
                instanceClass: instance.DBInstanceClass,
                instanceCreateTime: instance.InstanceCreateTime?.toISOString(),
                multiAz: instance.MultiAZ,
                region,
                storageType: instance.StorageType,
              });
            }

            marker = response.Marker;
          } while (marker);

          return instances;
        }),
      );

      return batchPages.flat();
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
    listRegionSeeds(resources).map(async ({ region, accountId }) => {
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
      const accountIdsByIdentifier = new Map(
        regionResources.map((resource) => [resource.dbSnapshotIdentifier, resource.accountId]),
      );

      // Batches are independent identifier sets, so they run concurrently.
      // Identifiers for snapshots that no longer exist are silently omitted
      // by the filter, so stale catalog entries need no per-identifier error
      // handling.
      const batchPages = await Promise.all(
        chunkItems([...accountIdsByIdentifier.keys()], RDS_DESCRIBE_FILTER_BATCH_SIZE).map(async (batch) => {
          const snapshots: AwsRdsSnapshot[] = [];
          let marker: string | undefined;

          do {
            const response = await withAwsServiceErrorContext('Amazon RDS', 'DescribeDBSnapshots', region, () =>
              client.send(
                new DescribeDBSnapshotsCommand({
                  Filters: [
                    {
                      Name: 'db-snapshot-id',
                      Values: batch,
                    },
                  ],
                  Marker: marker,
                }),
              ),
            );

            for (const snapshot of response.DBSnapshots ?? []) {
              if (!snapshot.DBSnapshotIdentifier) {
                continue;
              }

              const accountId = accountIdsByIdentifier.get(snapshot.DBSnapshotIdentifier);

              if (!accountId) {
                continue;
              }

              snapshots.push({
                accountId,
                dbInstanceIdentifier: snapshot.DBInstanceIdentifier,
                dbSnapshotIdentifier: snapshot.DBSnapshotIdentifier,
                region,
                snapshotCreateTime: snapshot.SnapshotCreateTime?.toISOString(),
                snapshotType: snapshot.SnapshotType,
              });
            }

            marker = response.Marker;
          } while (marker);

          return snapshots;
        }),
      );

      return batchPages.flat();
    }),
  );

  return hydratedPages
    .flat()
    .sort((left, right) => left.dbSnapshotIdentifier.localeCompare(right.dbSnapshotIdentifier));
};
