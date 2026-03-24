import type { GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCostExplorerClient, resolveAwsAccountId } from '../../src/providers/aws/client.js';
import { hydrateAwsCostUsage } from '../../src/providers/aws/resources/cost-explorer.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCostExplorerClient: vi.fn(),
  resolveAwsAccountId: vi.fn(),
}));

const mockedCreateCostExplorerClient = vi.mocked(createCostExplorerClient);
const mockedResolveAwsAccountId = vi.mocked(resolveAwsAccountId);

describe('hydrateAwsCostUsage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-24T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates service spend changes across the last two full months', async () => {
    mockedResolveAwsAccountId.mockResolvedValue('123456789012');
    mockedCreateCostExplorerClient.mockReturnValue({
      send: vi.fn(async (command: GetCostAndUsageCommand) => {
        expect(command.input).toMatchObject({
          Granularity: 'MONTHLY',
          GroupBy: [{ Key: 'SERVICE', Type: 'DIMENSION' }],
          Metrics: ['NetUnblendedCost'],
          TimePeriod: {
            End: '2026-03-01',
            Start: '2026-01-01',
          },
        });

        return {
          ResultsByTime: [
            {
              Groups: [
                {
                  Keys: ['Amazon DynamoDB'],
                  Metrics: {
                    NetUnblendedCost: {
                      Amount: '10',
                      Unit: 'USD',
                    },
                  },
                },
              ],
              TimePeriod: {
                Start: '2026-01-01',
              },
            },
            {
              Groups: [
                {
                  Keys: ['Amazon DynamoDB'],
                  Metrics: {
                    NetUnblendedCost: {
                      Amount: '25',
                      Unit: 'USD',
                    },
                  },
                },
              ],
              TimePeriod: {
                Start: '2026-02-01',
              },
            },
          ],
        };
      }),
    } as never);

    await expect(hydrateAwsCostUsage([])).resolves.toEqual([
      {
        accountId: '123456789012',
        costIncrease: 15,
        costUnit: 'USD',
        currentMonthCost: 25,
        previousMonthCost: 10,
        serviceName: 'Amazon DynamoDB',
        serviceSlug: 'amazon-dynamodb',
      },
    ]);
  });
});
