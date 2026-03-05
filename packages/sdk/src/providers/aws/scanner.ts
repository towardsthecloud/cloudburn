import { discoverEc2Resources } from './resources/ec2.js';
import { discoverElbV2Resources } from './resources/elbv2.js';
import { discoverRdsResources } from './resources/rds.js';
import { discoverS3Resources } from './resources/s3.js';

// Intent: orchestrate AWS resource discovery in live mode.
// TODO(cloudburn): include tag filters, region filtering, and pagination handling.
export const scanAwsResources = async (): Promise<string[]> => {
  const [ec2, rds, s3, elbv2] = await Promise.all([
    discoverEc2Resources(),
    discoverRdsResources(),
    discoverS3Resources(),
    discoverElbV2Resources(),
  ]);

  return [...ec2, ...rds, ...s3, ...elbv2];
};
