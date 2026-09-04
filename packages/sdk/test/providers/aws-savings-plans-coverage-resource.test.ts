import { GetSavingsPlansCoverageCommand } from '@aws-sdk/client-cost-explorer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCostExplorerClient } from '../../src/providers/aws/client.js';
import { hydrateAwsSageMakerSavingsPlansCoverage } from '../../src/providers/aws/resources/savings-plans-coverage.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCostExplorerClient: vi.fn(),
}));

const mockedCreateCostExplorerClient = vi.mocked(createCostExplorerClient);
const accountId = '123456789012';

describe('hydrateAwsSageMakerSavingsPlansCoverage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads normalized SageMaker coverage for the last 30 complete days', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetSavingsPlansCoverageCommand) {
        return {
          SavingsPlansCoverages: [
            {
              Coverage: {
                CoveragePercentage: '60',
                OnDemandCost: '100',
                SpendCoveredBySavingsPlans: '150',
                TotalCost: '250',
              },
              TimePeriod: { End: '2026-09-04', Start: '2026-08-05' },
            },
          ],
        };
      }

      throw new Error(`Unexpected command: ${String(command)}`);
    });
    mockedCreateCostExplorerClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsSageMakerSavingsPlansCoverage([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual([
      {
        accountId,
        coveragePercentage: 60,
        onDemandCost: 100,
        periodEnd: '2026-09-04',
        periodStart: '2026-08-05',
        spendCoveredBySavingsPlans: 150,
        totalCost: 250,
      },
    ]);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Filter: {
            Dimensions: {
              Key: 'SERVICE',
              Values: ['Amazon SageMaker'],
            },
          },
          MaxResults: 100,
          Metrics: ['SpendCoveredBySavingsPlans'],
          NextToken: undefined,
          TimePeriod: {
            End: '2026-09-04',
            Start: '2026-08-05',
          },
        },
      }),
    );
  });

  it('returns no coverage record when SageMaker has no Savings Plans eligible usage', async () => {
    mockedCreateCostExplorerClient.mockReturnValue({
      send: vi.fn().mockResolvedValue({ SavingsPlansCoverages: [] }),
    } as never);

    await expect(
      hydrateAwsSageMakerSavingsPlansCoverage([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual([]);
  });

  it('paginates coverage responses', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (!(command instanceof GetSavingsPlansCoverageCommand)) {
        throw new Error(`Unexpected command: ${String(command)}`);
      }

      return command.input.NextToken
        ? { SavingsPlansCoverages: [] }
        : {
            NextToken: 'page-2',
            SavingsPlansCoverages: [
              {
                Coverage: {
                  CoveragePercentage: '100',
                  OnDemandCost: '0',
                  SpendCoveredBySavingsPlans: '50',
                  TotalCost: '50',
                },
                TimePeriod: { End: '2026-09-04', Start: '2026-08-05' },
              },
            ],
          };
    });
    mockedCreateCostExplorerClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsSageMakerSavingsPlansCoverage([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toHaveLength(1);
    expect(
      send.mock.calls
        .map(([command]) => command)
        .filter((command): command is GetSavingsPlansCoverageCommand =>
          Boolean(command instanceof GetSavingsPlansCoverageCommand),
        )
        .map((command) => command.input.NextToken),
    ).toEqual([undefined, 'page-2']);
  });

  it('marks the dataset unavailable when AWS returns incomplete coverage numbers', async () => {
    mockedCreateCostExplorerClient.mockReturnValue({
      send: vi.fn().mockResolvedValue({
        SavingsPlansCoverages: [
          {
            Coverage: {
              CoveragePercentage: 'not-a-number',
              OnDemandCost: '100',
              SpendCoveredBySavingsPlans: '150',
              TotalCost: '250',
            },
            TimePeriod: { End: '2026-09-04', Start: '2026-08-05' },
          },
        ],
      }),
    } as never);

    await expect(
      hydrateAwsSageMakerSavingsPlansCoverage([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'SavingsPlansCoverageIncomplete',
          status: 'skipped',
        }),
      ],
      resources: [],
      unavailable: true,
    });
  });

  it('returns an unavailable diagnostic when Cost Explorer has no coverage data', async () => {
    mockedCreateCostExplorerClient.mockReturnValue({
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('Requested data unavailable'), {
          name: 'DataUnavailableException',
        }),
      ),
    } as never);

    await expect(
      hydrateAwsSageMakerSavingsPlansCoverage([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'DataUnavailableException',
          message: 'Skipped SageMaker Savings Plans coverage because AWS Cost Explorer data is unavailable.',
          status: 'skipped',
        }),
      ],
      resources: [],
      unavailable: true,
    });
  });

  it('returns an access-denied diagnostic when coverage cannot be read', async () => {
    mockedCreateCostExplorerClient.mockReturnValue({
      send: vi.fn().mockRejectedValue(Object.assign(new Error('Access denied'), { name: 'AccessDeniedException' })),
    } as never);

    await expect(
      hydrateAwsSageMakerSavingsPlansCoverage([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'AccessDeniedException',
          message:
            'Skipped SageMaker Savings Plans coverage because access to AWS Cost Explorer is denied by AWS permissions.',
          status: 'access_denied',
        }),
      ],
      resources: [],
      unavailable: true,
    });
  });
});
