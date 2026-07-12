import { describe, expect, it } from 'vitest';
import { createCostExplorerClient, createEc2Client, withAwsClientCredentials } from '../../src/providers/aws/client.js';

const scanCredentials = {
  accessKeyId: 'AKIASCOPED',
  secretAccessKey: 'scoped-secret',
  sessionToken: 'scoped-session',
};

type AnyAwsClient = { config: { credentials: () => Promise<Record<string, unknown>> } };

const resolveClientCredentials = async (client: unknown) => (client as AnyAwsClient).config.credentials();

describe('withAwsClientCredentials', () => {
  it('applies scoped credentials to clients created inside the callback', async () => {
    const client = await withAwsClientCredentials(scanCredentials, async () =>
      createEc2Client({ region: 'eu-central-1' }),
    );

    await expect(resolveClientCredentials(client)).resolves.toMatchObject(scanCredentials);
  });

  it('applies scoped credentials to global-control-plane clients created inside the callback', async () => {
    const client = await withAwsClientCredentials(scanCredentials, async () => createCostExplorerClient());

    await expect(resolveClientCredentials(client)).resolves.toMatchObject(scanCredentials);
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
