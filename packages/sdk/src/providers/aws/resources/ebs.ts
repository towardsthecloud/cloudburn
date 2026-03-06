import { paginateDescribeVolumes } from '@aws-sdk/client-ec2';
import type { AwsEbsVolume } from '@cloudburn/rules';
import { createEc2Client } from '../client.js';

export const discoverAwsEbsVolumes = async (regions: string[]): Promise<AwsEbsVolume[]> => {
  const volumePages = await Promise.all(
    regions.map(async (region) => {
      const client = createEc2Client({ region });
      const volumes: AwsEbsVolume[] = [];

      for await (const page of paginateDescribeVolumes({ client }, {})) {
        for (const volume of page.Volumes ?? []) {
          if (!volume.VolumeId || !volume.VolumeType) {
            continue;
          }

          volumes.push({
            volumeId: volume.VolumeId,
            volumeType: volume.VolumeType,
            region,
          });
        }
      }

      return volumes;
    }),
  );

  return volumePages.flat();
};
