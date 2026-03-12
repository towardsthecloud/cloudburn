import type { DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRdsClient } from '../../src/providers/aws/client.js';
import { hydrateAwsRdsInstances } from '../../src/providers/aws/resources/rds.js';

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
        instanceClass: 'db.r8g.large',
        region: 'us-east-1',
      },
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'legacy-db',
        instanceClass: 'db.m6i.large',
        region: 'us-east-1',
      },
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'west-db',
        instanceClass: 'db.m6i.large',
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
