import { EC2Client } from '@aws-sdk/client-ec2';

export type AwsClientConfig = {
  region?: string;
};

export const createEc2Client = (config: AwsClientConfig): EC2Client =>
  new EC2Client({
    region: config.region,
  });

export const resolveAwsRegions = async (regions: string[]): Promise<string[]> => {
  if (regions.length > 0) {
    return regions;
  }

  const client = createEc2Client({});
  return [await client.config.region()];
};
