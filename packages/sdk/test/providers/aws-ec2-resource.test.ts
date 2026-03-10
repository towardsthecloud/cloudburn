import type { DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEc2Client } from '../../src/providers/aws/client.js';
import { hydrateAwsEc2Instances } from '../../src/providers/aws/resources/ec2.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createEc2Client: vi.fn(),
}));

const mockedCreateEc2Client = vi.mocked(createEc2Client);

describe('hydrateAwsEc2Instances', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns an empty list when no EC2 instance resources are provided', async () => {
    await expect(hydrateAwsEc2Instances([])).resolves.toEqual([]);
    expect(mockedCreateEc2Client).not.toHaveBeenCalled();
  });

  it('hydrates discovered EC2 instances using only DescribeInstances', async () => {
    mockedCreateEc2Client.mockImplementation(({ region }) => {
      const send = vi.fn(async (command: DescribeInstancesCommand) => {
        const input = command.input as { InstanceIds?: string[] };
        return {
          Reservations: [
            {
              Instances: (input.InstanceIds ?? []).map((instanceId) => ({
                InstanceId: instanceId,
                InstanceType: instanceId === 'i-current' ? 'm8i.large' : 'c6i.large',
              })),
            },
          ],
        };
      });

      return { send, region } as never;
    });

    const instances = await hydrateAwsEc2Instances([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-legacy',
        properties: [],
        region: 'us-east-1',
        resourceType: 'ec2:instance',
        service: 'ec2',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-current',
        properties: [],
        region: 'us-east-1',
        resourceType: 'ec2:instance',
        service: 'ec2',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-west-2:123456789012:instance/i-west',
        properties: [],
        region: 'us-west-2',
        resourceType: 'ec2:instance',
        service: 'ec2',
      },
    ]);

    expect(mockedCreateEc2Client).toHaveBeenCalledTimes(2);
    expect(instances).toEqual([
      {
        accountId: '123456789012',
        instanceId: 'i-current',
        instanceType: 'm8i.large',
        region: 'us-east-1',
      },
      {
        accountId: '123456789012',
        instanceId: 'i-legacy',
        instanceType: 'c6i.large',
        region: 'us-east-1',
      },
      {
        accountId: '123456789012',
        instanceId: 'i-west',
        instanceType: 'c6i.large',
        region: 'us-west-2',
      },
    ]);
  });

  it('skips resources with invalid EC2 instance arns', async () => {
    const instances = await hydrateAwsEc2Instances([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-east-1:123456789012:volume/vol-123',
        properties: [],
        region: 'us-east-1',
        resourceType: 'ec2:instance',
        service: 'ec2',
      },
    ]);

    expect(instances).toEqual([]);
    expect(mockedCreateEc2Client).not.toHaveBeenCalled();
  });

  it('skips described instances that do not include an instance type', async () => {
    mockedCreateEc2Client.mockImplementation(({ region }) => {
      const send = vi.fn(async () => ({
        Reservations: [
          {
            Instances: [{ InstanceId: 'i-missing-type' }],
          },
        ],
      }));

      return { send, region } as never;
    });

    const instances = await hydrateAwsEc2Instances([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-missing-type',
        properties: [],
        region: 'us-east-1',
        resourceType: 'ec2:instance',
        service: 'ec2',
      },
    ]);

    expect(instances).toEqual([]);
  });
});
