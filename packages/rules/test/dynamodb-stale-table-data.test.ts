import { describe, expect, it } from 'vitest';
import { dynamoDbStaleTableDataRule } from '../src/aws/dynamodb/stale-table-data.js';
import type { AwsDynamoDbTableUtilization } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createUtilization = (overrides: Partial<AwsDynamoDbTableUtilization> = {}): AwsDynamoDbTableUtilization => ({
  accountId: '123456789012',
  region: 'us-east-1',
  tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
  tableName: 'orders',
  totalConsumedReadCapacityUnitsLast30Days: 0,
  totalConsumedWriteCapacityUnitsLast30Days: 0,
  totalConsumedWriteCapacityUnitsLast90Days: 0,
  ...overrides,
});

describe('dynamoDbStaleTableDataRule', () => {
  it('flags tables with no consumed write capacity over a complete 90-day window', () => {
    const finding = dynamoDbStaleTableDataRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-dynamodb-table-utilization': [createUtilization()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
      },
    ]);
  });

  it('skips tables with write activity or incomplete 90-day evidence', () => {
    const finding = dynamoDbStaleTableDataRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-dynamodb-table-utilization': [
          createUtilization({ totalConsumedWriteCapacityUnitsLast90Days: 1 }),
          createUtilization({
            tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/audit',
            totalConsumedWriteCapacityUnitsLast90Days: null,
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
