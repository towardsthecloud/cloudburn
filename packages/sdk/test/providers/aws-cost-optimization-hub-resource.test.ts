import {
  GetRecommendationCommand,
  ListEnrollmentStatusesCommand,
  ListRecommendationsCommand,
  type Recommendation,
} from '@aws-sdk/client-cost-optimization-hub';
import type { AwsCostOptimizationHubSavingsPlansRecommendation } from '@cloudburn/rules';
import { createAwsCostOptimizationHubFindingMatch } from '@cloudburn/rules';
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
              recommendationLookbackPeriodInDays: 14,
              restartNeeded: false,
              rollbackPossible: false,
            }),
          ],
        };
      }

      if (command instanceof GetRecommendationCommand) {
        return {
          recommendationId: 'recommendation-1',
          costCalculationLookbackPeriodInDays: 30,
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
        costCalculationLookbackPeriodInDays: 30,
        currencyCode: 'USD',
        estimatedMonthlyCost: 410,
        estimatedMonthlySavings: 107.85,
        estimatedSavingsPercentage: 26,
        hourlyCommitment: 0.42,
        implementationEffort: 'VeryLow',
        lastRefreshTimestamp: '2026-09-03T00:00:00.000Z',
        paymentOption: 'NoUpfront',
        recommendationId: 'recommendation-1',
        recommendationLookbackPeriodInDays: 14,
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

  it('normalizes missing or unusable financial fields as null without dropping the recommendation', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) {
        return { items: [{ accountId, status: 'Active' }] };
      }

      if (command instanceof ListRecommendationsCommand) {
        return {
          items: [
            recommendation('recommendation-1', {
              currencyCode: undefined,
              estimatedMonthlyCost: undefined,
              estimatedMonthlySavings: Number.NaN,
              estimatedSavingsPercentage: undefined,
              recommendationLookbackPeriodInDays: Number.NaN,
            }),
            recommendation('recommendation-2', {
              recommendationLookbackPeriodInDays: 0,
            }),
          ],
        };
      }

      if (command instanceof GetRecommendationCommand) {
        return {
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

    const result = await hydrateAwsCostOptimizationHubSavingsPlansRecommendations([], {
      resolveAccountId: vi.fn().mockResolvedValue(accountId),
    });

    expect(result).toEqual([
      expect.objectContaining({
        currencyCode: null,
        estimatedMonthlyCost: null,
        estimatedMonthlySavings: null,
        estimatedSavingsPercentage: null,
        recommendationId: 'recommendation-1',
      }),
      expect.objectContaining({
        currencyCode: 'USD',
        estimatedMonthlyCost: 200,
        estimatedMonthlySavings: 50,
        estimatedSavingsPercentage: 25,
        recommendationId: 'recommendation-2',
      }),
    ]);
    for (const normalized of Array.isArray(result) ? result : []) {
      expect(Object.hasOwn(normalized, 'recommendationLookbackPeriodInDays')).toBe(false);
    }
  });

  const sageMakerDetail = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    recommendationId: 'recommendation-1',
    accountId,
    actionType: 'PurchaseSavingsPlans',
    currentResourceType: 'SageMakerSavingsPlans',
    source: 'CostExplorer',
    lastRefreshTimestamp: new Date('2026-09-03T00:00:00.000Z'),
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
    ...overrides,
  });

  const loadRecommendations = (summary: Partial<Recommendation>, detail: Record<string, unknown>) => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) {
        return { items: [{ accountId, status: 'Active' }] };
      }
      if (command instanceof ListRecommendationsCommand) {
        return { items: [recommendation('recommendation-1', summary)] };
      }
      if (command instanceof GetRecommendationCommand) {
        return detail;
      }
      throw new Error(`Unexpected command: ${String(command)}`);
    });
    mockedCreateCostOptimizationHubClient.mockReturnValue({ send } as never);
    return hydrateAwsCostOptimizationHubSavingsPlansRecommendations([], {
      resolveAccountId: vi.fn().mockResolvedValue(accountId),
    });
  };

  const loadFirstRecommendation = async (
    summary: Partial<Recommendation>,
    detail: Record<string, unknown>,
  ): Promise<AwsCostOptimizationHubSavingsPlansRecommendation> => {
    const result = await loadRecommendations(summary, detail);
    const [normalized] = Array.isArray(result) ? result : [];
    if (!normalized) throw new Error('Expected one normalized recommendation');
    return normalized;
  };

  it('retains repeated purchase IDs and ARNs as provenance-only evidence', async () => {
    const identity = {
      resourceId: 'purchase-a',
      resourceArn: `arn:aws:savingsplans::${accountId}:savingsplan/purchase-a`,
    };
    const normalized = await loadFirstRecommendation(
      { ...identity, estimatedMonthlyCost: undefined },
      sageMakerDetail({ ...identity, estimatedMonthlyCost: 80 }),
    );
    expect(normalized).toMatchObject({ estimatedMonthlyCost: 80 });
    expect(normalized).not.toHaveProperty('resourceId');
    expect(normalized).not.toHaveProperty('resourceArn');
    const finding = createAwsCostOptimizationHubFindingMatch(normalized);
    expect(finding.resourceId).toBe('recommendation-1');
    expect(finding.recommendation).toMatchObject({ source: 'aws-cost-optimization-hub', sourceId: 'recommendation-1' });
    expect(finding.recommendation?.resourceKey).toBeUndefined();
    expect(finding.impact?.currentCost).toMatchObject({
      amount: 80,
      confidence: 'estimated',
      currency: 'USD',
      period: 'month',
    });
  });

  it.each([
    'arn:aws:savingsplans::222222222222:savingsplan/purchase-a',
    `arn:aws:savingsplans:us-east-1:${accountId}:savingsplan/purchase-a`,
    'arn:malformed',
  ])('rejects conflicting or malformed scope even when purchase identifiers repeat (%s)', async (resourceArn) => {
    const identity = { resourceId: 'purchase-a', resourceArn };
    const result = await loadRecommendations({ ...identity, region: 'eu-west-1' }, sageMakerDetail(identity));
    expect(result).toMatchObject({
      unavailable: true,
      resources: [],
      diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
    });
  });

  it('fills missing summary financials from matching GetRecommendation detail evidence', async () => {
    const normalized = await loadFirstRecommendation(
      {
        currencyCode: undefined,
        estimatedMonthlyCost: undefined,
        estimatedMonthlySavings: undefined,
        estimatedSavingsPercentage: undefined,
        recommendationLookbackPeriodInDays: 14,
      },
      sageMakerDetail({
        currencyCode: 'EUR',
        estimatedMonthlyCost: 240,
        estimatedMonthlySavings: 60,
        estimatedSavingsPercentage: 25,
        costCalculationLookbackPeriodInDays: 30,
      }),
    );
    expect(normalized).toMatchObject({
      currencyCode: 'EUR',
      estimatedMonthlyCost: 240,
      estimatedMonthlySavings: 60,
      estimatedSavingsPercentage: 25,
      costCalculationLookbackPeriodInDays: 30,
      recommendationLookbackPeriodInDays: 14,
    });
    const impact = createAwsCostOptimizationHubFindingMatch(normalized).impact;
    expect(impact).toMatchObject({
      source: 'aws-cost-optimization-hub',
      sourceDetail: 'CostExplorer',
      sourceId: 'recommendation-1',
      refreshedAt: '2026-09-03T00:00:00.000Z',
      currentCost: { amount: 240, confidence: 'estimated', currency: 'EUR', period: 'month' },
      potentialSavings: { amount: 60, confidence: 'estimated', currency: 'EUR', period: 'month' },
      window: { lookbackDays: 30 },
    });
  });

  it('keeps known summary zeros and fills only missing values from detail', async () => {
    const normalized = await loadFirstRecommendation(
      {
        estimatedMonthlyCost: undefined,
        estimatedMonthlySavings: 0,
        estimatedSavingsPercentage: 0,
      },
      sageMakerDetail({
        currencyCode: 'USD',
        estimatedMonthlyCost: 80,
        estimatedMonthlySavings: 99,
        estimatedSavingsPercentage: 99,
        costCalculationLookbackPeriodInDays: 7,
      }),
    );
    expect(normalized).toMatchObject({
      currencyCode: 'USD',
      estimatedMonthlyCost: 80,
      estimatedMonthlySavings: 0,
      estimatedSavingsPercentage: 0,
      costCalculationLookbackPeriodInDays: 7,
    });
  });

  it('keeps non-finite detail financials null and omits the cost window', async () => {
    const normalized = await loadFirstRecommendation(
      {
        estimatedMonthlyCost: undefined,
        estimatedMonthlySavings: undefined,
        estimatedSavingsPercentage: undefined,
      },
      sageMakerDetail({
        estimatedMonthlyCost: Number.NaN,
        estimatedMonthlySavings: Number.POSITIVE_INFINITY,
        estimatedSavingsPercentage: Number.NaN,
        costCalculationLookbackPeriodInDays: Number.NaN,
      }),
    );
    expect(normalized).toMatchObject({
      currencyCode: 'USD',
      estimatedMonthlyCost: null,
      estimatedMonthlySavings: null,
      estimatedSavingsPercentage: null,
    });
    expect(Object.hasOwn(normalized, 'costCalculationLookbackPeriodInDays')).toBe(false);
    const impact = createAwsCostOptimizationHubFindingMatch(normalized).impact;
    expect(impact?.currentCost).toMatchObject({ confidence: 'unknown' });
    expect(impact?.currentCost).not.toHaveProperty('amount');
    expect(impact?.potentialSavings).toMatchObject({ confidence: 'unknown' });
    expect(impact?.potentialSavings).not.toHaveProperty('amount');
  });

  it('blocks detail financial enrichment when only the detail currency conflicts', async () => {
    const normalized = await loadFirstRecommendation(
      { estimatedMonthlyCost: undefined },
      sageMakerDetail({
        currencyCode: 'EUR',
        estimatedMonthlyCost: 80,
        estimatedMonthlySavings: 99,
        costCalculationLookbackPeriodInDays: 30,
      }),
    );
    expect(normalized).toMatchObject({
      currencyCode: 'USD',
      estimatedMonthlyCost: null,
      estimatedMonthlySavings: 50,
      lastRefreshTimestamp: '2026-09-03T00:00:00.000Z',
    });
    expect(Object.hasOwn(normalized, 'costCalculationLookbackPeriodInDays')).toBe(false);
  });

  it.each([
    ['recommendation ID', { recommendationId: 'other' }, {}],
    ['account', { accountId: '222222222222' }, {}],
    ['source', { source: 'ComputeOptimizer' }, {}],
    ['refresh timestamp', { lastRefreshTimestamp: new Date('2026-09-04T00:00:00.000Z') }, {}],
    ['invalid refresh timestamp', { lastRefreshTimestamp: new Date(Number.NaN) }, {}],
    ['action', { actionType: 'PurchaseReservedInstances' }, {}],
    ['resource type', { currentResourceType: 'Ec2InstanceSavingsPlans' }, {}],
    ['region', { region: 'us-east-1' }, { region: 'eu-west-1' }],
  ])('rejects the recommendation when the detail %s conflicts', async (_label, detailOverride, summaryOverride) => {
    const result = await loadRecommendations(
      { estimatedMonthlyCost: undefined, ...summaryOverride },
      sageMakerDetail({
        currencyCode: 'USD',
        estimatedMonthlyCost: 80,
        estimatedMonthlySavings: 99,
        costCalculationLookbackPeriodInDays: 30,
        ...detailOverride,
      }),
    );
    expect(result).toMatchObject({
      unavailable: true,
      resources: [],
      diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
    });
  });

  it('rejects the recommendation when the opaque resource IDs disagree', async () => {
    const result = await loadRecommendations(
      { resourceId: 'purchase-a', estimatedMonthlyCost: undefined },
      sageMakerDetail({
        resourceId: 'purchase-b',
        currencyCode: 'USD',
        estimatedMonthlyCost: 80,
        costCalculationLookbackPeriodInDays: 30,
      }),
    );
    expect(result).toMatchObject({
      unavailable: true,
      resources: [],
      diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
    });
  });

  it('fills detail financials when the opaque resource IDs match', async () => {
    const normalized = await loadFirstRecommendation(
      { resourceId: 'purchase-a', estimatedMonthlyCost: undefined },
      sageMakerDetail({
        resourceId: 'purchase-a',
        currencyCode: 'USD',
        estimatedMonthlyCost: 80,
        costCalculationLookbackPeriodInDays: 30,
      }),
    );
    expect(normalized).toMatchObject({
      estimatedMonthlyCost: 80,
      costCalculationLookbackPeriodInDays: 30,
    });
  });

  it('uses the detail cost window when the summary generation lookback is absent', async () => {
    const normalized = await loadFirstRecommendation({}, sageMakerDetail({ costCalculationLookbackPeriodInDays: 30 }));
    expect(normalized).toMatchObject({ costCalculationLookbackPeriodInDays: 30 });
    expect(Object.hasOwn(normalized, 'recommendationLookbackPeriodInDays')).toBe(false);
    const impact = createAwsCostOptimizationHubFindingMatch(normalized).impact;
    expect(impact?.window).toEqual({ lookbackDays: 30 });
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

  it.each([0, 1] as const)(
    'keeps the freshest duplicate summary for the same recommendation scope regardless of order %s',
    async (order) => {
      const older = recommendation('recommendation-1', {
        lastRefreshTimestamp: new Date('2026-09-03T00:00:00.000Z'),
      });
      const newer = recommendation('recommendation-1', {
        lastRefreshTimestamp: new Date('2026-09-04T00:00:00.000Z'),
      });
      const items = order === 0 ? [older, newer] : [newer, older];
      const send = vi.fn(async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) {
          return { items: [{ accountId, status: 'Active' }] };
        }

        if (command instanceof ListRecommendationsCommand) {
          return { items };
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
        expect.objectContaining({
          lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
          recommendationId: 'recommendation-1',
        }),
      ]);
      expect(send.mock.calls.filter(([command]) => command instanceof GetRecommendationCommand)).toHaveLength(1);
    },
  );

  it('does not conflate the same recommendation ID across different regions', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) {
        return { items: [{ accountId, status: 'Active' }] };
      }

      if (command instanceof ListRecommendationsCommand) {
        return {
          items: [
            recommendation('recommendation-1', { region: 'eu-west-1' }),
            recommendation('recommendation-1', { region: 'us-east-1' }),
          ],
        };
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
      expect.objectContaining({ recommendationId: 'recommendation-1', region: 'eu-west-1' }),
      expect.objectContaining({ recommendationId: 'recommendation-1', region: 'us-east-1' }),
    ]);
    expect(send.mock.calls.filter(([command]) => command instanceof GetRecommendationCommand)).toHaveLength(2);
  });

  it('requests recommendation details in deterministic scope order', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) {
        return { items: [{ accountId, status: 'Active' }] };
      }

      if (command instanceof ListRecommendationsCommand) {
        return {
          items: [recommendation('recommendation-z'), recommendation('recommendation-a')],
        };
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

    await hydrateAwsCostOptimizationHubSavingsPlansRecommendations([], {
      resolveAccountId: vi.fn().mockResolvedValue(accountId),
    });

    expect(
      send.mock.calls
        .map(([command]) => command)
        .filter((command): command is GetRecommendationCommand => command instanceof GetRecommendationCommand)
        .map((command) => command.input.recommendationId),
    ).toEqual(['recommendation-a', 'recommendation-z']);
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
