import {
  GetRecommendationCommand,
  ListEnrollmentStatusesCommand,
  ListRecommendationsCommand,
} from '@aws-sdk/client-cost-optimization-hub';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCostOptimizationHubClient } from '../../src/providers/aws/client.js';
import { hydrateAwsSageMakerSavingsPlansRecommendations } from '../../src/providers/aws/resources/cost-optimization-hub.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCostOptimizationHubClient: vi.fn(),
}));

const mockedCreateCostOptimizationHubClient = vi.mocked(createCostOptimizationHubClient);
const accountId = '123456789012';

describe('hydrateAwsSageMakerSavingsPlansRecommendations', () => {
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
            {
              accountId,
              actionType: 'PurchaseSavingsPlans',
              currencyCode: 'USD',
              currentResourceType: 'SageMakerSavingsPlans',
              estimatedMonthlyCost: 410,
              estimatedMonthlySavings: 107.85,
              estimatedSavingsPercentage: 26,
              implementationEffort: 'VeryLow',
              lastRefreshTimestamp: new Date('2026-09-03T00:00:00.000Z'),
              recommendationId: 'recommendation-1',
              restartNeeded: false,
              rollbackPossible: false,
              source: 'CostExplorer',
            },
          ],
        };
      }

      if (command instanceof GetRecommendationCommand) {
        return {
          recommendationId: 'recommendation-1',
          recommendedResourceDetails: {
            sageMakerSavingsPlans: {
              configuration: {
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
      hydrateAwsSageMakerSavingsPlansRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual([
      {
        accountId,
        actionType: 'PurchaseSavingsPlans',
        currencyCode: 'USD',
        estimatedMonthlyCost: 410,
        estimatedMonthlySavings: 107.85,
        estimatedSavingsPercentage: 26,
        implementationEffort: 'VeryLow',
        lastRefreshTimestamp: '2026-09-03T00:00:00.000Z',
        paymentOption: 'NoUpfront',
        recommendationId: 'recommendation-1',
        recommendationSource: 'CostExplorer',
        restartNeeded: false,
        rollbackPossible: false,
        term: 'OneYear',
      },
    ]);

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          filter: {
            accountIds: [accountId],
            actionTypes: ['PurchaseSavingsPlans'],
            resourceTypes: ['SageMakerSavingsPlans'],
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
      hydrateAwsSageMakerSavingsPlansRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual({
      diagnostics: [
        {
          code: 'CostOptimizationHubNotEnrolled',
          message:
            'Skipped SageMaker Savings Plans recommendations because this account is not enrolled in AWS Cost Optimization Hub.',
          provider: 'aws',
          service: 'sagemaker',
          source: 'discovery',
          status: 'skipped',
        },
      ],
      resources: [],
      unavailable: true,
    });
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
      hydrateAwsSageMakerSavingsPlansRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'AccessDeniedException',
          message:
            'Skipped SageMaker Savings Plans recommendations because access to AWS Cost Optimization Hub is denied by AWS permissions.',
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
      hydrateAwsSageMakerSavingsPlansRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual([]);
    expect(send.mock.calls.some(([command]) => command instanceof GetRecommendationCommand)).toBe(false);
  });

  it('paginates recommendations and removes repeated recommendation IDs', async () => {
    const recommendation = (recommendationId: string) => ({
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
    });
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
              configuration: { paymentOption: 'NoUpfront', term: 'OneYear' },
            },
          },
        };
      }

      throw new Error(`Unexpected command: ${String(command)}`);
    });
    mockedCreateCostOptimizationHubClient.mockReturnValue({ send } as never);

    const result = await hydrateAwsSageMakerSavingsPlansRecommendations([], {
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
            items: [
              {
                accountId,
                actionType: 'PurchaseSavingsPlans',
                currencyCode: 'USD',
                currentResourceType: 'SageMakerSavingsPlans',
                estimatedMonthlyCost: 200,
                estimatedMonthlySavings: 50,
                estimatedSavingsPercentage: 25,
                lastRefreshTimestamp: new Date('2026-09-03T00:00:00.000Z'),
                recommendationId: 'recommendation-incomplete',
                source: 'CostExplorer',
              },
            ],
          };
        }

        if (command instanceof GetRecommendationCommand) {
          return { recommendedResourceDetails: { sageMakerSavingsPlans: {} } };
        }

        throw new Error(`Unexpected command: ${String(command)}`);
      }),
    } as never);

    await expect(
      hydrateAwsSageMakerSavingsPlansRecommendations([], {
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
