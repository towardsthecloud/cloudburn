import { describe, expect, it } from 'vitest';
import { dynamoDbTableWithoutAutoscalingRule } from '../src/aws/dynamodb/table-without-autoscaling.js';
import type {
  AwsDynamoDbAutoscaling,
  AwsDynamoDbTable,
  AwsStaticDynamoDbAutoscaling,
  AwsStaticDynamoDbTable,
} from '../src/index.js';
import { LiveResourceBag, StaticResourceBag } from '../src/index.js';

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

const createStaticTable = (overrides: Partial<AwsStaticDynamoDbTable> = {}): AwsStaticDynamoDbTable => ({
  resourceId: 'aws_dynamodb_table.orders',
  tableName: 'orders',
  billingMode: 'PROVISIONED',
  ...overrides,
});

const createStaticAutoscaling = (
  overrides: Partial<AwsStaticDynamoDbAutoscaling> = {},
): AwsStaticDynamoDbAutoscaling => ({
  tableName: 'orders',
  hasReadTarget: true,
  hasWriteTarget: true,
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

  it('flags static provisioned tables with no table-level autoscaling targets', () => {
    const finding = dynamoDbTableWithoutAutoscalingRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-dynamodb-autoscaling': [createStaticAutoscaling({ hasReadTarget: false, hasWriteTarget: false })],
        'aws-dynamodb-tables': [createStaticTable()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        resourceId: 'aws_dynamodb_table.orders',
      },
    ]);
  });

  it('skips static tables when autoscaling exists or billing mode is unknown/on-demand', () => {
    const autoscaledFinding = dynamoDbTableWithoutAutoscalingRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-dynamodb-autoscaling': [createStaticAutoscaling()],
        'aws-dynamodb-tables': [createStaticTable()],
      }),
    });
    const onDemandFinding = dynamoDbTableWithoutAutoscalingRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-dynamodb-autoscaling': [],
        'aws-dynamodb-tables': [createStaticTable({ billingMode: 'PAY_PER_REQUEST' })],
      }),
    });
    const unknownFinding = dynamoDbTableWithoutAutoscalingRule.evaluateStatic?.({
      resources: new StaticResourceBag({
        'aws-dynamodb-autoscaling': [],
        'aws-dynamodb-tables': [createStaticTable({ billingMode: null })],
      }),
    });

    expect(autoscaledFinding).toBeNull();
    expect(onDemandFinding).toBeNull();
    expect(unknownFinding).toBeNull();
  });
});
