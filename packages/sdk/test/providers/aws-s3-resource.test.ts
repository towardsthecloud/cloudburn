import type {
  GetBucketLifecycleConfigurationCommand,
  ListBucketIntelligentTieringConfigurationsCommand,
} from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createS3Client } from '../../src/providers/aws/client.js';
import { hydrateAwsS3BucketAnalyses } from '../../src/providers/aws/resources/s3.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createS3Client: vi.fn(),
}));

const mockedCreateS3Client = vi.mocked(createS3Client);

describe('hydrateAwsS3BucketAnalyses', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates buckets with no lifecycle configuration as empty lifecycle signal', async () => {
    const send = vi.fn(
      async (command: GetBucketLifecycleConfigurationCommand | ListBucketIntelligentTieringConfigurationsCommand) => {
        if (command.constructor.name === 'GetBucketLifecycleConfigurationCommand') {
          throw Object.assign(new Error('missing lifecycle'), { name: 'NoSuchLifecycleConfiguration' });
        }

        return {
          IntelligentTieringConfigurationList: [],
          IsTruncated: false,
        };
      },
    );

    mockedCreateS3Client.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsS3BucketAnalyses([
        {
          accountId: '123456789012',
          arn: 'arn:aws:s3:::logs-bucket',
          properties: [],
          region: 'us-east-1',
          resourceType: 's3:bucket',
          service: 's3',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        bucketName: 'logs-bucket',
        hasAbortIncompleteMultipartUploadAfter7Days: false,
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: false,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: false,
        hasUnclassifiedTransition: false,
        region: 'us-east-1',
      },
    ]);
  });

  it('hydrates expiration-only lifecycle rules without storage-class optimization', async () => {
    const send = vi.fn(
      async (command: GetBucketLifecycleConfigurationCommand | ListBucketIntelligentTieringConfigurationsCommand) => {
        if (command.constructor.name === 'GetBucketLifecycleConfigurationCommand') {
          return {
            Rules: [
              {
                Expiration: { Days: 30 },
                Status: 'Enabled',
              },
            ],
          };
        }

        return {
          IntelligentTieringConfigurationList: [],
          IsTruncated: false,
        };
      },
    );

    mockedCreateS3Client.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsS3BucketAnalyses([
        {
          accountId: '123456789012',
          arn: 'arn:aws:s3:::logs-bucket',
          properties: [],
          region: 'us-east-1',
          resourceType: 's3:bucket',
          service: 's3',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        bucketName: 'logs-bucket',
        hasAbortIncompleteMultipartUploadAfter7Days: false,
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: true,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: true,
        hasUnclassifiedTransition: false,
        region: 'us-east-1',
      },
    ]);
  });

  it('detects Intelligent-Tiering lifecycle transitions and paginates intelligent-tiering configs', async () => {
    const send = vi.fn(
      async (command: GetBucketLifecycleConfigurationCommand | ListBucketIntelligentTieringConfigurationsCommand) => {
        const input = command.input as { ContinuationToken?: string };

        if (command.constructor.name === 'GetBucketLifecycleConfigurationCommand') {
          return {
            Rules: [
              {
                Status: 'Enabled',
                Transitions: [{ StorageClass: 'INTELLIGENT_TIERING' }],
              },
            ],
          };
        }

        if (!input.ContinuationToken) {
          return {
            IntelligentTieringConfigurationList: [],
            IsTruncated: true,
            NextContinuationToken: 'page-2',
          };
        }

        return {
          IntelligentTieringConfigurationList: [
            {
              Id: 'archive-policy',
              Status: 'Enabled',
              Tierings: [],
            },
          ],
          IsTruncated: false,
        };
      },
    );

    mockedCreateS3Client.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsS3BucketAnalyses([
        {
          accountId: '123456789012',
          arn: 'arn:aws:s3:::logs-bucket',
          properties: [],
          region: 'us-east-1',
          resourceType: 's3:bucket',
          service: 's3',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        bucketName: 'logs-bucket',
        hasAbortIncompleteMultipartUploadAfter7Days: false,
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: true,
        hasIntelligentTieringConfiguration: true,
        hasIntelligentTieringTransition: true,
        hasLifecycleSignal: true,
        hasUnclassifiedTransition: false,
        region: 'us-east-1',
      },
    ]);
  });

  it('detects alternative storage classes and unclassified transitions', async () => {
    const send = vi.fn(
      async (command: GetBucketLifecycleConfigurationCommand | ListBucketIntelligentTieringConfigurationsCommand) => {
        if (command.constructor.name === 'GetBucketLifecycleConfigurationCommand') {
          return {
            Rules: [
              {
                Status: 'Enabled',
                Transitions: [{ StorageClass: 'GLACIER' }, {}],
              },
            ],
          };
        }

        return {
          IntelligentTieringConfigurationList: [],
          IsTruncated: false,
        };
      },
    );

    mockedCreateS3Client.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsS3BucketAnalyses([
        {
          accountId: '123456789012',
          arn: 'arn:aws:s3:::logs-bucket',
          properties: [],
          region: 'us-east-1',
          resourceType: 's3:bucket',
          service: 's3',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        bucketName: 'logs-bucket',
        hasAbortIncompleteMultipartUploadAfter7Days: false,
        hasAlternativeStorageClassTransition: true,
        hasCostFocusedLifecycle: true,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: true,
        hasUnclassifiedTransition: true,
        region: 'us-east-1',
      },
    ]);
  });

  it('creates region-specific clients for buckets in different regions', async () => {
    mockedCreateS3Client.mockImplementation(({ region }) => {
      const send = vi.fn(
        async (command: GetBucketLifecycleConfigurationCommand | ListBucketIntelligentTieringConfigurationsCommand) => {
          if (command.constructor.name === 'GetBucketLifecycleConfigurationCommand') {
            return {
              Rules: region === 'us-east-1' ? [{ Expiration: { Days: 7 }, Status: 'Enabled' }] : [],
            };
          }

          return {
            IntelligentTieringConfigurationList: [],
            IsTruncated: false,
          };
        },
      );

      return { send } as never;
    });

    const analyses = await hydrateAwsS3BucketAnalyses([
      {
        accountId: '123456789012',
        arn: 'arn:aws:s3:::alpha-bucket',
        properties: [],
        region: 'us-east-1',
        resourceType: 's3:bucket',
        service: 's3',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:s3:::zeta-bucket',
        properties: [],
        region: 'eu-west-1',
        resourceType: 's3:bucket',
        service: 's3',
      },
    ]);

    expect(mockedCreateS3Client).toHaveBeenCalledTimes(2);
    expect(analyses).toEqual([
      {
        accountId: '123456789012',
        bucketName: 'alpha-bucket',
        hasAbortIncompleteMultipartUploadAfter7Days: false,
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: true,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: true,
        hasUnclassifiedTransition: false,
        region: 'us-east-1',
      },
      {
        accountId: '123456789012',
        bucketName: 'zeta-bucket',
        hasAbortIncompleteMultipartUploadAfter7Days: false,
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: false,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: false,
        hasUnclassifiedTransition: false,
        region: 'eu-west-1',
      },
    ]);
  });

  it('detects enabled abort-incomplete-multipart rules within 7 days', async () => {
    const send = vi.fn(
      async (command: GetBucketLifecycleConfigurationCommand | ListBucketIntelligentTieringConfigurationsCommand) => {
        if (command.constructor.name === 'GetBucketLifecycleConfigurationCommand') {
          return {
            Rules: [
              {
                AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
                Status: 'Enabled',
              },
            ],
          };
        }

        return {
          IntelligentTieringConfigurationList: [],
          IsTruncated: false,
        };
      },
    );

    mockedCreateS3Client.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsS3BucketAnalyses([
        {
          accountId: '123456789012',
          arn: 'arn:aws:s3:::logs-bucket',
          properties: [],
          region: 'us-east-1',
          resourceType: 's3:bucket',
          service: 's3',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        bucketName: 'logs-bucket',
        hasAbortIncompleteMultipartUploadAfter7Days: true,
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: false,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: true,
        hasUnclassifiedTransition: false,
        region: 'us-east-1',
      },
    ]);
  });

  it('caps in-flight S3 hydration work per region', async () => {
    let currentInFlight = 0;
    let maxInFlight = 0;
    const send = vi.fn(
      async (_command: GetBucketLifecycleConfigurationCommand | ListBucketIntelligentTieringConfigurationsCommand) =>
        new Promise<{
          Rules?: { Expiration?: { Days: number }; Status: string }[];
          IntelligentTieringConfigurationList?: [];
          IsTruncated?: boolean;
        }>((resolve) => {
          currentInFlight += 1;
          maxInFlight = Math.max(maxInFlight, currentInFlight);

          setTimeout(() => {
            currentInFlight -= 1;
            resolve({
              IntelligentTieringConfigurationList: [],
              IsTruncated: false,
            });
          }, 0);
        }),
    );

    mockedCreateS3Client.mockReturnValue({ send } as never);

    const resources = Array.from({ length: 30 }, (_, index) => ({
      accountId: '123456789012',
      arn: `arn:aws:s3:::bucket-${index}`,
      properties: [],
      region: 'us-east-1',
      resourceType: 's3:bucket' as const,
      service: 's3',
    }));

    await hydrateAwsS3BucketAnalyses(resources);

    expect(maxInFlight).toBeLessThanOrEqual(20);
  });
});
