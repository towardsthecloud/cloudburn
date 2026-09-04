import {
  GetRecommendationCommand,
  ListEnrollmentStatusesCommand,
  ListRecommendationsCommand,
  type Recommendation,
} from '@aws-sdk/client-cost-optimization-hub';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCostOptimizationHubClient } from '../../src/providers/aws/client.js';
import { hydrateAwsCostOptimizationHubSavingsPlansRecommendations } from '../../src/providers/aws/resources/cost-optimization-hub.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCostOptimizationHubClient: vi.fn(),
}));

const mockedCreateCostOptimizationHubClient = vi.mocked(createCostOptimizationHubClient);
const accountId = '123456789012';
const recommendation = (recommendationId: string, overrides: Partial<Recommendation> = {}): Recommendation => ({
  accountId,
  actionType: 'PurchaseSavingsPlans',
  currencyCode: 'USD',
  currentResourceType: 'SageMakerSavingsPlans',
  estimatedMonthlyCost: 200,
  estimatedMonthlySavings: 50,
  estimatedSavingsPercentage: 25,
  lastRefreshTimestamp: new Date('2026-09-03T00:00:00.000Z'),
  recommendationId,
  source: 'CostExplorer',
  ...overrides,
});

describe('hydrateAwsCostOptimizationHubSavingsPlansRecommendations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('normalizes an active account recommendation with its purchase terms', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) {
        return { items: [{ accountId, status: 'Active' }] };
      }

      if (command instanceof ListRecommendationsCommand) {
        return {
          items: [
            recommendation('recommendation-1', {
              estimatedMonthlyCost: 410,
              estimatedMonthlySavings: 107.85,
              estimatedSavingsPercentage: 26,
              implementationEffort: 'VeryLow',
              restartNeeded: false,
              rollbackPossible: false,
            }),
          ],
        };
      }

      if (command instanceof GetRecommendationCommand) {
        return {
          recommendationId: 'recommendation-1',
          recommendedResourceDetails: {
            sageMakerSavingsPlans: {
              configuration: {
                accountScope: 'LINKED',
                hourlyCommitment: '0.42',
                paymentOption: 'NoUpfront',
                term: 'OneYear',
              },
            },
          },
        };
      }

      throw new Error(`Unexpected command: ${String(command)}`);
    });
    mockedCreateCostOptimizationHubClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsCostOptimizationHubSavingsPlansRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual([
      {
        accountId,
        accountScope: 'LINKED',
        actionType: 'PurchaseSavingsPlans',
        currencyCode: 'USD',
        estimatedMonthlyCost: 410,
        estimatedMonthlySavings: 107.85,
        estimatedSavingsPercentage: 26,
        hourlyCommitment: 0.42,
        implementationEffort: 'VeryLow',
        lastRefreshTimestamp: '2026-09-03T00:00:00.000Z',
        paymentOption: 'NoUpfront',
        recommendationId: 'recommendation-1',
        recommendationSource: 'CostExplorer',
        restartNeeded: false,
        rollbackPossible: false,
        savingsPlansType: 'SageMakerSavingsPlans',
        term: 'OneYear',
      },
    ]);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          filter: {
            accountIds: [accountId],
            actionTypes: ['PurchaseSavingsPlans'],
            resourceTypes: ['ComputeSavingsPlans', 'Ec2InstanceSavingsPlans', 'SageMakerSavingsPlans'],
          },
          includeAllRecommendations: false,
          maxResults: 1000,
          nextToken: undefined,
        },
      }),
    );
  });

  it('marks recommendation evidence unavailable when the account is not enrolled', async () => {
    mockedCreateCostOptimizationHubClient.mockReturnValue({
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) {
          return { items: [{ accountId, status: 'Inactive' }] };
        }

        throw new Error(`Unexpected command: ${String(command)}`);
      }),
    } as never);

    await expect(
      hydrateAwsCostOptimizationHubSavingsPlansRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual({
      diagnostics: [
        {
          code: 'CostOptimizationHubNotEnrolled',
          message:
            'Skipped Savings Plans recommendations because this account is not enrolled in AWS Cost Optimization Hub.',
          provider: 'aws',
          service: 'costoptimizationhub',
          source: 'discovery',
          status: 'skipped',
        },
      ],
      resources: [],
      unavailable: true,
    });
  });

  it('normalizes Compute and EC2 Instance Savings Plans configuration fields', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) {
        return { items: [{ accountId, status: 'Active' }] };
      }

      if (command instanceof ListRecommendationsCommand) {
        return {
          items: (['ComputeSavingsPlans', 'Ec2InstanceSavingsPlans'] as const).map((currentResourceType, index) =>
            recommendation(`recommendation-${index + 1}`, {
              currentResourceType,
              estimatedMonthlyCost: 300,
              estimatedMonthlySavings: 75,
            }),
          ),
        };
      }

      if (command instanceof GetRecommendationCommand) {
        return command.input.recommendationId === 'recommendation-1'
          ? {
              recommendedResourceDetails: {
                computeSavingsPlans: {
                  configuration: {
                    accountScope: 'PAYER',
                    hourlyCommitment: '1.25',
                    paymentOption: 'PartialUpfront',
                    term: 'ThreeYears',
                  },
                },
              },
            }
          : {
              recommendedResourceDetails: {
                ec2InstanceSavingsPlans: {
                  configuration: {
                    accountScope: 'LINKED',
                    hourlyCommitment: '0.75',
                    instanceFamily: 'm7i',
                    paymentOption: 'NoUpfront',
                    savingsPlansRegion: 'eu-west-1',
                    term: 'OneYear',
                  },
                },
              },
            };
      }

      throw new Error(`Unexpected command: ${String(command)}`);
    });
    mockedCreateCostOptimizationHubClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsCostOptimizationHubSavingsPlansRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        accountScope: 'PAYER',
        hourlyCommitment: 1.25,
        recommendationId: 'recommendation-1',
        savingsPlansType: 'ComputeSavingsPlans',
      }),
      expect.objectContaining({
        accountScope: 'LINKED',
        hourlyCommitment: 0.75,
        instanceFamily: 'm7i',
        recommendationId: 'recommendation-2',
        savingsPlansRegion: 'eu-west-1',
        savingsPlansType: 'Ec2InstanceSavingsPlans',
      }),
    ]);
  });

  it('returns an access-denied diagnostic when recommendations cannot be listed', async () => {
    mockedCreateCostOptimizationHubClient.mockReturnValue({
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) {
          return { items: [{ accountId, status: 'Active' }] };
        }

        if (command instanceof ListRecommendationsCommand) {
          throw Object.assign(new Error('Access denied'), { name: 'AccessDeniedException' });
        }

        throw new Error(`Unexpected command: ${String(command)}`);
      }),
    } as never);

    await expect(
      hydrateAwsCostOptimizationHubSavingsPlansRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'AccessDeniedException',
          message:
            'Skipped Savings Plans recommendations because access to AWS Cost Optimization Hub is denied by AWS permissions.',
          status: 'access_denied',
        }),
      ],
      resources: [],
      unavailable: true,
    });
  });

  it('returns no recommendations when an active account has no matching opportunity', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) {
        return { items: [{ accountId, status: 'Active' }] };
      }

      if (command instanceof ListRecommendationsCommand) {
        return { items: [] };
      }

      throw new Error(`Unexpected command: ${String(command)}`);
    });
    mockedCreateCostOptimizationHubClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsCostOptimizationHubSavingsPlansRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual([]);
    expect(send.mock.calls.some(([command]) => command instanceof GetRecommendationCommand)).toBe(false);
  });

  it('paginates recommendations and removes repeated recommendation IDs', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) {
        return { items: [{ accountId, status: 'Active' }] };
      }

      if (command instanceof ListRecommendationsCommand) {
        return command.input.nextToken
          ? { items: [recommendation('recommendation-a'), recommendation('recommendation-z')] }
          : { items: [recommendation('recommendation-z')], nextToken: 'page-2' };
      }

      if (command instanceof GetRecommendationCommand) {
        return {
          recommendedResourceDetails: {
            sageMakerSavingsPlans: {
              configuration: {
                accountScope: 'LINKED',
                hourlyCommitment: '0.25',
                paymentOption: 'NoUpfront',
                term: 'OneYear',
              },
            },
          },
        };
      }

      throw new Error(`Unexpected command: ${String(command)}`);
    });
    mockedCreateCostOptimizationHubClient.mockReturnValue({ send } as never);

    const result = await hydrateAwsCostOptimizationHubSavingsPlansRecommendations([], {
      resolveAccountId: vi.fn().mockResolvedValue(accountId),
    });

    expect(result).toEqual([
      expect.objectContaining({ recommendationId: 'recommendation-a' }),
      expect.objectContaining({ recommendationId: 'recommendation-z' }),
    ]);
    expect(
      send.mock.calls
        .map(([command]) => command)
        .filter((command): command is ListRecommendationsCommand => command instanceof ListRecommendationsCommand)
        .map((command) => command.input.nextToken),
    ).toEqual([undefined, 'page-2']);
  });

  it('marks recommendation evidence unavailable when purchase terms are incomplete', async () => {
    mockedCreateCostOptimizationHubClient.mockReturnValue({
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) {
          return { items: [{ accountId, status: 'Active' }] };
        }

        if (command instanceof ListRecommendationsCommand) {
          return {
            items: [recommendation('recommendation-incomplete')],
          };
        }

        if (command instanceof GetRecommendationCommand) {
          return { recommendedResourceDetails: { sageMakerSavingsPlans: {} } };
        }

        throw new Error(`Unexpected command: ${String(command)}`);
      }),
    } as never);

    await expect(
      hydrateAwsCostOptimizationHubSavingsPlansRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'CostOptimizationHubRecommendationIncomplete',
          status: 'skipped',
        }),
      ],
      resources: [],
      unavailable: true,
    });
  });
});
