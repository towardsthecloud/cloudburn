import { DescribeRegionsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { ResourceExplorer2Client } from '@aws-sdk/client-resource-explorer-2';
import { S3Client } from '@aws-sdk/client-s3';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AwsDiscoveryError } from './errors.js';

export type AwsClientConfig = {
  region?: string;
};

const AWS_REGION_PATTERN = /^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/;

/**
 * Validates an AWS region string before it is used in clients or filters.
 *
 * @param region - AWS region to validate.
 * @returns The original region when valid.
 */
export const assertValidAwsRegion = (region: string): string => {
  if (!AWS_REGION_PATTERN.test(region)) {
    throw new AwsDiscoveryError(
      'INVALID_AWS_REGION',
      `Invalid AWS region '${region}'. Use a standard region name such as 'eu-central-1' or 'us-gov-west-1'.`,
    );
  }

  return region;
};

/** Creates an AWS EC2 client for a specific region. */
export const createEc2Client = (config: AwsClientConfig): EC2Client =>
  new EC2Client({
    region: config.region,
  });

/** Creates an AWS Lambda client for a specific region. */
export const createLambdaClient = (config: AwsClientConfig): LambdaClient =>
  new LambdaClient({
    region: config.region,
  });

/** Creates an AWS S3 client for a specific region. */
export const createS3Client = (config: AwsClientConfig): S3Client =>
  new S3Client({
    region: config.region,
  });

/** Creates an AWS Resource Explorer client for a specific region. */
export const createResourceExplorerClient = (config: AwsClientConfig): ResourceExplorer2Client =>
  new ResourceExplorer2Client({
    region: config.region,
  });

/**
 * Resolves the current AWS region using CLI env precedence before falling back
 * to the AWS SDK's standard region provider chain.
 *
 * @returns Resolved AWS region for live discovery commands.
 */
export const resolveCurrentAwsRegion = async (): Promise<string> => {
  const explicitRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || process.env.aws_region;

  if (explicitRegion) {
    return assertValidAwsRegion(explicitRegion);
  }

  const client = createResourceExplorerClient({});
  return assertValidAwsRegion(await client.config.region());
};

/**
 * Resolves the AWS account ID for the current caller via STS.
 *
 * @returns The caller account ID.
 */
export const resolveAwsAccountId = async (): Promise<string> => {
  const client = new STSClient({});
  const { Account } = await client.send(new GetCallerIdentityCommand({}));

  if (!Account) {
    throw new Error('Unable to resolve AWS account ID from STS GetCallerIdentity');
  }

  return Account;
};

/**
 * Lists enabled EC2 regions for the current account.
 *
 * @returns Region names available for Resource Explorer setup.
 */
export const listEnabledAwsRegions = async (): Promise<string[]> => {
  const client = createEc2Client({});
  const { Regions } = await client.send(new DescribeRegionsCommand({ AllRegions: false }));

  return (Regions ?? []).flatMap((region) => (region.RegionName ? [region.RegionName] : []));
};
