import { DescribeVolumesCommand } from '@aws-sdk/client-ec2';
import type { AwsDiscoveredResource, AwsEbsVolume } from '@cloudburn/rules';
import { createEc2Client } from '../client.js';
import { chunkItems, withAwsServiceErrorContext } from './utils.js';

const EBS_VOLUME_ARN_PREFIX = 'volume/';
const EBS_DESCRIBE_BATCH_SIZE = 200;

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
            region,
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
