import type {
  DescribeDBInstancesCommand,
  DescribeDBSnapshotsCommand,
  DescribeReservedDBInstancesCommand,
  Filter,
} from '@aws-sdk/client-rds';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRdsClient } from '../../src/providers/aws/client.js';
import {
  hydrateAwsRdsInstances,
  hydrateAwsRdsReservedInstances,
  hydrateAwsRdsSnapshots,
} from '../../src/providers/aws/resources/rds.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createRdsClient: vi.fn(),
}));

const mockedCreateRdsClient = vi.mocked(createRdsClient);

const createRdsDbResource = (region: string, dbInstanceIdentifier: string) => ({
  accountId: '123456789012',
  arn: `arn:aws:rds:${region}:123456789012:db:${dbInstanceIdentifier}`,
  properties: [],
  region,
  resourceType: 'rds:db',
  service: 'rds',
});

describe('hydrateAwsRdsInstances', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates RDS DB instances with one filtered describe call per region', async () => {
    const sendsByRegion = new Map<string, ReturnType<typeof vi.fn>>();

    mockedCreateRdsClient.mockImplementation(({ region }) => {
      const send = vi.fn(async (command: DescribeDBInstancesCommand) => {
        const input = command.input as { Filters?: Filter[] };
        const identifiers = input.Filters?.[0]?.Values ?? [];

        return {
          DBInstances: identifiers.map((identifier) => ({
            DBInstanceClass: identifier === 'current-db' ? 'db.r8g.large' : 'db.m6i.large',
            DBInstanceIdentifier: identifier,
            DBInstanceStatus: 'available',
            Engine: 'mysql',
            EngineVersion: '8.0.39',
            InstanceCreateTime: new Date('2025-01-01T00:00:00.000Z'),
            MultiAZ: identifier === 'west-db',
          })),
        };
      });

      sendsByRegion.set(region ?? 'unknown', send);

      return { send, region } as never;
    });

    const instances = await hydrateAwsRdsInstances([
      createRdsDbResource('us-east-1', 'legacy-db'),
      createRdsDbResource('us-east-1', 'current-db'),
      createRdsDbResource('us-west-2', 'west-db'),
    ]);

    expect(mockedCreateRdsClient).toHaveBeenCalledTimes(2);
    expect(sendsByRegion.get('us-east-1')).toHaveBeenCalledTimes(1);
    expect(sendsByRegion.get('us-west-2')).toHaveBeenCalledTimes(1);
    expect(sendsByRegion.get('us-east-1')?.mock.calls[0]?.[0]?.input).toEqual({
      Filters: [
        {
          Name: 'db-instance-id',
          Values: ['legacy-db', 'current-db'],
        },
      ],
      Marker: undefined,
    });
    expect(instances).toEqual([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'current-db',
        dbInstanceStatus: 'available',
        engine: 'mysql',
        engineVersion: '8.0.39',
        instanceClass: 'db.r8g.large',
        instanceCreateTime: '2025-01-01T00:00:00.000Z',
        multiAz: false,
        region: 'us-east-1',
      },
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'legacy-db',
        dbInstanceStatus: 'available',
        engine: 'mysql',
        engineVersion: '8.0.39',
        instanceClass: 'db.m6i.large',
        instanceCreateTime: '2025-01-01T00:00:00.000Z',
        multiAz: false,
        region: 'us-east-1',
      },
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'west-db',
        dbInstanceStatus: 'available',
        engine: 'mysql',
        engineVersion: '8.0.39',
        instanceClass: 'db.m6i.large',
        instanceCreateTime: '2025-01-01T00:00:00.000Z',
        multiAz: true,
        region: 'us-west-2',
      },
    ]);
  });

  it('follows describe pagination markers within a batch', async () => {
    const send = vi.fn(async (command: DescribeDBInstancesCommand) => {
      const input = command.input as { Marker?: string };

      if (input.Marker === undefined) {
        return {
          DBInstances: [
            {
              DBInstanceClass: 'db.m6i.large',
              DBInstanceIdentifier: 'first-db',
            },
          ],
          Marker: 'page-2',
        };
      }

      return {
        DBInstances: [
          {
            DBInstanceClass: 'db.m6i.large',
            DBInstanceIdentifier: 'second-db',
          },
        ],
      };
    });

    mockedCreateRdsClient.mockReturnValue({ send } as never);

    const instances = await hydrateAwsRdsInstances([
      createRdsDbResource('us-east-1', 'first-db'),
      createRdsDbResource('us-east-1', 'second-db'),
    ]);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]?.input).toMatchObject({ Marker: 'page-2' });
    expect(instances.map((instance) => instance.dbInstanceIdentifier)).toEqual(['first-db', 'second-db']);
  });

  it('chunks identifiers so no describe call filters on more than 100 values', async () => {
    const send = vi.fn(async (command: DescribeDBInstancesCommand) => {
      const input = command.input as { Filters?: Filter[] };
      const identifiers = input.Filters?.[0]?.Values ?? [];

      return {
        DBInstances: identifiers.map((identifier) => ({
          DBInstanceClass: 'db.m6i.large',
          DBInstanceIdentifier: identifier,
        })),
      };
    });

    mockedCreateRdsClient.mockReturnValue({ send } as never);

    const resources = Array.from({ length: 150 }, (_, index) => createRdsDbResource('us-east-1', `db-${index}`));

    const instances = await hydrateAwsRdsInstances(resources);

    expect(send).toHaveBeenCalledTimes(2);

    const requestedValueCounts = send.mock.calls.map(
      (call) => ((call[0] as DescribeDBInstancesCommand).input as { Filters?: Filter[] }).Filters?.[0]?.Values?.length,
    );

    expect(Math.max(...requestedValueCounts.map((count) => count ?? 0))).toBeLessThanOrEqual(100);
    expect(instances).toHaveLength(150);
  });
});

describe('hydrateAwsRdsReservedInstances', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates reserved RDS instances per discovered region', async () => {
    mockedCreateRdsClient.mockImplementation(({ region }) => {
      const send = vi.fn(async (_command: DescribeReservedDBInstancesCommand) => ({
        ReservedDBInstances: [
          {
            DBInstanceClass: region === 'us-east-1' ? 'db.m6i.large' : 'db.r6i.large',
            DBInstanceCount: 2,
            MultiAZ: region === 'us-west-2',
            ProductDescription: 'mysql',
            ReservedDBInstanceId: `ri-${region}`,
            StartTime: new Date('2025-01-01T00:00:00.000Z'),
            State: 'active',
          },
        ],
      }));

      return { send, region } as never;
    });

    const reservedInstances = await hydrateAwsRdsReservedInstances([
      {
        accountId: '123456789012',
        arn: 'arn:aws:rds:us-east-1:123456789012:db:legacy-db',
        properties: [],
        region: 'us-east-1',
        resourceType: 'rds:db',
        service: 'rds',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:rds:us-west-2:123456789012:db:west-db',
        properties: [],
        region: 'us-west-2',
        resourceType: 'rds:db',
        service: 'rds',
      },
    ]);

    expect(mockedCreateRdsClient).toHaveBeenCalledTimes(2);
    expect(reservedInstances).toEqual([
      {
        accountId: '123456789012',
        instanceClass: 'db.m6i.large',
        instanceCount: 2,
        multiAz: false,
        productDescription: 'mysql',
        region: 'us-east-1',
        reservedDbInstanceId: 'ri-us-east-1',
        startTime: '2025-01-01T00:00:00.000Z',
        state: 'active',
      },
      {
        accountId: '123456789012',
        instanceClass: 'db.r6i.large',
        instanceCount: 2,
        multiAz: true,
        productDescription: 'mysql',
        region: 'us-west-2',
        reservedDbInstanceId: 'ri-us-west-2',
        startTime: '2025-01-01T00:00:00.000Z',
        state: 'active',
      },
    ]);
  });

  it('hydrates reserved RDS instances once per discovered region', async () => {
    mockedCreateRdsClient.mockImplementation(({ region }) => {
      const send = vi.fn(async (_command: DescribeReservedDBInstancesCommand) => ({
        ReservedDBInstances: [
          {
            DBInstanceClass: 'db.m6i.large',
            DBInstanceCount: 1,
            MultiAZ: false,
            ProductDescription: 'mysql',
            ReservedDBInstanceId: `ri-${region}`,
            StartTime: new Date('2025-01-01T00:00:00.000Z'),
            State: 'active',
          },
        ],
      }));

      return { send, region } as never;
    });

    const reservedInstances = await hydrateAwsRdsReservedInstances([
      {
        accountId: '123456789012',
        arn: 'arn:aws:rds:us-east-1:123456789012:db:legacy-db',
        properties: [],
        region: 'us-east-1',
        resourceType: 'rds:db',
        service: 'rds',
      },
      {
        accountId: '210987654321',
        arn: 'arn:aws:rds:us-east-1:210987654321:db:other-db',
        properties: [],
        region: 'us-east-1',
        resourceType: 'rds:db',
        service: 'rds',
      },
    ]);

    expect(mockedCreateRdsClient).toHaveBeenCalledTimes(1);
    expect(reservedInstances).toEqual([
      {
        accountId: '123456789012',
        instanceClass: 'db.m6i.large',
        instanceCount: 1,
        multiAz: false,
        productDescription: 'mysql',
        region: 'us-east-1',
        reservedDbInstanceId: 'ri-us-east-1',
        startTime: '2025-01-01T00:00:00.000Z',
        state: 'active',
      },
    ]);
  });
});

describe('hydrateAwsRdsSnapshots', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates RDS snapshots with one filtered describe call and skips stale identifiers', async () => {
    const send = vi.fn(async (_command: DescribeDBSnapshotsCommand) => ({
      // The db-snapshot-id filter silently omits identifiers that no longer
      // exist, so only the surviving snapshot comes back.
      DBSnapshots: [
        {
          DBInstanceIdentifier: 'deleted-db',
          DBSnapshotIdentifier: 'snapshot-123',
          SnapshotCreateTime: new Date('2026-01-01T00:00:00.000Z'),
          SnapshotType: 'manual',
        },
      ],
    }));

    mockedCreateRdsClient.mockReturnValue({ send } as never);

    const snapshots = await hydrateAwsRdsSnapshots([
      {
        accountId: '123456789012',
        arn: 'arn:aws:rds:us-east-1:123456789012:snapshot:snapshot-123',
        properties: [],
        region: 'us-east-1',
        resourceType: 'rds:snapshot',
        service: 'rds',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:rds:us-east-1:123456789012:snapshot:missing-snapshot',
        properties: [],
        region: 'us-east-1',
        resourceType: 'rds:snapshot',
        service: 'rds',
      },
    ]);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]?.input).toEqual({
      Filters: [
        {
          Name: 'db-snapshot-id',
          Values: ['snapshot-123', 'missing-snapshot'],
        },
      ],
      Marker: undefined,
    });
    expect(snapshots).toEqual([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'deleted-db',
        dbSnapshotIdentifier: 'snapshot-123',
        region: 'us-east-1',
        snapshotCreateTime: '2026-01-01T00:00:00.000Z',
        snapshotType: 'manual',
      },
    ]);
  });
});
