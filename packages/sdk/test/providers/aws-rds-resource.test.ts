import type {
  DescribeDBInstancesCommand,
  DescribeDBSnapshotsCommand,
  DescribeReservedDBInstancesCommand,
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

describe('hydrateAwsRdsInstances', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates discovered RDS DB instances with region-specific clients', async () => {
    mockedCreateRdsClient.mockImplementation(({ region }) => {
      const send = vi.fn(async (command: DescribeDBInstancesCommand) => {
        const input = command.input as { DBInstanceIdentifier?: string };
        const identifier = input.DBInstanceIdentifier ?? 'unknown';

        return {
          DBInstances: [
            {
              DBInstanceClass: identifier === 'current-db' ? 'db.r8g.large' : 'db.m6i.large',
              DBInstanceIdentifier: identifier,
              DBInstanceStatus: 'available',
              Engine: 'mysql',
              EngineVersion: '8.0.39',
              InstanceCreateTime: new Date('2025-01-01T00:00:00.000Z'),
              MultiAZ: identifier === 'west-db',
            },
          ],
        };
      });

      return { send, region } as never;
    });

    const instances = await hydrateAwsRdsInstances([
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
        arn: 'arn:aws:rds:us-east-1:123456789012:db:current-db',
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

  it('caps in-flight RDS describe requests per region', async () => {
    let currentInFlight = 0;
    let maxInFlight = 0;
    const send = vi.fn(
      async (command: DescribeDBInstancesCommand) =>
        new Promise<{ DBInstances?: Array<{ DBInstanceClass?: string; DBInstanceIdentifier?: string }> }>((resolve) => {
          currentInFlight += 1;
          maxInFlight = Math.max(maxInFlight, currentInFlight);

          const input = command.input as { DBInstanceIdentifier?: string };
          const dbInstanceIdentifier = input.DBInstanceIdentifier ?? 'unknown';

          setTimeout(() => {
            currentInFlight -= 1;
            resolve({
              DBInstances: [
                {
                  DBInstanceClass: 'db.m6i.large',
                  DBInstanceIdentifier: dbInstanceIdentifier,
                },
              ],
            });
          }, 0);
        }),
    );

    mockedCreateRdsClient.mockReturnValue({ send } as never);

    const resources = Array.from({ length: 25 }, (_, index) => ({
      accountId: '123456789012',
      arn: `arn:aws:rds:us-east-1:123456789012:db:db-${index}`,
      properties: [],
      region: 'us-east-1',
      resourceType: 'rds:db',
      service: 'rds',
    }));

    await hydrateAwsRdsInstances(resources);

    expect(maxInFlight).toBeLessThanOrEqual(10);
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

  it('hydrates RDS snapshots and skips stale snapshot identifiers', async () => {
    mockedCreateRdsClient.mockImplementation(({ region }) => {
      const send = vi.fn(async (command: DescribeDBSnapshotsCommand) => {
        const input = command.input as { DBSnapshotIdentifier?: string };
        const dbSnapshotIdentifier = input.DBSnapshotIdentifier ?? 'unknown';

        if (dbSnapshotIdentifier === 'missing-snapshot') {
          const error = new Error('Snapshot not found');
          error.name = 'DBSnapshotNotFound';
          throw error;
        }

        return {
          DBSnapshots: [
            {
              DBInstanceIdentifier: 'deleted-db',
              DBSnapshotIdentifier: dbSnapshotIdentifier,
              SnapshotCreateTime: new Date('2026-01-01T00:00:00.000Z'),
              SnapshotType: 'manual',
            },
          ],
        };
      });

      return { send, region } as never;
    });

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
