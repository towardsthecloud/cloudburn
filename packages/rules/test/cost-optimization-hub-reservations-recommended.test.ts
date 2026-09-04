import { describe, expect, it } from 'vitest';
import { costOptimizationHubReservationsRecommendedRule } from '../src/aws/costoptimizationhub/reservations-recommended.js';
import type { AwsCostOptimizationHubReservationRecommendation } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createRecommendation = (
  overrides: Partial<AwsCostOptimizationHubReservationRecommendation> = {},
): AwsCostOptimizationHubReservationRecommendation =>
  ({
    accountId: '123456789012',
    actionType: 'PurchaseReservedInstances',
    configuration: {
      accountScope: 'LINKED',
      instanceType: 'm7i.large',
      monthlyRecurringCost: 25,
      numberOfInstancesToPurchase: 2,
      paymentOption: 'NoUpfront',
      reservedInstancesRegion: 'eu-west-1',
      service: 'AmazonEC2',
      term: 'OneYear',
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
    resourceArn: 'arn:aws:ec2:eu-west-1:123456789012:instance/i-123',
    resourceId: 'i-123',
    restartNeeded: false,
    rollbackPossible: false,
    ...overrides,
  }) as AwsCostOptimizationHubReservationRecommendation;

const evaluate = (recommendations: AwsCostOptimizationHubReservationRecommendation[]) =>
  costOptimizationHubReservationsRecommendedRule.evaluateLive?.({
    catalog: {
      indexType: 'LOCAL',
      resources: [],
      searchRegion: 'eu-west-1',
    },
    resources: new LiveResourceBag({
      'aws-cost-optimization-hub-reservation-recommendations': recommendations,
    }),
  });

describe('CLDBRN-AWS-COSTOPTIMIZATIONHUB-2', () => {
  it('reports every reservation purchase resource type once using AWS resource identity', () => {
    const resourceTypes = [
      'Ec2ReservedInstances',
      'RdsReservedInstances',
      'OpenSearchReservedInstances',
      'RedshiftReservedInstances',
      'ElastiCacheReservedInstances',
      'MemoryDbReservedInstances',
      'DynamoDbReservedCapacity',
    ] as const;
    const resourceNamespaceByType = {
      DynamoDbReservedCapacity: 'dynamodb:table',
      Ec2ReservedInstances: 'ec2:instance',
      ElastiCacheReservedInstances: 'elasticache:cluster',
      MemoryDbReservedInstances: 'memorydb:cluster',
      OpenSearchReservedInstances: 'opensearch:domain',
      RdsReservedInstances: 'rds:db',
      RedshiftReservedInstances: 'redshift:cluster',
    } as const;
    const recommendations = resourceTypes.map((reservationType, index) =>
      createRecommendation({
        recommendationId: `recommendation-${index + 1}`,
        reservationType,
        resourceId: `resource-${index + 1}`,
      }),
    );

    expect(evaluate([...recommendations, recommendations[0]])).toEqual({
      findings: resourceTypes.map((reservationType, index) => ({
        accountId: '123456789012',
        region: 'eu-west-1',
        resourceId: `resource-${index + 1}`,
        resourceType: resourceNamespaceByType[reservationType],
      })),
      message: 'Reservation-eligible usage should use reserved capacity when AWS recommends a purchase.',
      ruleId: 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-2',
      service: 'costoptimizationhub',
      severity: 'medium',
      source: 'discovery',
    });
  });

  it('falls back to recommendation identity and returns no finding for an empty dataset', () => {
    expect(
      evaluate([createRecommendation({ region: undefined, resourceArn: undefined, resourceId: undefined })]),
    ).toEqual(
      expect.objectContaining({
        findings: [
          {
            accountId: '123456789012',
            region: 'eu-west-1',
            resourceId: 'recommendation-1',
            resourceType: 'ec2:instance',
          },
        ],
      }),
    );
    expect(evaluate([])).toBeNull();
  });
});
