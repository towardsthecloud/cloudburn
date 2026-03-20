import { DescribeSnapshotsCommand, DescribeVolumesCommand } from '@aws-sdk/client-ec2';
import type { AwsDiscoveredResource, AwsEbsSnapshot, AwsEbsVolume } from '@cloudburn/rules';
import { createEc2Client } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const EBS_VOLUME_ARN_PREFIX = 'volume/';
const EBS_SNAPSHOT_ARN_PREFIX = 'snapshot/';
const EBS_DESCRIBE_BATCH_SIZE = 200;

const extractEc2ResourceId = (arn: string, prefix: string): string | null => {
  const arnSegments = arn.split(':');
  const resourceSegment = arnSegments[5];

  if (!resourceSegment?.startsWith(prefix)) {
    return null;
  }

  return resourceSegment.slice(prefix.length);
};

const extractVolumeId = (arn: string): string | null => extractEc2ResourceId(arn, EBS_VOLUME_ARN_PREFIX);

const extractSnapshotId = (arn: string): string | null => extractEc2ResourceId(arn, EBS_SNAPSHOT_ARN_PREFIX);

/**
 * Hydrates discovered EBS volumes with their storage type metadata.
 *
 * @param resources - Catalog resources filtered to EBS volume resource types.
 * @returns Hydrated EBS volume models for rule evaluation.
 */
export const hydrateAwsEbsVolumes = async (resources: AwsDiscoveredResource[]): Promise<AwsEbsVolume[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; volumeId: string }>>();

  for (const resource of resources) {
    const volumeId = extractVolumeId(resource.arn);

    if (!volumeId) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({
      accountId: resource.accountId,
      volumeId,
    });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createEc2Client({ region });
      const volumes: AwsEbsVolume[] = [];

      for (const batch of chunkItems(regionResources, EBS_DESCRIBE_BATCH_SIZE)) {
        const response = await withAwsServiceErrorContext('Amazon EC2', 'DescribeVolumes', region, () =>
          client.send(
            new DescribeVolumesCommand({
              VolumeIds: batch.map(({ volumeId }) => volumeId),
            }),
          ),
        );

        for (const volume of response.Volumes ?? []) {
          if (!volume.VolumeId || !volume.VolumeType) {
            continue;
          }

          const discoveredResource = batch.find(({ volumeId }) => volumeId === volume.VolumeId);

          if (!discoveredResource) {
            continue;
          }

          volumes.push({
            accountId: discoveredResource.accountId,
            attachments: (volume.Attachments ?? []).map((attachment) => ({
              instanceId: attachment.InstanceId,
            })),
            iops: volume.Iops,
            region,
            sizeGiB: volume.Size ?? 0,
            state: volume.State,
            volumeId: volume.VolumeId,
            volumeType: volume.VolumeType,
          });
        }
      }

      return volumes;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.volumeId.localeCompare(right.volumeId));
};

/**
 * Hydrates discovered EBS snapshots with create-time metadata for retention checks.
 *
 * @param resources - Catalog resources filtered to EBS snapshot resource types.
 * @returns Hydrated EBS snapshot models for rule evaluation.
 */
export const hydrateAwsEbsSnapshots = async (resources: AwsDiscoveredResource[]): Promise<AwsEbsSnapshot[]> => {
  const resourcesByRegion = new Map<string, Array<{ accountId: string; snapshotId: string }>>();

  for (const resource of resources) {
    const snapshotId = extractSnapshotId(resource.arn);

    if (!snapshotId) {
      continue;
    }

    const regionResources = resourcesByRegion.get(resource.region) ?? [];
    regionResources.push({
      accountId: resource.accountId,
      snapshotId,
    });
    resourcesByRegion.set(resource.region, regionResources);
  }

  const hydratedPages = await Promise.all(
    [...resourcesByRegion.entries()].map(async ([region, regionResources]) => {
      const client = createEc2Client({ region });
      const snapshots: AwsEbsSnapshot[] = [];

      for (const batch of chunkItems(regionResources, EBS_DESCRIBE_BATCH_SIZE)) {
        const response = await withAwsServiceErrorContext('Amazon EC2', 'DescribeSnapshots', region, () =>
          client.send(
            new DescribeSnapshotsCommand({
              SnapshotIds: batch.map(({ snapshotId }) => snapshotId),
            }),
          ),
        );

        for (const snapshot of response.Snapshots ?? []) {
          if (!snapshot.SnapshotId) {
            continue;
          }

          const discoveredResource = batch.find(({ snapshotId }) => snapshotId === snapshot.SnapshotId);

          if (!discoveredResource) {
            continue;
          }

          snapshots.push({
            accountId: discoveredResource.accountId,
            region,
            snapshotId: snapshot.SnapshotId,
            startTime: snapshot.StartTime?.toISOString(),
            state: snapshot.State,
            volumeId: snapshot.VolumeId,
            volumeSizeGiB: snapshot.VolumeSize,
          });
        }
      }

      return snapshots;
    }),
  );

  return hydratedPages.flat().sort((left, right) => left.snapshotId.localeCompare(right.snapshotId));
};
