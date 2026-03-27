import { describe, expect, it } from 'vitest';
import { dynamoDbAutoscalingRangeFixedRule } from '../src/aws/dynamodb/autoscaling-range-fixed.js';
import type { AwsStaticDynamoDbAutoscaling, AwsStaticDynamoDbTable } from '../src/index.js';
import { StaticResourceBag } from '../src/index.js';

const createTable = (overrides: Partial<AwsStaticDynamoDbTable> = {}): AwsStaticDynamoDbTable => ({
  billingMode: 'PROVISIONED',
  location: {
    path: 'main.tf',
    line: 1,
    column: 1,
  },
  resourceId: 'aws_dynamodb_table.orders',
  tableName: 'orders',
  ...overrides,
});

const createAutoscaling = (overrides: Partial<AwsStaticDynamoDbAutoscaling> = {}): AwsStaticDynamoDbAutoscaling => ({
  hasReadTarget: true,
  hasWriteTarget: true,
  readMaxCapacity: 10,
  readMinCapacity: 10,
  tableName: 'orders',
  writeMaxCapacity: 100,
  writeMinCapacity: 5,
  ...overrides,
});

describe('dynamoDbAutoscalingRangeFixedRule', () => {
  it('flags provisioned tables whose autoscaling range is fixed', () => {
    const finding = dynamoDbAutoscalingRangeFixedRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-dynamodb-autoscaling': [createAutoscaling()],
        'aws-dynamodb-tables': [createTable()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-DYNAMODB-4',
      service: 'dynamodb',
      source: 'iac',
      message: 'Provisioned DynamoDB autoscaling should allow capacity to change.',
      findings: [
        {
          location: {
            path: 'main.tf',
            line: 1,
            column: 1,
          },
          resourceId: 'aws_dynamodb_table.orders',
        },
      ],
    });
  });

  it('skips pay-per-request tables or tables with a real autoscaling range', () => {
    const finding = dynamoDbAutoscalingRangeFixedRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-dynamodb-autoscaling': [createAutoscaling({ readMaxCapacity: 20 })],
        'aws-dynamodb-tables': [
          createTable(),
          createTable({ resourceId: 'OrdersOnDemand', billingMode: 'PAY_PER_REQUEST', tableName: 'ondemand' }),
        ],
      }),
    });

    expect(finding).toBeNull();
  });
});
