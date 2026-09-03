import type { DescribeScalableTargetsCommand } from '@aws-sdk/client-application-auto-scaling';
import type { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  afterEach(() => {
    vi.useRealTimers();
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

  it('keeps readable DynamoDB tables when another table is denied', async () => {
    mockedCreateDynamoDbClient.mockReturnValue({
      send: vi.fn(async (command: DescribeTableCommand) => {
        if (command.input.TableName === 'blocked') {
          throw Object.assign(new Error('Access denied by a resource-based policy'), {
            name: 'AccessDeniedException',
          });
        }

        return {
          Table: {
            BillingModeSummary: {
              BillingMode: 'PAY_PER_REQUEST',
            },
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
        {
          accountId: '123456789012',
          arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/blocked',
          properties: [],
          region: 'us-east-1',
          resourceType: 'dynamodb:table',
          service: 'dynamodb',
        },
      ]),
    ).resolves.toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'AccessDeniedException',
          message: 'Skipped DynamoDB table blocked in us-east-1 because access is denied by a resource-based policy.',
          provider: 'aws',
          region: 'us-east-1',
          service: 'dynamodb',
          source: 'discovery',
          status: 'access_denied',
        }),
      ],
      resources: [
        {
          accountId: '123456789012',
          billingMode: 'PAY_PER_REQUEST',
          creationDateTime: undefined,
          latestStreamLabel: undefined,
          region: 'us-east-1',
          tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
          tableName: 'orders',
          tableStatus: 'ACTIVE',
        },
      ],
    });
  });

  it('rejects an all-denied DynamoDB table selection so discovery marks it unavailable', async () => {
    mockedCreateDynamoDbClient.mockReturnValue({
      send: vi.fn(async () => {
        throw Object.assign(new Error('Access denied by a resource-based policy'), {
          name: 'AccessDeniedException',
        });
      }),
    } as never);

    await expect(
      hydrateAwsDynamoDbTables([
        {
          accountId: '123456789012',
          arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/blocked',
          properties: [],
          region: 'us-east-1',
          resourceType: 'dynamodb:table',
          service: 'dynamodb',
        },
      ]),
    ).rejects.toMatchObject({ name: 'AccessDeniedException' });
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
    mockedCreateDynamoDbClient.mockReturnValue({
      send: vi.fn(async (_command: DescribeTableCommand) => ({
        Table: {
          BillingModeSummary: {
            BillingMode: 'PROVISIONED',
          },
          CreationDateTime: new Date('2025-01-01T00:00:00.000Z'),
          TableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
          TableName: 'orders',
          TableStatus: 'ACTIVE',
        },
      })),
    } as never);
    mockedFetchCloudWatchSignals.mockImplementation(async ({ queries }) => {
      const metricName = queries[0]?.metricName;

      if (metricName === 'ConsumedReadCapacityUnits') {
        return new Map([
          [
            'read0',
            Array.from({ length: 30 }, (_, index) => ({
              timestamp: `2026-03-${String(index + 2).padStart(2, '0')}T00:00:00.000Z`,
              value: 0,
            })),
          ],
        ]);
      }

      return new Map([
        [
          'write0',
          [
            { timestamp: '2026-03-02T00:00:00.000Z', value: 7 },
            ...Array.from({ length: 30 }, (_, index) => ({
              timestamp: new Date(Date.UTC(2026, 2, index + 3)).toISOString(),
              value: 0,
            })),
          ],
        ],
      ]);
    });

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
        totalConsumedWriteCapacityUnitsLast30Days: 7,
        totalConsumedWriteCapacityUnitsLast90Days: 7,
      },
    ]);
    expect(mockedFetchCloudWatchSignals).toHaveBeenCalledTimes(2);
    expect(mockedFetchCloudWatchSignals).toHaveBeenCalledWith({
      endTime: new Date('2026-04-01T12:00:00.000Z'),
      queries: [expect.objectContaining({ id: 'read0', metricName: 'ConsumedReadCapacityUnits' })],
      region: 'us-east-1',
      startTime: new Date('2026-03-02T12:00:00.000Z'),
    });
    expect(mockedFetchCloudWatchSignals).toHaveBeenCalledWith({
      endTime: new Date('2026-04-01T12:00:00.000Z'),
      queries: [expect.objectContaining({ id: 'write0', metricName: 'ConsumedWriteCapacityUnits' })],
      region: 'us-east-1',
      startTime: new Date('2026-01-01T12:00:00.000Z'),
    });
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
    mockedFetchCloudWatchSignals.mockImplementation(async ({ queries }) =>
      queries[0]?.metricName === 'ConsumedReadCapacityUnits'
        ? new Map([
            [
              'read0',
              [
                {
                  timestamp: '2026-02-01T00:00:00.000Z',
                  value: 0,
                },
              ],
            ],
          ])
        : new Map([
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
        totalConsumedWriteCapacityUnitsLast90Days: null,
      },
    ]);
  });

  it('scopes shared DynamoDB tables to the requested catalog region', async () => {
    mockedFetchCloudWatchSignals.mockResolvedValue(new Map());
    const loadDataset = vi.fn().mockResolvedValue([
      {
        accountId: '123456789012',
        creationDateTime: '2025-01-01T00:00:00.000Z',
        region: 'us-east-1',
        tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/east',
        tableName: 'east',
      },
      {
        accountId: '123456789012',
        creationDateTime: '2025-01-01T00:00:00.000Z',
        region: 'eu-west-1',
        tableArn: 'arn:aws:dynamodb:eu-west-1:123456789012:table/west',
        tableName: 'west',
      },
    ]);

    const result = await hydrateAwsDynamoDbTableUtilization(
      [
        {
          accountId: '123456789012',
          arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/east',
          properties: [],
          region: 'us-east-1',
          resourceType: 'dynamodb:table',
          service: 'dynamodb',
        },
      ],
      { loadDataset } as never,
    );

    expect(result).toEqual([
      expect.objectContaining({
        region: 'us-east-1',
        tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/east',
      }),
    ]);
    expect(mockedFetchCloudWatchSignals).toHaveBeenCalledTimes(2);
    expect(mockedFetchCloudWatchSignals).toHaveBeenCalledWith(expect.objectContaining({ region: 'us-east-1' }));
  });
});
