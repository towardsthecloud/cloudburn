import { afterEach, describe, expect, it, vi } from 'vitest';

const importClientModule = async () => import('../../src/providers/aws/client.js');

describe('resolveCurrentAwsRegion', () => {
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
});
