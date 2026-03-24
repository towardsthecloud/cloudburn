import type { GetDistributionCommand, ListDistributionsCommand } from '@aws-sdk/client-cloudfront';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudFrontClient, resolveAwsAccountId } from '../../src/providers/aws/client.js';
import { hydrateAwsCloudFrontDistributions } from '../../src/providers/aws/resources/cloudfront.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCloudFrontClient: vi.fn(),
  resolveAwsAccountId: vi.fn(),
}));

const mockedCreateCloudFrontClient = vi.mocked(createCloudFrontClient);
const mockedResolveAwsAccountId = vi.mocked(resolveAwsAccountId);

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
});
