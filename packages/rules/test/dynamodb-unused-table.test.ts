import { describe, expect, it } from 'vitest';
import { dynamoDbUnusedTableRule } from '../src/aws/dynamodb/unused-table.js';
import type { AwsDynamoDbTable, AwsDynamoDbTableUtilization } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createTable = (overrides: Partial<AwsDynamoDbTable> = {}): AwsDynamoDbTable => ({
  accountId: '123456789012',
  billingMode: 'PROVISIONED',
  region: 'us-east-1',
  tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
  tableName: 'orders',
  tableStatus: 'ACTIVE',
  ...overrides,
});

const createUtilization = (overrides: Partial<AwsDynamoDbTableUtilization> = {}): AwsDynamoDbTableUtilization => ({
  accountId: '123456789012',
  region: 'us-east-1',
  tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
  tableName: 'orders',
  totalConsumedReadCapacityUnitsLast30Days: 0,
  totalConsumedWriteCapacityUnitsLast30Days: 0,
  ...overrides,
});

describe('dynamoDbUnusedTableRule', () => {
  it('flags provisioned tables with zero consumed read and write units over 30 days', () => {
    const finding = dynamoDbUnusedTableRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-dynamodb-table-utilization': [createUtilization()],
        'aws-dynamodb-tables': [createTable()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-DYNAMODB-3',
      service: 'dynamodb',
      source: 'discovery',
      message: 'Provisioned DynamoDB tables should not remain unused for 30 days.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
        },
      ],
    });
  });

  it('skips on-demand tables and active provisioned tables', () => {
    const finding = dynamoDbUnusedTableRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-dynamodb-table-utilization': [
          createUtilization({ totalConsumedReadCapacityUnitsLast30Days: 10 }),
          createUtilization({
            tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/audit',
            tableName: 'audit',
          }),
        ],
        'aws-dynamodb-tables': [
          createTable(),
          createTable({
            billingMode: 'PAY_PER_REQUEST',
            tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/audit',
            tableName: 'audit',
          }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips tables without complete metric coverage', () => {
    const finding = dynamoDbUnusedTableRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-dynamodb-table-utilization': [
          createUtilization({
            totalConsumedReadCapacityUnitsLast30Days: null,
            totalConsumedWriteCapacityUnitsLast30Days: null,
          }),
        ],
        'aws-dynamodb-tables': [createTable()],
      }),
    });

    expect(finding).toBeNull();
  });
});
