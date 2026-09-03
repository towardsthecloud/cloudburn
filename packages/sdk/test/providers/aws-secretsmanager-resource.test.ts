import { ListSecretsCommand } from '@aws-sdk/client-secrets-manager';
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

  it('paginates listed secrets and preserves a missing last-access date', async () => {
    mockedCreateSecretsManagerClient.mockReturnValue({
      send: vi.fn(async (command: ListSecretsCommand) => {
        expect(command).toBeInstanceOf(ListSecretsCommand);

        if (!command.input.NextToken) {
          return {
            NextToken: 'page-2',
            SecretList: [
              {
                ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:db-password-AbCdEf',
                LastAccessedDate: new Date('2025-12-01T00:00:00.000Z'),
                Name: 'db-password',
              },
            ],
          };
        }

        return {
          SecretList: [
            {
              ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:never-accessed-AbCdEf',
              Name: 'never-accessed',
            },
            {
              ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:not-selected-AbCdEf',
              Name: 'not-selected',
            },
          ],
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
        {
          accountId: '123456789012',
          arn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:never-accessed-AbCdEf',
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
      {
        accountId: '123456789012',
        lastAccessedDate: undefined,
        region: 'us-east-1',
        secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:never-accessed-AbCdEf',
        secretName: 'never-accessed',
      },
    ]);
  });

  it('lists secrets with one client per selected region', async () => {
    mockedCreateSecretsManagerClient.mockImplementation(
      ({ region }) =>
        ({
          send: vi.fn().mockResolvedValue({
            SecretList: [
              {
                ARN: `arn:aws:secretsmanager:${region}:123456789012:secret:${region}-secret-AbCdEf`,
                Name: `${region}-secret`,
              },
            ],
          }),
        }) as never,
    );

    await expect(
      hydrateAwsSecretsManagerSecrets([
        {
          accountId: '123456789012',
          arn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:us-east-1-secret-AbCdEf',
          properties: [],
          region: 'us-east-1',
          resourceType: 'secretsmanager:secret',
          service: 'secretsmanager',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:secretsmanager:eu-central-1:123456789012:secret:eu-central-1-secret-AbCdEf',
          properties: [],
          region: 'eu-central-1',
          resourceType: 'secretsmanager:secret',
          service: 'secretsmanager',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        lastAccessedDate: undefined,
        region: 'eu-central-1',
        secretArn: 'arn:aws:secretsmanager:eu-central-1:123456789012:secret:eu-central-1-secret-AbCdEf',
        secretName: 'eu-central-1-secret',
      },
      {
        accountId: '123456789012',
        lastAccessedDate: undefined,
        region: 'us-east-1',
        secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:us-east-1-secret-AbCdEf',
        secretName: 'us-east-1-secret',
      },
    ]);
    expect(mockedCreateSecretsManagerClient).toHaveBeenCalledTimes(2);
    expect(mockedCreateSecretsManagerClient).toHaveBeenCalledWith({ region: 'eu-central-1' });
    expect(mockedCreateSecretsManagerClient).toHaveBeenCalledWith({ region: 'us-east-1' });
  });
});
