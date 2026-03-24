import type { DescribeSecretCommand } from '@aws-sdk/client-secrets-manager';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSecretsManagerClient } from '../../src/providers/aws/client.js';
import { hydrateAwsSecretsManagerSecrets } from '../../src/providers/aws/resources/secretsmanager.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createSecretsManagerClient: vi.fn(),
}));

const mockedCreateSecretsManagerClient = vi.mocked(createSecretsManagerClient);

describe('hydrateAwsSecretsManagerSecrets', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered secrets with last-access metadata', async () => {
    mockedCreateSecretsManagerClient.mockReturnValue({
      send: vi.fn(async (command: DescribeSecretCommand) => {
        expect(command.input).toEqual({
          SecretId: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:db-password-AbCdEf',
        });

        return {
          ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:db-password-AbCdEf',
          LastAccessedDate: new Date('2025-12-01T00:00:00.000Z'),
          Name: 'db-password',
        };
      }),
    } as never);

    await expect(
      hydrateAwsSecretsManagerSecrets([
        {
          accountId: '123456789012',
          arn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:db-password-AbCdEf',
          properties: [],
          region: 'us-east-1',
          resourceType: 'secretsmanager:secret',
          service: 'secretsmanager',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        lastAccessedDate: '2025-12-01T00:00:00.000Z',
        region: 'us-east-1',
        secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:db-password-AbCdEf',
        secretName: 'db-password',
      },
    ]);
  });
});
