import { describe, expect, it } from 'vitest';
import {
  createApiGatewayClient,
  createApplicationAutoScalingClient,
  createBudgetsClient,
  createCloudFrontClient,
  createCloudTrailClient,
  createCloudWatchClient,
  createCloudWatchLogsClient,
  createCostExplorerClient,
  createDynamoDbClient,
  createEc2Client,
  createEcrClient,
  createEcsClient,
  createEksClient,
  createElastiCacheClient,
  createElasticLoadBalancingClient,
  createElasticLoadBalancingV2Client,
  createEmrClient,
  createLambdaClient,
  createRdsClient,
  createRedshiftClient,
  createResourceExplorerClient,
  createRoute53Client,
  createS3Client,
  createSageMakerClient,
  createSecretsManagerClient,
  withAwsClientCredentials,
} from '../../src/providers/aws/client.js';

const explicitCredentials = {
  accessKeyId: 'AKIAEXPLICIT',
  secretAccessKey: 'explicit-secret',
  sessionToken: 'explicit-session',
};

type AnyAwsClient = { config: { credentials: () => Promise<Record<string, unknown>> } };

const resolveClientCredentials = async (client: unknown) => (client as AnyAwsClient).config.credentials();

const regionalFactories: Array<
  [string, (config: { region?: string; credentials?: typeof explicitCredentials }) => unknown]
> = [
  ['createApiGatewayClient', createApiGatewayClient],
  ['createApplicationAutoScalingClient', createApplicationAutoScalingClient],
  ['createCloudTrailClient', createCloudTrailClient],
  ['createCloudWatchClient', createCloudWatchClient],
  ['createCloudWatchLogsClient', createCloudWatchLogsClient],
  ['createDynamoDbClient', createDynamoDbClient],
  ['createEc2Client', createEc2Client],
  ['createEcrClient', createEcrClient],
  ['createEcsClient', createEcsClient],
  ['createEksClient', createEksClient],
  ['createElastiCacheClient', createElastiCacheClient],
  ['createElasticLoadBalancingClient', createElasticLoadBalancingClient],
  ['createElasticLoadBalancingV2Client', createElasticLoadBalancingV2Client],
  ['createEmrClient', createEmrClient],
  ['createLambdaClient', createLambdaClient],
  ['createRdsClient', createRdsClient],
  ['createRedshiftClient', createRedshiftClient],
  ['createResourceExplorerClient', createResourceExplorerClient],
  ['createS3Client', createS3Client],
  ['createSageMakerClient', createSageMakerClient],
  ['createSecretsManagerClient', createSecretsManagerClient],
];

const globalFactories: Array<[string, (config?: { credentials?: typeof explicitCredentials }) => unknown]> = [
  ['createBudgetsClient', createBudgetsClient],
  ['createCloudFrontClient', createCloudFrontClient],
  ['createCostExplorerClient', createCostExplorerClient],
  ['createRoute53Client', createRoute53Client],
];

describe('withAwsClientCredentials', () => {
  it('applies scoped credentials to clients created inside the callback', async () => {
    const client = await withAwsClientCredentials(explicitCredentials, async () =>
      createEc2Client({ region: 'eu-central-1' }),
    );

    await expect(resolveClientCredentials(client)).resolves.toMatchObject(explicitCredentials);
  });

  it('applies scoped credentials to global-control-plane clients created inside the callback', async () => {
    const client = await withAwsClientCredentials(explicitCredentials, async () => createCostExplorerClient());

    await expect(resolveClientCredentials(client)).resolves.toMatchObject(explicitCredentials);
  });

  it('prefers explicit factory credentials over scoped credentials', async () => {
    const scopedCredentials = {
      accessKeyId: 'AKIASCOPED',
      secretAccessKey: 'scoped-secret',
      sessionToken: 'scoped-session',
    };

    const client = await withAwsClientCredentials(scopedCredentials, async () =>
      createEc2Client({ region: 'eu-central-1', credentials: explicitCredentials }),
    );

    await expect(resolveClientCredentials(client)).resolves.toMatchObject(explicitCredentials);
  });

  it('isolates scoped credentials between concurrent callbacks', async () => {
    const credentialsA = { accessKeyId: 'AKIAAAA', secretAccessKey: 'secret-a', sessionToken: 'session-a' };
    const credentialsB = { accessKeyId: 'AKIABBB', secretAccessKey: 'secret-b', sessionToken: 'session-b' };
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    const [clientA, clientB] = await Promise.all([
      withAwsClientCredentials(credentialsA, async () => {
        await settle();
        return createEc2Client({ region: 'eu-central-1' });
      }),
      withAwsClientCredentials(credentialsB, async () => {
        await settle();
        return createEc2Client({ region: 'eu-central-1' });
      }),
    ]);

    await expect(resolveClientCredentials(clientA)).resolves.toMatchObject(credentialsA);
    await expect(resolveClientCredentials(clientB)).resolves.toMatchObject(credentialsB);
  });
});

describe('aws client factories with explicit credentials', () => {
  it.each(regionalFactories)('%s passes explicit credentials into the client', async (_name, factory) => {
    const client = factory({ region: 'eu-central-1', credentials: explicitCredentials });

    await expect(resolveClientCredentials(client)).resolves.toMatchObject(explicitCredentials);
  });

  it.each(globalFactories)('%s passes explicit credentials into the client', async (_name, factory) => {
    const client = factory({ credentials: explicitCredentials });

    await expect(resolveClientCredentials(client)).resolves.toMatchObject(explicitCredentials);
  });
});
