import type { DescribeReservedInstancesCommand } from '@aws-sdk/client-ec2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEc2Client } from '../../src/providers/aws/client.js';
import { hydrateAwsEc2ReservedInstances } from '../../src/providers/aws/resources/ec2-reserved-instances.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createEc2Client: vi.fn(),
}));

const mockedCreateEc2Client = vi.mocked(createEc2Client);

describe('hydrateAwsEc2ReservedInstances', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns an empty list when no reserved-instance resources are provided', async () => {
    await expect(hydrateAwsEc2ReservedInstances([])).resolves.toEqual([]);
    expect(mockedCreateEc2Client).not.toHaveBeenCalled();
  });

  it('hydrates discovered reserved instances using DescribeReservedInstances', async () => {
    mockedCreateEc2Client.mockImplementation(({ region }) => {
      const send = vi.fn(async (command: DescribeReservedInstancesCommand) => {
        const input = command.input as { ReservedInstancesIds?: string[] };

        return {
          ReservedInstances: (input.ReservedInstancesIds ?? []).map((reservedInstancesId) => ({
            End: new Date('2026-03-01T00:00:00.000Z'),
            InstanceType: 'm6i.large',
            ReservedInstancesId: reservedInstancesId,
            State: 'active',
          })),
        };
      });

      return { send, region } as never;
    });

    const reservedInstances = await hydrateAwsEc2ReservedInstances([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-east-1:123456789012:reserved-instances/ri-east',
        properties: [],
        region: 'us-east-1',
        resourceType: 'ec2:reserved-instances',
        service: 'ec2',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-west-2:123456789012:reserved-instances/ri-west',
        properties: [],
        region: 'us-west-2',
        resourceType: 'ec2:reserved-instances',
        service: 'ec2',
      },
    ]);

    expect(mockedCreateEc2Client).toHaveBeenCalledTimes(2);
    expect(reservedInstances).toEqual([
      {
        accountId: '123456789012',
        endTime: '2026-03-01T00:00:00.000Z',
        instanceType: 'm6i.large',
        region: 'us-east-1',
        reservedInstancesId: 'ri-east',
        state: 'active',
      },
      {
        accountId: '123456789012',
        endTime: '2026-03-01T00:00:00.000Z',
        instanceType: 'm6i.large',
        region: 'us-west-2',
        reservedInstancesId: 'ri-west',
        state: 'active',
      },
    ]);
  });

  it('skips resources with invalid reserved-instance arns', async () => {
    const reservedInstances = await hydrateAwsEc2ReservedInstances([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-123',
        properties: [],
        region: 'us-east-1',
        resourceType: 'ec2:reserved-instances',
        service: 'ec2',
      },
    ]);

    expect(reservedInstances).toEqual([]);
    expect(mockedCreateEc2Client).not.toHaveBeenCalled();
  });

  it('skips stale reserved-instance ids while preserving valid ids from the same region', async () => {
    mockedCreateEc2Client.mockImplementation(({ region }) => {
      const send = vi.fn(async (command: DescribeReservedInstancesCommand) => {
        const input = command.input as { ReservedInstancesIds?: string[] };
        const reservedInstanceIds = input.ReservedInstancesIds ?? [];

        if (reservedInstanceIds.length > 1) {
          const error = new Error('The Reserved Instances ID does not exist');
          error.name = 'InvalidReservedInstancesId.NotFound';
          throw error;
        }

        if (reservedInstanceIds[0] === 'ri-missing') {
          const error = new Error('The Reserved Instances ID does not exist');
          error.name = 'InvalidReservedInstancesId.NotFound';
          throw error;
        }

        return {
          ReservedInstances: [
            {
              End: new Date('2026-03-01T00:00:00.000Z'),
              InstanceType: 'm6i.large',
              ReservedInstancesId: reservedInstanceIds[0],
              State: 'active',
            },
          ],
        };
      });

      return { send, region } as never;
    });

    const reservedInstances = await hydrateAwsEc2ReservedInstances([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-east-1:123456789012:reserved-instances/ri-valid',
        properties: [],
        region: 'us-east-1',
        resourceType: 'ec2:reserved-instances',
        service: 'ec2',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-east-1:123456789012:reserved-instances/ri-missing',
        properties: [],
        region: 'us-east-1',
        resourceType: 'ec2:reserved-instances',
        service: 'ec2',
      },
    ]);

    expect(reservedInstances).toEqual([
      {
        accountId: '123456789012',
        endTime: '2026-03-01T00:00:00.000Z',
        instanceType: 'm6i.large',
        region: 'us-east-1',
        reservedInstancesId: 'ri-valid',
        state: 'active',
      },
    ]);
  });
});
