import {
  GetRecommendationCommand,
  ListEnrollmentStatusesCommand,
  ListRecommendationsCommand,
} from '@aws-sdk/client-cost-optimization-hub';
import { expect, it, vi } from 'vitest';
import { createCostOptimizationHubClient } from '../../src/providers/aws/client.js';
import { hydrateAwsCostOptimizationHubGravitonRecommendations } from '../../src/providers/aws/resources/cost-optimization-hub.js';

vi.mock('../../src/providers/aws/client.js', () => ({ createCostOptimizationHubClient: vi.fn() }));

it.each([{ instance: { dbInstanceClass: 42 } }, { instance: { dbInstanceClass: '   ' } }, {}])(
  'rejects malformed RDS configuration %j',
  async (configuration) => {
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
  },
);

it.each([
  ['Ec2Instance', 'ec2Instance', 'High', 'inferred_compatible'],
  ['Ec2Instance', 'ec2Instance', 'VeryHigh', 'unclassified'],
  ['Ec2AutoScalingGroup', 'ec2AutoScalingGroup', 'High', 'inferred_compatible'],
  ['Ec2AutoScalingGroup', 'ec2AutoScalingGroup', 'VeryHigh', 'unclassified'],
  ['RdsDbInstance', 'rdsDbInstance', 'Medium', 'not_applicable'],
  ['Ec2AutoScalingGroup', 'mixed', 'High', 'inferred_compatible'],
])(
  'preserves %s configurations (%s) and maps %s effort to %s',
  async (resourceType, detailKey, effort, compatibility) => {
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
                instance:
                  resourceType === 'RdsDbInstance' ? { dbInstanceClass: 'db.m6i.large' } : { type: 'm6i.large' },
              },
            },
          },
          recommendedResourceDetails: {
            [detailKey]: {
              configuration: {
                instance:
                  resourceType === 'RdsDbInstance' ? { dbInstanceClass: 'db.m7g.large' } : { type: 'm7g.large' },
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
  },
);
