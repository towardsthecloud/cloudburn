import { EC2Client } from '@aws-sdk/client-ec2';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';

export type AwsClientConfig = {
  region?: string;
};

export const createEc2Client = (config: AwsClientConfig): EC2Client =>
  new EC2Client({
    region: config.region,
  });

/** Create an AWS Lambda client for a specific region. */
export const createLambdaClient = (config: AwsClientConfig): LambdaClient =>
  new LambdaClient({
    region: config.region,
  });

export const resolveAwsRegions = async (regions: string[]): Promise<string[]> => {
  if (regions.length > 0) {
    return regions;
  }

  const client = createEc2Client({});
  return [await client.config.region()];
};

/** Resolve the AWS account ID for the current caller via STS. */
export const resolveAwsAccountId = async (): Promise<string> => {
  const client = new STSClient({});
  const { Account } = await client.send(new GetCallerIdentityCommand({}));
  if (!Account) {
    throw new Error('Unable to resolve AWS account ID from STS GetCallerIdentity');
  }
  return Account;
};
