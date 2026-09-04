import {
  GetRecommendationCommand,
  ListEnrollmentStatusesCommand,
  ListRecommendationsCommand,
} from '@aws-sdk/client-cost-optimization-hub';
import { expect, it, vi } from 'vitest';
import { createCostOptimizationHubClient } from '../../src/providers/aws/client.js';
import {
  hydrateAwsCostOptimizationHubGravitonRecommendations,
  hydrateAwsCostOptimizationHubReservationRecommendations,
} from '../../src/providers/aws/resources/cost-optimization-hub.js';

vi.mock('../../src/providers/aws/client.js', () => ({ createCostOptimizationHubClient: vi.fn() }));

it.each(['clean', 'unenrolled', 'denied', 'malformed'])('preserves the %s loader state', async (state) => {
  const send = vi.fn(async (command: unknown) => {
    if (state === 'denied') throw Object.assign(new Error('Denied'), { name: 'AccessDeniedException' });
    if (command instanceof ListEnrollmentStatusesCommand)
      return { items: state === 'unenrolled' ? [] : [{ accountId: '123456789012', status: 'Active' }] };
    if (command instanceof ListRecommendationsCommand) return { items: state === 'malformed' ? [{}] : [] };
    throw new Error('Unexpected detail call');
  });
  vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
  const result = await hydrateAwsCostOptimizationHubGravitonRecommendations([], {
    resolveAccountId: async () => '123456789012',
  });
  if (state === 'clean') expect(result).toEqual([]);
  else
    expect(result).toMatchObject({
      resources: [],
      unavailable: true,
      diagnostics: [
        expect.objectContaining({
          code: {
            unenrolled: 'CostOptimizationHubNotEnrolled',
            denied: 'AccessDeniedException',
            malformed: 'CostOptimizationHubRecommendationIncomplete',
          }[state],
        }),
      ],
    });
});

it.each([
  { instance: { dbInstanceClass: 42 } },
  { instance: { dbInstanceClass: '   ' } },
  {},
])('rejects malformed RDS configuration %j', async (configuration) => {
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof ListEnrollmentStatusesCommand)
      return { items: [{ accountId: '123456789012', status: 'Active' }] };
    if (command instanceof ListRecommendationsCommand)
      return {
        items: [
          {
            accountId: '123456789012',
            actionType: 'MigrateToGraviton',
            currentResourceType: 'RdsDbInstance',
            currencyCode: 'USD',
            estimatedMonthlyCost: 100,
            estimatedMonthlySavings: 20,
            estimatedSavingsPercentage: 20,
            implementationEffort: 'Medium',
            lastRefreshTimestamp: new Date('2026-09-04'),
            recommendationId: 'rec-1',
            region: 'eu-west-1',
            resourceId: 'db-example',
            resourceArn: 'arn:aws:rds:eu-west-1:123456789012:db:db-example',
            restartNeeded: true,
            rollbackPossible: true,
            source: 'ComputeOptimizer',
          },
        ],
      };
    if (command instanceof GetRecommendationCommand)
      return {
        currentResourceDetails: { rdsDbInstance: { configuration } },
        recommendedResourceDetails: {
          rdsDbInstance: { configuration: { instance: { dbInstanceClass: 'db.m7g.large' } } },
        },
      };
    throw new Error('Unexpected command');
  });
  vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
  await expect(
    hydrateAwsCostOptimizationHubGravitonRecommendations([], { resolveAccountId: async () => '123456789012' }),
  ).resolves.toMatchObject({
    unavailable: true,
    resources: [],
    diagnostics: [expect.objectContaining({ code: 'CostOptimizationHubRecommendationIncomplete' })],
  });
});

it('shares enrollment with reservation loading and deduplicates paginated Graviton recommendations', async () => {
  const item = {
    accountId: '123456789012',
    actionType: 'MigrateToGraviton',
    currentResourceType: 'Ec2Instance',
    currencyCode: 'USD',
    estimatedMonthlyCost: 100,
    estimatedMonthlySavings: 20,
    estimatedSavingsPercentage: 20,
    implementationEffort: 'High',
    lastRefreshTimestamp: new Date('2026-09-04'),
    recommendationId: 'rec-1',
    region: 'eu-west-1',
    resourceId: 'i-example',
    resourceArn: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-example',
    restartNeeded: true,
    rollbackPossible: true,
    source: 'ComputeOptimizer',
  };
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof ListEnrollmentStatusesCommand)
      return { items: [{ accountId: item.accountId, status: 'Active' }] };
    if (command instanceof ListRecommendationsCommand) {
      if (command.input.filter?.actionTypes?.[0] === 'PurchaseReservedInstances') return { items: [] };
      expect(command.input.filter).toEqual({
        accountIds: [item.accountId],
        actionTypes: ['MigrateToGraviton'],
        resourceTypes: ['Ec2Instance', 'Ec2AutoScalingGroup', 'RdsDbInstance'],
      });
      expect(command.input.includeAllRecommendations).toBe(false);
      return { items: [item], ...(command.input.nextToken ? {} : { nextToken: 'next' }) };
    }
    if (command instanceof GetRecommendationCommand)
      return {
        currentResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm6i.large' } } } },
        recommendedResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7g.large' } } } },
      };
    throw new Error('Unexpected command');
  });
  vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
  const context = { resolveAccountId: async () => item.accountId };
  const [result] = await Promise.all([
    hydrateAwsCostOptimizationHubGravitonRecommendations([], context),
    hydrateAwsCostOptimizationHubReservationRecommendations([], context),
  ]);
  expect(result).toHaveLength(1);
  expect(send.mock.calls.filter(([command]) => command instanceof GetRecommendationCommand)).toHaveLength(1);
  expect(send.mock.calls.filter(([command]) => command instanceof ListEnrollmentStatusesCommand)).toHaveLength(1);
});

it.each([
  ['Ec2Instance', 'ec2Instance', 'High', 'inferred_compatible'],
  ['Ec2Instance', 'ec2Instance', 'VeryHigh', 'unclassified'],
  ['Ec2AutoScalingGroup', 'ec2AutoScalingGroup', 'High', 'inferred_compatible'],
  ['Ec2AutoScalingGroup', 'ec2AutoScalingGroup', 'VeryHigh', 'unclassified'],
  ['RdsDbInstance', 'rdsDbInstance', 'Medium', 'not_applicable'],
  ['Ec2AutoScalingGroup', 'mixed', 'High', 'inferred_compatible'],
])('preserves %s configurations (%s) and maps %s effort to %s', async (resourceType, detailKey, effort, compatibility) => {
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof ListEnrollmentStatusesCommand)
      return { items: [{ accountId: '123456789012', status: 'Active' }] };
    if (command instanceof ListRecommendationsCommand)
      return {
        items: [
          {
            accountId: '123456789012',
            actionType: 'MigrateToGraviton',
            currentResourceType: resourceType,
            currencyCode: 'USD',
            estimatedMonthlyCost: 100,
            estimatedMonthlySavings: 20,
            estimatedSavingsPercentage: 20,
            implementationEffort: effort,
            lastRefreshTimestamp: new Date('2026-09-04'),
            recommendationId: 'rec-1',
            region: 'eu-west-1',
            resourceId: 'i-example',
            resourceArn: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-example',
            restartNeeded: true,
            rollbackPossible: true,
            source: 'ComputeOptimizer',
          },
        ],
      };
    if (command instanceof GetRecommendationCommand)
      if (detailKey === 'mixed')
        return {
          currentResourceDetails: {
            ec2AutoScalingGroup: {
              configuration: {
                type: 'MixedInstanceTypes',
                allocationStrategy: 'lowest-price',
                mixedInstances: [{ type: 'm6i.large' }, { type: 'm5.large' }],
              },
            },
          },
          recommendedResourceDetails: {
            ec2AutoScalingGroup: {
              configuration: {
                type: 'MixedInstanceTypes',
                allocationStrategy: 'lowest-price',
                mixedInstances: [{ type: 'm7g.large' }],
              },
            },
          },
        };
    if (command instanceof GetRecommendationCommand)
      return {
        currentResourceDetails: {
          [detailKey]: {
            configuration: {
              instance: resourceType === 'RdsDbInstance' ? { dbInstanceClass: 'db.m6i.large' } : { type: 'm6i.large' },
            },
          },
        },
        recommendedResourceDetails: {
          [detailKey]: {
            configuration: {
              instance: resourceType === 'RdsDbInstance' ? { dbInstanceClass: 'db.m7g.large' } : { type: 'm7g.large' },
            },
          },
        },
      };
    throw new Error('Unexpected command');
  });
  vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
  await expect(
    hydrateAwsCostOptimizationHubGravitonRecommendations([], { resolveAccountId: async () => '123456789012' }),
  ).resolves.toEqual([
    expect.objectContaining({
      currentConfiguration:
        detailKey === 'mixed'
          ? {
              mixedInstanceTypes: ['m6i.large', 'm5.large'],
              type: 'MixedInstanceTypes',
              allocationStrategy: 'lowest-price',
            }
          : resourceType === 'RdsDbInstance'
            ? { dbInstanceClass: 'db.m6i.large' }
            : { instanceType: 'm6i.large' },
      recommendedConfiguration:
        detailKey === 'mixed'
          ? { mixedInstanceTypes: ['m7g.large'], type: 'MixedInstanceTypes', allocationStrategy: 'lowest-price' }
          : resourceType === 'RdsDbInstance'
            ? { dbInstanceClass: 'db.m7g.large' }
            : { instanceType: 'm7g.large' },
      workloadCompatibility: compatibility,
    }),
  ]);
});
