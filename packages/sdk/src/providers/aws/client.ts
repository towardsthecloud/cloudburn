import { AsyncLocalStorage } from 'node:async_hooks';
import { ApplicationAutoScalingClient } from '@aws-sdk/client-application-auto-scaling';
import { BudgetsClient } from '@aws-sdk/client-budgets';
import { CloudFrontClient } from '@aws-sdk/client-cloudfront';
import { CloudTrailClient } from '@aws-sdk/client-cloudtrail';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { ComputeOptimizerClient } from '@aws-sdk/client-compute-optimizer';
import { ConfigServiceClient } from '@aws-sdk/client-config-service';
import { CostExplorerClient } from '@aws-sdk/client-cost-explorer';
import { CostOptimizationHubClient } from '@aws-sdk/client-cost-optimization-hub';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DescribeRegionsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { ECRClient } from '@aws-sdk/client-ecr';
import { ECSClient } from '@aws-sdk/client-ecs';
import { EKSClient } from '@aws-sdk/client-eks';
import { ElasticLoadBalancingClient } from '@aws-sdk/client-elastic-load-balancing';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { ElastiCacheClient } from '@aws-sdk/client-elasticache';
import { EMRClient } from '@aws-sdk/client-emr';
import { KMSClient } from '@aws-sdk/client-kms';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { RDSClient } from '@aws-sdk/client-rds';
import { RedshiftClient } from '@aws-sdk/client-redshift';
import { ResourceExplorer2Client } from '@aws-sdk/client-resource-explorer-2';
import { Route53Client } from '@aws-sdk/client-route-53';
import { S3Client } from '@aws-sdk/client-s3';
import { SageMakerClient } from '@aws-sdk/client-sagemaker';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';
import { AwsDiscoveryError } from './errors.js';
import { getAwsClient } from './execution.js';

export type AwsClientCredentials = AwsCredentialIdentity | AwsCredentialIdentityProvider;

export type AwsClientConfig = {
  region?: string;
};

const awsClientCredentialsContext = new AsyncLocalStorage<{ credentials?: AwsClientCredentials }>();

/**
 * Runs a callback with ambient AWS credentials applied to every AWS client
 * created inside it, without requiring each call site to thread credentials.
 *
 * @param credentials - Credentials or credential provider to scope to the callback.
 * @param fn - Callback whose AWS client constructions should use the credentials.
 * @returns The callback result.
 */
export const withAwsClientCredentials = <T>(
  credentials: AwsClientCredentials | undefined,
  fn: () => Promise<T>,
): Promise<T> => awsClientCredentialsContext.run({ credentials }, fn);

const resolveAwsClientCredentials = (): AwsClientCredentials | undefined =>
  awsClientCredentialsContext.getStore()?.credentials;

const AWS_REGION_PATTERN = /^[a-z]{2}(?:-[a-z0-9]+)+-\d+$/;
const AWS_GLOBAL_CONTROL_REGION = 'us-east-1';
const AWS_CLIENT_MAX_ATTEMPTS = 3;
const AWS_ROUTE53_CLIENT_MAX_ATTEMPTS = 1;
const AWS_CLIENT_CONNECTION_TIMEOUT_MS = 5_000;
const AWS_CLIENT_REQUEST_TIMEOUT_MS = 30_000;

// Direct control-plane calls retain SDK retries. Wrapped service calls use
// one SDK attempt so their outer budget owns every retry and backoff. Node
// sockets have no default timeout, so without explicit request timeouts a hung
// connection would stall a discovery run indefinitely.
const baseAwsClientConfig = () => ({
  maxAttempts: AWS_CLIENT_MAX_ATTEMPTS,
  requestHandler: {
    connectionTimeout: AWS_CLIENT_CONNECTION_TIMEOUT_MS,
    requestTimeout: AWS_CLIENT_REQUEST_TIMEOUT_MS,
    throwOnRequestTimeout: true,
  },
  retryMode: 'adaptive',
});
export const AWS_REGIONS = [
  'af-south-1',
  'ap-east-1',
  'ap-east-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-south-1',
  'ap-south-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-southeast-4',
  'ap-southeast-5',
  'ap-southeast-6',
  'ap-southeast-7',
  'ca-central-1',
  'ca-west-1',
  'eu-central-1',
  'eu-central-2',
  'eu-north-1',
  'eu-south-1',
  'eu-south-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'il-central-1',
  'me-central-1',
  'me-south-1',
  'mx-central-1',
  'sa-east-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
] as const;

export type AwsRegion = (typeof AWS_REGIONS)[number];
const SUPPORTED_AWS_REGIONS_MESSAGE = AWS_REGIONS.join(', ');

const assertAwsRegionShape = (region: string | undefined): string => {
  if (!region || !AWS_REGION_PATTERN.test(region)) {
    throw new AwsDiscoveryError(
      'INVALID_AWS_REGION',
      `Invalid AWS region '${region ?? ''}'. Use a valid AWS region name such as 'eu-central-1' or 'us-east-1'.`,
    );
  }

  return region;
};

/**
 * Validates an AWS region string before it is used in clients or filters.
 *
 * @param region - AWS region to validate.
 * @returns The original region when valid.
 */
export const assertValidAwsRegion = (region: string | undefined): AwsRegion =>
  assertAwsRegionShape(region) as AwsRegion;

/**
 * Validates that a CLI-supplied AWS region is one of the known supported regions.
 *
 * @param region - AWS region supplied by the caller.
 * @returns The original region when it is part of the supported region list.
 */
export const assertSupportedAwsRegion = (region: string | undefined): AwsRegion => {
  if (!region || !AWS_REGION_PATTERN.test(region) || !AWS_REGIONS.includes(region as AwsRegion)) {
    throw new AwsDiscoveryError(
      'INVALID_AWS_REGION',
      `Invalid AWS region '${region ?? ''}'. Supported regions: ${SUPPORTED_AWS_REGIONS_MESSAGE}.`,
    );
  }

  return region as AwsRegion;
};

/** Creates an AWS EC2 client for a specific region. */
export const createEc2Client = (config: AwsClientConfig): EC2Client =>
  getAwsClient(
    JSON.stringify(['EC2Client', config.region]),
    () =>
      new EC2Client({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS ECS client for a specific region. */
export const createEcsClient = (config: AwsClientConfig): ECSClient =>
  getAwsClient(
    JSON.stringify(['ECSClient', config.region]),
    () =>
      new ECSClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS EKS client for a specific region. */
export const createEksClient = (config: AwsClientConfig): EKSClient =>
  getAwsClient(
    JSON.stringify(['EKSClient', config.region]),
    () =>
      new EKSClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS ECR client for a specific region. */
export const createEcrClient = (config: AwsClientConfig): ECRClient =>
  getAwsClient(
    JSON.stringify(['ECRClient', config.region]),
    () =>
      new ECRClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS Application Auto Scaling client for a specific region. */
export const createApplicationAutoScalingClient = (config: AwsClientConfig): ApplicationAutoScalingClient =>
  getAwsClient(
    JSON.stringify(['ApplicationAutoScalingClient', config.region]),
    () =>
      new ApplicationAutoScalingClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS Budgets client against the global billing control plane. */
export const createBudgetsClient = (): BudgetsClient =>
  getAwsClient(
    JSON.stringify(['BudgetsClient', AWS_GLOBAL_CONTROL_REGION]),
    () =>
      new BudgetsClient({
        ...baseAwsClientConfig(),
        region: AWS_GLOBAL_CONTROL_REGION,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS ElastiCache client for a specific region. */
export const createElastiCacheClient = (config: AwsClientConfig): ElastiCacheClient =>
  getAwsClient(
    JSON.stringify(['ElastiCacheClient', config.region]),
    () =>
      new ElastiCacheClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS Classic ELB client for a specific region. */
export const createElasticLoadBalancingClient = (config: AwsClientConfig): ElasticLoadBalancingClient =>
  getAwsClient(
    JSON.stringify(['ElasticLoadBalancingClient', config.region]),
    () =>
      new ElasticLoadBalancingClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS ELBv2 client for a specific region. */
export const createElasticLoadBalancingV2Client = (config: AwsClientConfig): ElasticLoadBalancingV2Client =>
  getAwsClient(
    JSON.stringify(['ElasticLoadBalancingV2Client', config.region]),
    () =>
      new ElasticLoadBalancingV2Client({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS CloudWatch client for a specific region. */
export const createCloudWatchClient = (config: AwsClientConfig): CloudWatchClient =>
  getAwsClient(
    JSON.stringify(['CloudWatchClient', config.region]),
    () =>
      new CloudWatchClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS CloudTrail client for a specific region. */
export const createCloudTrailClient = (config: AwsClientConfig): CloudTrailClient =>
  getAwsClient(
    JSON.stringify(['CloudTrailClient', config.region]),
    () =>
      new CloudTrailClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS CloudFront client against the global control plane. */
export const createCloudFrontClient = (): CloudFrontClient =>
  getAwsClient(
    JSON.stringify(['CloudFrontClient', AWS_GLOBAL_CONTROL_REGION]),
    () =>
      new CloudFrontClient({
        ...baseAwsClientConfig(),
        region: AWS_GLOBAL_CONTROL_REGION,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS CloudWatch Logs client for a specific region. */
export const createCloudWatchLogsClient = (config: AwsClientConfig): CloudWatchLogsClient =>
  getAwsClient(
    JSON.stringify(['CloudWatchLogsClient', config.region]),
    () =>
      new CloudWatchLogsClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS Compute Optimizer client for a specific region. */
export const createComputeOptimizerClient = (config: AwsClientConfig): ComputeOptimizerClient =>
  getAwsClient(
    JSON.stringify(['ComputeOptimizerClient', config.region]),
    () =>
      new ComputeOptimizerClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS Config client for a specific region. */
export const createConfigServiceClient = (config: AwsClientConfig): ConfigServiceClient =>
  getAwsClient(
    JSON.stringify(['ConfigServiceClient', config.region]),
    () =>
      new ConfigServiceClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS Cost Explorer client against the global billing control plane. */
export const createCostExplorerClient = (): CostExplorerClient =>
  getAwsClient(
    JSON.stringify(['CostExplorerClient', AWS_GLOBAL_CONTROL_REGION]),
    () =>
      new CostExplorerClient({
        ...baseAwsClientConfig(),
        region: AWS_GLOBAL_CONTROL_REGION,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS Cost Optimization Hub client against the global billing control plane. */
export const createCostOptimizationHubClient = (): CostOptimizationHubClient =>
  getAwsClient(
    JSON.stringify(['CostOptimizationHubClient', AWS_GLOBAL_CONTROL_REGION]),
    () =>
      new CostOptimizationHubClient({
        ...baseAwsClientConfig(),
        region: AWS_GLOBAL_CONTROL_REGION,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS DynamoDB client for a specific region. */
export const createDynamoDbClient = (config: AwsClientConfig): DynamoDBClient =>
  getAwsClient(
    JSON.stringify(['DynamoDBClient', config.region]),
    () =>
      new DynamoDBClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS Lambda client for a specific region. */
export const createLambdaClient = (config: AwsClientConfig): LambdaClient =>
  getAwsClient(
    JSON.stringify(['LambdaClient', config.region]),
    () =>
      new LambdaClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS KMS client for a specific region. */
export const createKmsClient = (config: AwsClientConfig): KMSClient =>
  getAwsClient(
    JSON.stringify(['KMSClient', config.region]),
    () =>
      new KMSClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS EMR client for a specific region. */
export const createEmrClient = (config: AwsClientConfig): EMRClient =>
  getAwsClient(
    JSON.stringify(['EMRClient', config.region]),
    () =>
      new EMRClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS RDS client for a specific region. */
export const createRdsClient = (config: AwsClientConfig): RDSClient =>
  getAwsClient(
    JSON.stringify(['RDSClient', config.region]),
    () =>
      new RDSClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS Redshift client for a specific region. */
export const createRedshiftClient = (config: AwsClientConfig): RedshiftClient =>
  getAwsClient(
    JSON.stringify(['RedshiftClient', config.region]),
    () =>
      new RedshiftClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS Route 53 client against the global control plane. */
export const createRoute53Client = (): Route53Client =>
  getAwsClient(
    JSON.stringify(['Route53Client', AWS_GLOBAL_CONTROL_REGION]),
    () =>
      new Route53Client({
        ...baseAwsClientConfig(),
        // Route 53 retries must reacquire the shared five-request-per-second
        // discovery budget, so the outer service wrapper owns every retry.
        maxAttempts: AWS_ROUTE53_CLIENT_MAX_ATTEMPTS,
        region: AWS_GLOBAL_CONTROL_REGION,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS S3 client for a specific region. */
export const createS3Client = (config: AwsClientConfig): S3Client =>
  getAwsClient(
    JSON.stringify(['S3Client', config.region]),
    () =>
      new S3Client({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS SageMaker client for a specific region. */
export const createSageMakerClient = (config: AwsClientConfig): SageMakerClient =>
  getAwsClient(
    JSON.stringify(['SageMakerClient', config.region]),
    () =>
      new SageMakerClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS Secrets Manager client for a specific region. */
export const createSecretsManagerClient = (config: AwsClientConfig): SecretsManagerClient =>
  getAwsClient(
    JSON.stringify(['SecretsManagerClient', config.region]),
    () =>
      new SecretsManagerClient({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/** Creates an AWS Resource Explorer client for a specific region. */
export const createResourceExplorerClient = (config: AwsClientConfig): ResourceExplorer2Client =>
  getAwsClient(
    JSON.stringify(['ResourceExplorer2Client', config.region]),
    () =>
      new ResourceExplorer2Client({
        ...baseAwsClientConfig(),
        region: config.region,
        credentials: resolveAwsClientCredentials(),
      }),
  );

/**
 * Resolves the current AWS region using CLI env precedence before falling back
 * to the AWS SDK's standard region provider chain.
 *
 * @returns Resolved AWS region for live discovery commands.
 */
export const resolveCurrentAwsRegion = async (): Promise<AwsRegion> => {
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
 * @param region - Explicit discovery control region, or the ambient region when omitted.
 * @returns The caller account ID.
 */
export const resolveAwsAccountId = async (region?: string): Promise<string> => {
  const client = getAwsClient(
    JSON.stringify(['STSClient', region]),
    () => new STSClient({ ...baseAwsClientConfig(), region, credentials: resolveAwsClientCredentials() }),
  );
  const { Account } = await client.send(new GetCallerIdentityCommand({}));

  if (!Account) {
    throw new Error('Unable to resolve AWS account ID from STS GetCallerIdentity');
  }

  return Account;
};

/**
 * Lists enabled EC2 regions for the current account.
 *
 * @param region - Optional preferred region for the EC2 control plane call.
 * @returns Region names available for Resource Explorer setup.
 */
export const listEnabledAwsRegions = async (region?: string): Promise<AwsRegion[]> => {
  const client = createEc2Client({
    ...(region ? { region: assertValidAwsRegion(region) } : {}),
  });
  const { Regions } = await client.send(new DescribeRegionsCommand({ AllRegions: false }));

  return (Regions ?? []).flatMap((region) => (region.RegionName ? [assertValidAwsRegion(region.RegionName)] : []));
};
