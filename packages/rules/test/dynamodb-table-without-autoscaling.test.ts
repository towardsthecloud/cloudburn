import { describe, expect, it } from 'vitest';
import { dynamoDbTableWithoutAutoscalingRule } from '../src/aws/dynamodb/table-without-autoscaling.js';
import type { AwsDynamoDbAutoscaling, AwsDynamoDbTable } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createTable = (overrides: Partial<AwsDynamoDbTable> = {}): AwsDynamoDbTable => ({
  accountId: '123456789012',
  billingMode: 'PROVISIONED',
  latestStreamLabel: '2026-03-01T00:00:00.000',
  region: 'us-east-1',
  tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
  tableName: 'orders',
  ...overrides,
});

const createAutoscaling = (overrides: Partial<AwsDynamoDbAutoscaling> = {}): AwsDynamoDbAutoscaling => ({
  accountId: '123456789012',
  hasReadTarget: true,
  hasWriteTarget: true,
  region: 'us-east-1',
  tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
  tableName: 'orders',
  ...overrides,
});

describe('dynamoDbTableWithoutAutoscalingRule', () => {
  it('flags provisioned tables with no table-level autoscaling targets', () => {
    const finding = dynamoDbTableWithoutAutoscalingRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-dynamodb-autoscaling': [createAutoscaling({ hasReadTarget: false, hasWriteTarget: false })],
        'aws-dynamodb-tables': [createTable()],
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

  it('skips tables when read and write autoscaling both exist', () => {
    const finding = dynamoDbTableWithoutAutoscalingRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-dynamodb-autoscaling': [createAutoscaling()],
        'aws-dynamodb-tables': [createTable()],
      }),
    });

    expect(finding).toBeNull();
  });
});
