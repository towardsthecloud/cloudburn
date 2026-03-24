import type { DescribeScalableTargetsCommand } from '@aws-sdk/client-application-auto-scaling';
import type { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApplicationAutoScalingClient, createDynamoDbClient } from '../../src/providers/aws/client.js';
import { hydrateAwsDynamoDbAutoscaling, hydrateAwsDynamoDbTables } from '../../src/providers/aws/resources/dynamodb.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createApplicationAutoScalingClient: vi.fn(),
  createDynamoDbClient: vi.fn(),
}));

const mockedCreateApplicationAutoScalingClient = vi.mocked(createApplicationAutoScalingClient);
const mockedCreateDynamoDbClient = vi.mocked(createDynamoDbClient);

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
});
