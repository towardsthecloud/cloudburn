import { describe, expect, it } from 'vitest';
import { costExplorerFullMonthCostChangesRule } from '../src/aws/costexplorer/full-month-cost-changes.js';
import type { AwsCostUsage } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createCostUsage = (overrides: Partial<AwsCostUsage> = {}): AwsCostUsage => ({
  accountId: '123456789012',
  costIncrease: 15,
  costUnit: 'USD',
  currentMonthCost: 25,
  previousMonthCost: 10,
  serviceName: 'Amazon DynamoDB',
  serviceSlug: 'amazon-dynamodb',
  ...overrides,
});

describe('costExplorerFullMonthCostChangesRule', () => {
  it('flags services whose monthly cost increase exceeds the review threshold', () => {
    const finding = costExplorerFullMonthCostChangesRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cost-usage': [createCostUsage()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        resourceId: 'cost/amazon-dynamodb',
      },
    ]);
  });

  it('does not flag new services or small month-over-month changes', () => {
    const finding = costExplorerFullMonthCostChangesRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-cost-usage': [
          createCostUsage({ costIncrease: 5, currentMonthCost: 15 }),
          createCostUsage({
            serviceName: 'Amazon CloudFront',
            serviceSlug: 'amazon-cloudfront',
            previousMonthCost: 0,
            currentMonthCost: 25,
            costIncrease: 25,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
