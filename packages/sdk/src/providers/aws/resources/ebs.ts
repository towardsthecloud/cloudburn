import { DescribeVolumesCommand } from '@aws-sdk/client-ec2';
import type { AwsDiscoveredResource, AwsEbsVolume } from '@cloudburn/rules';
import { createEc2Client } from '../client.js';

const EBS_VOLUME_ARN_PREFIX = 'volume/';
const EBS_DESCRIBE_BATCH_SIZE = 200;

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const extractVolumeId = (arn: string): string | null => {
  const arnSegments = arn.split(':');
  const resourceSegment = arnSegments[5];

  if (!resourceSegment?.startsWith(EBS_VOLUME_ARN_PREFIX)) {
    return null;
  }

  return resourceSegment.slice(EBS_VOLUME_ARN_PREFIX.length);
};

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

      for (const batch of chunk(regionResources, EBS_DESCRIBE_BATCH_SIZE)) {
        const response = await client.send(
          new DescribeVolumesCommand({
            VolumeIds: batch.map(({ volumeId }) => volumeId),
          }),
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
            region,
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
