import { afterEach, describe, expect, it, vi } from 'vitest';

const importClientModule = async () => import('../../src/providers/aws/client.js');

describe('aws client resilience defaults', () => {
  it('configures adaptive retries, explicit max attempts, and request timeouts on every client factory', async () => {
    const clientModule = await importClientModule();
    const factories = Object.entries(clientModule).filter(
      (entry): entry is [string, (config: { region?: string }) => unknown] =>
        entry[0].startsWith('create') && typeof entry[1] === 'function',
    );

    expect(factories.length).toBeGreaterThan(0);

    for (const [factoryName, factory] of factories) {
      const client = factory({ region: 'us-east-1' }) as {
        config: {
          maxAttempts: () => Promise<number>;
          requestHandler: { configProvider: Promise<{ connectionTimeout?: number; requestTimeout?: number }> };
          retryMode: string;
        };
      };
      const handlerConfig = await client.config.requestHandler.configProvider;

      expect({
        factoryName,
        retryMode: client.config.retryMode,
        maxAttempts: await client.config.maxAttempts(),
        connectionTimeout: handlerConfig.connectionTimeout,
        requestTimeout: handlerConfig.requestTimeout,
      }).toEqual({
        factoryName,
        retryMode: 'adaptive',
        maxAttempts: factoryName === 'createRoute53Client' ? 1 : 3,
        connectionTimeout: 5_000,
        requestTimeout: 30_000,
      });
    }
  });

  it('leaves Route 53 retries to the account-wide request budget', async () => {
    const { createRoute53Client } = await importClientModule();
    const client = createRoute53Client();

    await expect(client.config.maxAttempts()).resolves.toBe(1);
  });
});

describe('resolveCurrentAwsRegion', { timeout: 30_000 }, () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock('@aws-sdk/client-resource-explorer-2');
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
    delete process.env.aws_region;
  });

  it('prefers AWS_REGION over other environment variables', async () => {
    const clientModule = await importClientModule();

    process.env.AWS_REGION = 'eu-central-1';
    process.env.AWS_DEFAULT_REGION = 'us-east-1';
    process.env.aws_region = 'ap-southeast-1';

    await expect(clientModule.resolveCurrentAwsRegion()).resolves.toBe('eu-central-1');
  });

  it('falls back to the aws sdk region provider chain when no env var is set', async () => {
    vi.doMock('@aws-sdk/client-resource-explorer-2', async () => {
      const actual = await vi.importActual<typeof import('@aws-sdk/client-resource-explorer-2')>(
        '@aws-sdk/client-resource-explorer-2',
      );

      return {
        ...actual,
        ResourceExplorer2Client: class {
          config = {
            region: async () => 'eu-west-1',
          };
        },
      };
    });

    const clientModule = await importClientModule();

    await expect(clientModule.resolveCurrentAwsRegion()).resolves.toBe('eu-west-1');
  });

  it('rejects malformed regions from the environment before discovery uses them', async () => {
    const clientModule = await importClientModule();

    process.env.AWS_REGION = 'eu-central-1 region:us-east-1';

    await expect(clientModule.resolveCurrentAwsRegion()).rejects.toMatchObject({
      code: 'INVALID_AWS_REGION',
    });
  });

  it('accepts valid AWS region strings outside the commercial allowlist at runtime', async () => {
    const clientModule = await importClientModule();

    expect(clientModule.assertValidAwsRegion('us-gov-west-1')).toBe('us-gov-west-1');
  });

  it('lists supported regions when region validation fails', async () => {
    const clientModule = await importClientModule();

    expect(() => clientModule.assertSupportedAwsRegion('bla')).toThrowError(
      "Invalid AWS region 'bla'. Supported regions:",
    );
    expect(() => clientModule.assertSupportedAwsRegion('bla')).toThrowError('eu-central-1');
    expect(() => clientModule.assertSupportedAwsRegion('bla')).toThrowError('us-east-1');
  });
});
