import {
  GetRecommendationCommand,
  ListEnrollmentStatusesCommand,
  ListRecommendationsCommand,
  type Recommendation,
} from '@aws-sdk/client-cost-optimization-hub';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCostOptimizationHubClient } from '../../src/providers/aws/client.js';
import {
  hydrateAwsCostOptimizationHubReservationRecommendations,
  hydrateAwsCostOptimizationHubRightsizingRecommendations,
  hydrateAwsCostOptimizationHubSavingsPlansRecommendations,
} from '../../src/providers/aws/resources/cost-optimization-hub.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createCostOptimizationHubClient: vi.fn(),
}));

const mockedCreateCostOptimizationHubClient = vi.mocked(createCostOptimizationHubClient);
const accountId = '123456789012';
const reservationTypes = [
  'Ec2ReservedInstances',
  'RdsReservedInstances',
  'OpenSearchReservedInstances',
  'RedshiftReservedInstances',
  'ElastiCacheReservedInstances',
  'MemoryDbReservedInstances',
  'DynamoDbReservedCapacity',
] as const;

const recommendation = (recommendationId: string, overrides: Partial<Recommendation> = {}): Recommendation => ({
  accountId,
  actionType: 'PurchaseReservedInstances',
  currencyCode: 'USD',
  currentResourceType: 'Ec2ReservedInstances',
  estimatedMonthlyCost: 200,
  estimatedMonthlySavings: 50,
  estimatedSavingsPercentage: 25,
  implementationEffort: 'VeryLow',
  lastRefreshTimestamp: new Date('2026-09-04T00:00:00.000Z'),
  recommendationId,
  region: 'eu-west-1',
  resourceArn: `arn:aws:example:eu-west-1:${accountId}:resource/${recommendationId}`,
  resourceId: `resource-${recommendationId}`,
  restartNeeded: false,
  rollbackPossible: true,
  source: 'CostExplorer',
  ...overrides,
});

const commonConfiguration = {
  accountScope: 'LINKED',
  monthlyRecurringCost: '25.5',
  paymentOption: 'NoUpfront',
  reservedInstancesRegion: 'eu-west-1',
  service: 'ExampleService',
  term: 'OneYear',
  upfrontCost: '0',
};

const reservationDetails = {
  Ec2ReservedInstances: {
    ec2ReservedInstances: {
      configuration: {
        ...commonConfiguration,
        currentGeneration: 'Yes',
        instanceFamily: 'm7i',
        instanceType: 'm7i.large',
        normalizedUnitsToPurchase: '4',
        numberOfInstancesToPurchase: '2',
        offeringClass: 'standard',
        platform: 'Linux/UNIX',
        sizeFlexEligible: true,
        tenancy: 'default',
      },
    },
  },
  RdsReservedInstances: {
    rdsReservedInstances: {
      configuration: {
        ...commonConfiguration,
        currentGeneration: 'Yes',
        databaseEdition: 'Enterprise',
        databaseEngine: 'postgres',
        deploymentOption: 'Multi-AZ',
        instanceFamily: 'db.r7g',
        instanceType: 'db.r7g.large',
        licenseModel: 'license-included',
        normalizedUnitsToPurchase: '2',
        numberOfInstancesToPurchase: '1',
        sizeFlexEligible: false,
      },
    },
  },
  OpenSearchReservedInstances: {
    openSearchReservedInstances: {
      configuration: {
        ...commonConfiguration,
        currentGeneration: 'Yes',
        instanceType: 'r7g.large.search',
        normalizedUnitsToPurchase: '8',
        numberOfInstancesToPurchase: '2',
        sizeFlexEligible: true,
      },
    },
  },
  RedshiftReservedInstances: {
    redshiftReservedInstances: {
      configuration: {
        ...commonConfiguration,
        currentGeneration: 'Yes',
        instanceFamily: 'ra3',
        instanceType: 'ra3.xlplus',
        normalizedUnitsToPurchase: '4',
        numberOfInstancesToPurchase: '2',
        sizeFlexEligible: true,
      },
    },
  },
  ElastiCacheReservedInstances: {
    elastiCacheReservedInstances: {
      configuration: {
        ...commonConfiguration,
        currentGeneration: 'Yes',
        instanceFamily: 'cache.r7g',
        instanceType: 'cache.r7g.large',
        normalizedUnitsToPurchase: '2',
        numberOfInstancesToPurchase: '1',
        sizeFlexEligible: true,
      },
    },
  },
  MemoryDbReservedInstances: {
    memoryDbReservedInstances: {
      configuration: {
        ...commonConfiguration,
        currentGeneration: 'Yes',
        instanceFamily: 'db.r7g',
        instanceType: 'db.r7g.large',
        normalizedUnitsToPurchase: '2',
        numberOfInstancesToPurchase: '1',
        sizeFlexEligible: true,
      },
    },
  },
  DynamoDbReservedCapacity: {
    dynamoDbReservedCapacity: {
      configuration: {
        ...commonConfiguration,
        capacityUnits: 'ReadCapacityUnits',
        numberOfCapacityUnitsToPurchase: '100',
      },
    },
  },
} as const;

describe('hydrateAwsCostOptimizationHubReservationRecommendations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('normalizes common evidence and preserves all seven resource-specific configurations', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) {
        return { items: [{ accountId, status: 'Active' }] };
      }

      if (command instanceof ListRecommendationsCommand) {
        return {
          items: reservationTypes.map((currentResourceType, index) =>
            recommendation(`recommendation-${index + 1}`, {
              currentResourceType,
              ...(index === 0 ? { region: undefined } : {}),
            }),
          ),
        };
      }

      if (command instanceof GetRecommendationCommand) {
        const index = Number(command.input.recommendationId?.split('-').at(-1)) - 1;
        const reservationType = reservationTypes[index];
        return { recommendedResourceDetails: reservationType ? reservationDetails[reservationType] : undefined };
      }

      throw new Error(`Unexpected command: ${String(command)}`);
    });
    mockedCreateCostOptimizationHubClient.mockReturnValue({ send } as never);

    const result = await hydrateAwsCostOptimizationHubReservationRecommendations([], {
      resolveAccountId: vi.fn().mockResolvedValue(accountId),
    });

    expect(result).toEqual([
      expect.objectContaining({
        accountId,
        actionType: 'PurchaseReservedInstances',
        configuration: {
          ...commonConfiguration,
          currentGeneration: 'Yes',
          instanceFamily: 'm7i',
          instanceType: 'm7i.large',
          monthlyRecurringCost: 25.5,
          normalizedUnitsToPurchase: 4,
          numberOfInstancesToPurchase: 2,
          offeringClass: 'standard',
          platform: 'Linux/UNIX',
          sizeFlexEligible: true,
          tenancy: 'default',
          upfrontCost: 0,
        },
        currencyCode: 'USD',
        estimatedMonthlyCost: 200,
        estimatedMonthlySavings: 50,
        estimatedSavingsPercentage: 25,
        implementationEffort: 'VeryLow',
        lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
        recommendationId: 'recommendation-1',
        recommendationSource: 'CostExplorer',
        region: 'eu-west-1',
        reservationType: 'Ec2ReservedInstances',
        resourceId: 'resource-recommendation-1',
        restartNeeded: false,
        rollbackPossible: true,
      }),
      expect.objectContaining({
        configuration: expect.objectContaining({
          databaseEdition: 'Enterprise',
          databaseEngine: 'postgres',
          deploymentOption: 'Multi-AZ',
          licenseModel: 'license-included',
        }),
        reservationType: 'RdsReservedInstances',
      }),
      expect.objectContaining({
        configuration: expect.objectContaining({ instanceType: 'r7g.large.search' }),
        reservationType: 'OpenSearchReservedInstances',
      }),
      expect.objectContaining({
        configuration: expect.objectContaining({ instanceFamily: 'ra3' }),
        reservationType: 'RedshiftReservedInstances',
      }),
      expect.objectContaining({
        configuration: expect.objectContaining({ instanceFamily: 'cache.r7g' }),
        reservationType: 'ElastiCacheReservedInstances',
      }),
      expect.objectContaining({
        configuration: expect.objectContaining({ instanceFamily: 'db.r7g' }),
        reservationType: 'MemoryDbReservedInstances',
      }),
      expect.objectContaining({
        configuration: expect.objectContaining({
          capacityUnits: 'ReadCapacityUnits',
          numberOfCapacityUnitsToPurchase: 100,
        }),
        reservationType: 'DynamoDbReservedCapacity',
      }),
    ]);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          filter: {
            accountIds: [accountId],
            actionTypes: ['PurchaseReservedInstances'],
            resourceTypes: [...reservationTypes],
          },
          includeAllRecommendations: false,
          maxResults: 1000,
          nextToken: undefined,
        },
      }),
    );
  });

  it('returns a clean empty dataset for an enrolled account without matching recommendations', async () => {
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
      hydrateAwsCostOptimizationHubReservationRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual([]);
  });

  it('paginates and loads each recommendation ID once', async () => {
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
        return { recommendedResourceDetails: reservationDetails.Ec2ReservedInstances };
      }
      throw new Error(`Unexpected command: ${String(command)}`);
    });
    mockedCreateCostOptimizationHubClient.mockReturnValue({ send } as never);

    const result = await hydrateAwsCostOptimizationHubReservationRecommendations([], {
      resolveAccountId: vi.fn().mockResolvedValue(accountId),
    });

    expect(result).toEqual([
      expect.objectContaining({ recommendationId: 'recommendation-a' }),
      expect.objectContaining({ recommendationId: 'recommendation-z' }),
    ]);
    expect(send.mock.calls.filter(([command]) => command instanceof GetRecommendationCommand)).toHaveLength(2);
  });

  it('returns valid recommendations with an unavailable diagnostic when another record is malformed', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) {
        return { items: [{ accountId, status: 'Active' }] };
      }
      if (command instanceof ListRecommendationsCommand) {
        return {
          items: [
            recommendation('recommendation-good'),
            recommendation('recommendation-bad', { estimatedMonthlyCost: undefined }),
          ],
        };
      }
      if (command instanceof GetRecommendationCommand) {
        return { recommendedResourceDetails: reservationDetails.Ec2ReservedInstances };
      }
      throw new Error(`Unexpected command: ${String(command)}`);
    });
    mockedCreateCostOptimizationHubClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsCostOptimizationHubReservationRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'CostOptimizationHubRecommendationIncomplete',
          status: 'skipped',
        }),
      ],
      resources: [expect.objectContaining({ recommendationId: 'recommendation-good' })],
      unavailable: true,
    });
  });

  it('counts recommendation summaries without an ID as incomplete evidence', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) {
        return { items: [{ accountId, status: 'Active' }] };
      }
      if (command instanceof ListRecommendationsCommand) {
        return { items: [recommendation('discarded', { recommendationId: undefined })] };
      }
      throw new Error(`Unexpected command: ${String(command)}`);
    });
    mockedCreateCostOptimizationHubClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsCostOptimizationHubReservationRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'CostOptimizationHubRecommendationIncomplete',
          details:
            '1 reservation purchase recommendation lacked required cost, refresh, source, or typed purchase configuration data.',
          status: 'skipped',
        }),
      ],
      resources: [],
      unavailable: true,
    });
    expect(send.mock.calls.some(([command]) => command instanceof GetRecommendationCommand)).toBe(false);
  });

  it('reports unenrolled and access-denied evidence as unavailable', async () => {
    mockedCreateCostOptimizationHubClient.mockReturnValueOnce({
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) {
          return { items: [{ accountId, status: 'Inactive' }] };
        }
        throw new Error(`Unexpected command: ${String(command)}`);
      }),
    } as never);

    await expect(
      hydrateAwsCostOptimizationHubReservationRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'CostOptimizationHubNotEnrolled',
          message:
            'Skipped reservation purchase recommendations because this account is not enrolled in AWS Cost Optimization Hub.',
          status: 'skipped',
        }),
      ],
      resources: [],
      unavailable: true,
    });

    mockedCreateCostOptimizationHubClient.mockReturnValueOnce({
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) {
          throw Object.assign(new Error('Access denied'), { name: 'AccessDeniedException' });
        }
        throw new Error(`Unexpected command: ${String(command)}`);
      }),
    } as never);

    await expect(
      hydrateAwsCostOptimizationHubReservationRecommendations([], {
        resolveAccountId: vi.fn().mockResolvedValue(accountId),
      }),
    ).resolves.toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'AccessDeniedException',
          message:
            'Skipped reservation purchase recommendations because access to AWS Cost Optimization Hub is denied by AWS permissions.',
          status: 'access_denied',
        }),
      ],
      resources: [],
      unavailable: true,
    });
  });

  it('bounds concurrent recommendation detail requests', async () => {
    let inFlight = 0;
    let maximumInFlight = 0;
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) {
        return { items: [{ accountId, status: 'Active' }] };
      }
      if (command instanceof ListRecommendationsCommand) {
        return { items: Array.from({ length: 24 }, (_, index) => recommendation(`recommendation-${index}`)) };
      }
      if (command instanceof GetRecommendationCommand) {
        inFlight += 1;
        maximumInFlight = Math.max(maximumInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return { recommendedResourceDetails: reservationDetails.Ec2ReservedInstances };
      }
      throw new Error(`Unexpected command: ${String(command)}`);
    });
    mockedCreateCostOptimizationHubClient.mockReturnValue({ send } as never);

    await hydrateAwsCostOptimizationHubReservationRecommendations([], {
      resolveAccountId: vi.fn().mockResolvedValue(accountId),
    });

    expect(maximumInFlight).toBe(10);
  });

  it('shares enrollment state when both Cost Optimization Hub categories load in one discovery run', async () => {
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
    const context = { resolveAccountId: vi.fn().mockResolvedValue(accountId) };

    await Promise.all([
      hydrateAwsCostOptimizationHubSavingsPlansRecommendations([], context),
      hydrateAwsCostOptimizationHubReservationRecommendations([], context),
      hydrateAwsCostOptimizationHubRightsizingRecommendations([], context),
    ]);

    expect(mockedCreateCostOptimizationHubClient).toHaveBeenCalledTimes(1);
    expect(send.mock.calls.filter(([command]) => command instanceof ListEnrollmentStatusesCommand)).toHaveLength(1);
  });
});
