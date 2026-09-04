import {
  DescribeKeyCommand,
  GetKeyLastUsageCommand,
  ListAliasesCommand,
  ListKeyRotationsCommand,
} from '@aws-sdk/client-kms';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKmsClient } from '../../src/providers/aws/client.js';
import { hydrateAwsKmsKeyChurnReviews } from '../../src/providers/aws/resources/kms.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createKmsClient: vi.fn(),
}));

const mockedCreateKmsClient = vi.mocked(createKmsClient);
const accountId = '123456789012';
const region = 'eu-central-1';
const keyArn = (keyId: string) => `arn:aws:kms:${region}:${accountId}:key/${keyId}`;
const discoveredKey = (keyId: string) => ({
  accountId,
  arn: keyArn(keyId),
  properties: [],
  region,
  resourceType: 'kms:key',
  service: 'kms',
});

describe('hydrateAwsKmsKeyChurnReviews', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aggregates enabled customer-managed keys with private alias, usage, rotation, and multi-Region evidence', async () => {
    mockedCreateKmsClient.mockReturnValue({
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListAliasesCommand) {
          if (!command.input.Marker) {
            return {
              Aliases: [
                {
                  AliasName: 'alias/payments-platform-deployment-encryption-feature-customer-refactor',
                  TargetKeyId: 'key-a',
                },
              ],
              NextMarker: 'aliases-page-2',
              Truncated: true,
            };
          }

          return {
            Aliases: [
              {
                AliasName: 'alias/payments-platform-deployment-encryption-feature-fix-timeouts',
                TargetKeyId: 'key-b',
              },
              { AliasName: 'alias/aws/ebs', TargetKeyId: 'aws-managed' },
            ],
            Truncated: false,
          };
        }

        if (command instanceof DescribeKeyCommand) {
          const metadata = {
            ARN: keyArn(command.input.KeyId ?? ''),
            CreationDate: new Date('2026-07-10T00:00:00.000Z'),
            KeyId: command.input.KeyId,
            KeyManager: 'CUSTOMER',
            KeySpec: 'SYMMETRIC_DEFAULT',
            KeyState: 'Enabled',
            KeyUsage: 'ENCRYPT_DECRYPT',
            Origin: 'AWS_KMS',
          } as const;

          switch (command.input.KeyId) {
            case 'key-a':
              return {
                KeyMetadata: {
                  ...metadata,
                  CreationDate: new Date('2026-08-05T00:00:00.000Z'),
                  MultiRegion: true,
                  MultiRegionConfiguration: { MultiRegionKeyType: 'PRIMARY' },
                },
              };
            case 'key-b':
              return {
                KeyMetadata: {
                  ...metadata,
                  CreationDate: new Date('2026-08-20T00:00:00.000Z'),
                  MultiRegion: true,
                  MultiRegionConfiguration: { MultiRegionKeyType: 'REPLICA' },
                },
              };
            case 'key-c':
              return {
                KeyMetadata: {
                  ...metadata,
                  KeySpec: 'RSA_2048',
                },
              };
            case 'key-d':
              return {
                KeyMetadata: {
                  ...metadata,
                  CreationDate: new Date('2026-08-25T00:00:00.000Z'),
                },
              };
            case 'aws-managed':
              return { KeyMetadata: { ...metadata, KeyManager: 'AWS' } };
            case 'pending-deletion':
              return {
                KeyMetadata: {
                  ...metadata,
                  DeletionDate: new Date('2026-09-10T00:00:00.000Z'),
                  KeyState: 'PendingDeletion',
                },
              };
            default:
              throw new Error(`Unexpected key: ${command.input.KeyId}`);
          }
        }

        if (command instanceof GetKeyLastUsageCommand) {
          switch (command.input.KeyId) {
            case 'key-a':
              return {
                KeyCreationDate: new Date('2026-08-05T00:00:00.000Z'),
                KeyLastUsage: {
                  Operation: 'Encrypt',
                  Timestamp: new Date('2026-09-03T00:00:00.000Z'),
                },
                TrackingStartDate: new Date('2026-08-05T00:00:00.000Z'),
              };
            case 'key-b':
              return {
                KeyCreationDate: new Date('2026-08-20T00:00:00.000Z'),
                KeyLastUsage: {},
                TrackingStartDate: new Date('2026-08-20T00:00:00.000Z'),
              };
            case 'key-c':
              return {
                KeyCreationDate: new Date('2026-07-10T00:00:00.000Z'),
                KeyLastUsage: {},
                TrackingStartDate: new Date('2026-08-01T00:00:00.000Z'),
              };
            case 'key-d':
              throw Object.assign(new Error('Access denied by a service control policy'), {
                name: 'AccessDeniedException',
              });
            default:
              throw new Error(`Unexpected usage key: ${command.input.KeyId}`);
          }
        }

        if (command instanceof ListKeyRotationsCommand) {
          if (command.input.KeyId === 'key-a') {
            if (!command.input.Marker) {
              return {
                NextMarker: 'rotations-page-2',
                Rotations: [{ RotationDate: new Date('2026-01-01T00:00:00.000Z') }],
                Truncated: true,
              };
            }

            return {
              Rotations: [{ RotationDate: new Date('2026-06-01T00:00:00.000Z') }],
              Truncated: false,
            };
          }

          if (command.input.KeyId === 'key-d') {
            throw Object.assign(new Error('Access denied'), { name: 'AccessDeniedException' });
          }

          return { Rotations: [], Truncated: false };
        }

        throw new Error(`Unexpected command: ${String(command)}`);
      }),
    } as never);

    const result = await hydrateAwsKmsKeyChurnReviews([
      discoveredKey('key-a'),
      discoveredKey('key-b'),
      discoveredKey('key-c'),
      discoveredKey('key-d'),
      discoveredKey('aws-managed'),
      discoveredKey('pending-deletion'),
    ]);

    expect(result).toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'AccessDeniedException',
          message:
            'KMS last-usage metadata was unavailable for 1 enabled customer-managed key in eu-central-1 because access is denied by a service control policy (SCP).',
          status: 'access_denied',
        }),
        expect.objectContaining({
          code: 'AccessDeniedException',
          message:
            'KMS rotation metadata was unavailable for 1 enabled customer-managed key in eu-central-1 because access is denied by AWS permissions.',
          status: 'access_denied',
        }),
      ],
      resources: [
        {
          accountId,
          aliasPatternGroups: [
            {
              keyCount: 2,
              patternId: expect.stringMatching(/^pattern-[a-f0-9]{12}$/u),
            },
          ],
          aliasPatternsAvailable: true,
          creationWindowEnd: '2026-09-01T00:00:00.000Z',
          creationWindowStart: '2026-08-01T00:00:00.000Z',
          enabledCustomerManagedKeyCount: 4,
          estimatedMonthlyStorageCostUsd: 6,
          keyMetadataComplete: true,
          keyMetadataUnavailableCount: 0,
          keysCreatedInWindow: 3,
          multiRegionKeyCount: 2,
          noKmsUsageSinceCreationKeyCount: 1,
          region,
          reviewId: 'kms-key-churn/eu-central-1',
          rotatedKeyCount: 1,
          storageCostEstimateComplete: false,
          unobservedBeforeTrackingKeyCount: 1,
          usageMetadataUnavailableKeyCount: 1,
          usedKeyCount: 1,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('payments-platform');
    expect(JSON.stringify(result)).not.toContain('customer-refactor');
    expect(JSON.stringify(result)).not.toContain('fix-timeouts');

    const send = mockedCreateKmsClient.mock.results[0]?.value.send;
    const commands = send.mock.calls.map(([command]: [unknown]) => command);
    expect(commands.filter((command: unknown) => command instanceof ListAliasesCommand)).toHaveLength(2);
    expect(
      commands.filter(
        (command: unknown) => command instanceof ListKeyRotationsCommand && command.input.KeyId === 'key-a',
      ),
    ).toHaveLength(2);
  });

  it('keeps readable inventory when another key denies DescribeKey metadata', async () => {
    mockedCreateKmsClient.mockReturnValue({
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListAliasesCommand) {
          return { Aliases: [], Truncated: false };
        }

        if (command instanceof DescribeKeyCommand) {
          if (command.input.KeyId === 'blocked') {
            throw Object.assign(new Error('Access denied'), { name: 'AccessDeniedException' });
          }

          return {
            KeyMetadata: {
              ARN: keyArn('readable'),
              CreationDate: new Date('2026-08-01T00:00:00.000Z'),
              KeyId: 'readable',
              KeyManager: 'CUSTOMER',
              KeySpec: 'RSA_2048',
              KeyState: 'Enabled',
              KeyUsage: 'SIGN_VERIFY',
              Origin: 'AWS_KMS',
            },
          };
        }

        if (command instanceof GetKeyLastUsageCommand) {
          return {
            KeyCreationDate: new Date('2026-08-01T00:00:00.000Z'),
            KeyLastUsage: {},
            TrackingStartDate: new Date('2026-08-01T00:00:00.000Z'),
          };
        }

        throw new Error(`Unexpected command: ${String(command)}`);
      }),
    } as never);

    await expect(hydrateAwsKmsKeyChurnReviews([discoveredKey('readable'), discoveredKey('blocked')])).resolves.toEqual({
      diagnostics: [
        expect.objectContaining({
          message:
            'KMS key metadata was unavailable for 1 discovered key in eu-central-1 because access is denied by AWS permissions.',
          status: 'access_denied',
        }),
      ],
      resources: [
        expect.objectContaining({
          enabledCustomerManagedKeyCount: 1,
          keyMetadataComplete: false,
          keyMetadataUnavailableCount: 1,
          noKmsUsageSinceCreationKeyCount: 1,
        }),
      ],
    });
  });
});
