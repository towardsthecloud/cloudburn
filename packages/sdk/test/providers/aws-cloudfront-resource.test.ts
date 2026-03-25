import type { GetDistributionCommand, ListDistributionsCommand } from '@aws-sdk/client-cloudfront';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudFrontClient, resolveAwsAccountId } from '../../src/providers/aws/client.js';
import {
  hydrateAwsCloudFrontDistributionRequestActivity,
  hydrateAwsCloudFrontDistributions,
} from '../../src/providers/aws/resources/cloudfront.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCloudFrontClient: vi.fn(),
  resolveAwsAccountId: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', () => ({
  fetchCloudWatchSignals: vi.fn(),
}));

const mockedCreateCloudFrontClient = vi.mocked(createCloudFrontClient);
const mockedResolveAwsAccountId = vi.mocked(resolveAwsAccountId);
const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);

describe('hydrateAwsCloudFrontDistributions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('falls back to listing distributions when Resource Explorer seeds are unavailable', async () => {
    mockedResolveAwsAccountId.mockResolvedValue('123456789012');
    mockedCreateCloudFrontClient.mockReturnValue({
      send: vi.fn(async (command: ListDistributionsCommand | GetDistributionCommand) => {
        if (command.constructor.name === 'ListDistributionsCommand') {
          return {
            DistributionList: {
              Items: [
                {
                  ARN: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
                  Id: 'E1234567890ABC',
                },
              ],
              NextMarker: undefined,
            },
          };
        }

        return {
          Distribution: {
            DistributionConfig: {
              PriceClass: 'PriceClass_All',
            },
          },
        };
      }),
    } as never);

    await expect(hydrateAwsCloudFrontDistributions([])).resolves.toEqual([
      {
        accountId: '123456789012',
        distributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
        distributionId: 'E1234567890ABC',
        priceClass: 'PriceClass_All',
        region: 'global',
      },
    ]);
  });

  it('hydrates 30-day CloudFront request activity from CloudWatch metrics', async () => {
    mockedCreateCloudFrontClient.mockReturnValue({
      send: vi.fn(async (command: ListDistributionsCommand | GetDistributionCommand) => {
        if (command.constructor.name === 'ListDistributionsCommand') {
          return {
            DistributionList: {
              Items: [
                {
                  ARN: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
                  Id: 'E1234567890ABC',
                },
              ],
            },
          };
        }

        return {
          Distribution: {
            DistributionConfig: {
              PriceClass: 'PriceClass_100',
            },
          },
        };
      }),
    } as never);
    mockedResolveAwsAccountId.mockResolvedValue('123456789012');
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'distribution0',
          Array.from({ length: 30 }, (_, index) => ({
            timestamp: `2026-02-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            value: 3,
          })),
        ],
      ]),
    );

    await expect(hydrateAwsCloudFrontDistributionRequestActivity([])).resolves.toEqual([
      {
        accountId: '123456789012',
        distributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
        distributionId: 'E1234567890ABC',
        region: 'global',
        totalRequestsLast30Days: 90,
      },
    ]);
  });

  it('preserves incomplete CloudFront request coverage as null totals', async () => {
    mockedCreateCloudFrontClient.mockReturnValue({
      send: vi.fn(async (_command: GetDistributionCommand) => ({
        Distribution: {
          DistributionConfig: {
            PriceClass: 'PriceClass_100',
          },
        },
      })),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'distribution0',
          [
            {
              timestamp: '2026-02-01T00:00:00.000Z',
              value: 3,
            },
          ],
        ],
      ]),
    );

    await expect(
      hydrateAwsCloudFrontDistributionRequestActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
          properties: [],
          region: 'global',
          resourceType: 'cloudfront:distribution',
          service: 'cloudfront',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        distributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
        distributionId: 'E1234567890ABC',
        region: 'global',
        totalRequestsLast30Days: null,
      },
    ]);
  });
});
