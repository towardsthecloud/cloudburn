import type { GetDistributionCommand, ListDistributionsCommand } from '@aws-sdk/client-cloudfront';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudFrontClient, resolveAwsAccountId } from '../../src/providers/aws/client.js';
import { hydrateAwsCloudFrontDistributionRequestActivity } from '../../src/providers/aws/resources/cloudfront.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import { completeMetricEvidence } from '../helpers/cloudwatch.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCloudFrontClient: vi.fn(),
  resolveAwsAccountId: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/aws/resources/cloudwatch.js')>()),
  fetchCloudWatchSignals: vi.fn(),
}));

const mockedCreateCloudFrontClient = vi.mocked(createCloudFrontClient);
const mockedResolveAwsAccountId = vi.mocked(resolveAwsAccountId);
const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);

describe('hydrateAwsCloudFrontDistributionRequestActivity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
          completeMetricEvidence(
            Array.from({ length: 30 }, (_, index) => ({
              timestamp: new Date(Date.UTC(2026, 1, index + 1)).toISOString(),
              value: 3,
            })),
          ),
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
});
