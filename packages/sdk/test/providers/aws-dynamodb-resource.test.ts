import type { DescribeScalableTargetsCommand } from '@aws-sdk/client-application-auto-scaling';
import type { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApplicationAutoScalingClient, createDynamoDbClient } from '../../src/providers/aws/client.js';
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import {
  hydrateAwsDynamoDbAutoscaling,
  hydrateAwsDynamoDbTables,
  hydrateAwsDynamoDbTableUtilization,
} from '../../src/providers/aws/resources/dynamodb.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createApplicationAutoScalingClient: vi.fn(),
  createDynamoDbClient: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', () => ({
  fetchCloudWatchSignals: vi.fn(),
}));

const mockedCreateApplicationAutoScalingClient = vi.mocked(createApplicationAutoScalingClient);
const mockedCreateDynamoDbClient = vi.mocked(createDynamoDbClient);
const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);

describe('DynamoDB discovery resources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates DynamoDB tables with billing mode and latest stream label metadata', async () => {
    mockedCreateDynamoDbClient.mockReturnValue({
      send: vi.fn(async (command: DescribeTableCommand) => {
        expect(command.input).toEqual({ TableName: 'orders' });

        return {
          Table: {
            BillingModeSummary: {
              BillingMode: 'PROVISIONED',
            },
            CreationDateTime: new Date('2025-01-01T00:00:00.000Z'),
            LatestStreamLabel: '2025-12-01T00:00:00.000',
            TableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
            TableName: 'orders',
            TableStatus: 'ACTIVE',
          },
        };
      }),
    } as never);

    await expect(
      hydrateAwsDynamoDbTables([
        {
          accountId: '123456789012',
          arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
          properties: [],
          region: 'us-east-1',
          resourceType: 'dynamodb:table',
          service: 'dynamodb',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        billingMode: 'PROVISIONED',
        creationDateTime: '2025-01-01T00:00:00.000Z',
        latestStreamLabel: '2025-12-01T00:00:00.000',
        region: 'us-east-1',
        tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
        tableName: 'orders',
        tableStatus: 'ACTIVE',
      },
    ]);
  });

  it('hydrates table-level autoscaling targets for DynamoDB tables', async () => {
    mockedCreateApplicationAutoScalingClient.mockReturnValue({
      send: vi.fn(async (command: DescribeScalableTargetsCommand) => {
        expect(command.input).toMatchObject({
          ResourceIds: ['table/orders'],
          ServiceNamespace: 'dynamodb',
        });

        return {
          ScalableTargets: [
            {
              ResourceId: 'table/orders',
              ScalableDimension: 'dynamodb:table:ReadCapacityUnits',
            },
          ],
        };
      }),
    } as never);

    await expect(
      hydrateAwsDynamoDbAutoscaling([
        {
          accountId: '123456789012',
          arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
          properties: [],
          region: 'us-east-1',
          resourceType: 'dynamodb:table',
          service: 'dynamodb',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        hasReadTarget: true,
        hasWriteTarget: false,
        region: 'us-east-1',
        tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
        tableName: 'orders',
      },
    ]);
  });

  it('hydrates 30-day DynamoDB table utilization from CloudWatch consumed capacity metrics', async () => {
    mockedCreateDynamoDbClient.mockReturnValue({
      send: vi.fn(async (_command: DescribeTableCommand) => ({
        Table: {
          BillingModeSummary: {
            BillingMode: 'PROVISIONED',
          },
          TableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
          TableName: 'orders',
          TableStatus: 'ACTIVE',
        },
      })),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'read0',
          Array.from({ length: 30 }, (_, index) => ({
            timestamp: `2026-02-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            value: 0,
          })),
        ],
        [
          'write0',
          Array.from({ length: 30 }, (_, index) => ({
            timestamp: `2026-02-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
            value: 0,
          })),
        ],
      ]),
    );

    await expect(
      hydrateAwsDynamoDbTableUtilization([
        {
          accountId: '123456789012',
          arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
          properties: [],
          region: 'us-east-1',
          resourceType: 'dynamodb:table',
          service: 'dynamodb',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
        tableName: 'orders',
        totalConsumedReadCapacityUnitsLast30Days: 0,
        totalConsumedWriteCapacityUnitsLast30Days: 0,
      },
    ]);
  });

  it('preserves incomplete DynamoDB utilization coverage as null totals', async () => {
    mockedCreateDynamoDbClient.mockReturnValue({
      send: vi.fn(async (_command: DescribeTableCommand) => ({
        Table: {
          BillingModeSummary: {
            BillingMode: 'PROVISIONED',
          },
          TableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
          TableName: 'orders',
          TableStatus: 'ACTIVE',
        },
      })),
    } as never);
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'read0',
          [
            {
              timestamp: '2026-02-01T00:00:00.000Z',
              value: 0,
            },
          ],
        ],
        [
          'write0',
          [
            {
              timestamp: '2026-02-01T00:00:00.000Z',
              value: 0,
            },
          ],
        ],
      ]),
    );

    await expect(
      hydrateAwsDynamoDbTableUtilization([
        {
          accountId: '123456789012',
          arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
          properties: [],
          region: 'us-east-1',
          resourceType: 'dynamodb:table',
          service: 'dynamodb',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
        tableName: 'orders',
        totalConsumedReadCapacityUnitsLast30Days: null,
        totalConsumedWriteCapacityUnitsLast30Days: null,
      },
    ]);
  });
});
