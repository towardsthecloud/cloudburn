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
                Architecture: instanceId === 'i-current' ? 'arm64' : 'x86_64',
                InstanceId: instanceId,
                LaunchTime:
                  instanceId === 'i-current'
                    ? new Date('2026-03-15T00:00:00.000Z')
                    : instanceId === 'i-west'
                      ? new Date('2025-12-31T00:00:00.000Z')
                      : new Date('2025-09-01T00:00:00.000Z'),
                StateTransitionReason:
                  instanceId === 'i-current'
                    ? undefined
                    : instanceId === 'i-west'
                      ? 'User initiated (2025-12-15 10:30:00 UTC)'
                      : 'User initiated (2025-10-01 08:00:00 UTC)',
                State: {
                  Name: instanceId === 'i-current' ? 'running' : 'stopped',
                },
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
        architecture: 'arm64',
        instanceId: 'i-current',
        instanceType: 'm8i.large',
        launchTime: '2026-03-15T00:00:00.000Z',
        region: 'us-east-1',
        state: 'running',
      },
      {
        accountId: '123456789012',
        architecture: 'x86_64',
        instanceId: 'i-legacy',
        instanceType: 'c6i.large',
        launchTime: '2025-09-01T00:00:00.000Z',
        region: 'us-east-1',
        state: 'stopped',
        stoppedAt: '2025-10-01T08:00:00.000Z',
      },
      {
        accountId: '123456789012',
        architecture: 'x86_64',
        instanceId: 'i-west',
        instanceType: 'c6i.large',
        launchTime: '2025-12-31T00:00:00.000Z',
        region: 'us-west-2',
        state: 'stopped',
        stoppedAt: '2025-12-15T10:30:00.000Z',
      },
    ]);
  });

  it('leaves stoppedAt unset when the stop reason cannot be parsed', async () => {
    mockedCreateEc2Client.mockImplementation(({ region }) => {
      const send = vi.fn(async () => ({
        Reservations: [
          {
            Instances: [
              {
                Architecture: 'x86_64',
                InstanceId: 'i-unparseable',
                InstanceType: 'm7i.large',
                LaunchTime: new Date('2025-03-01T00:00:00.000Z'),
                State: {
                  Name: 'stopped',
                },
                StateTransitionReason: 'User initiated',
              },
            ],
          },
        ],
      }));

      return { send, region } as never;
    });

    await expect(
      hydrateAwsEc2Instances([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-unparseable',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:instance',
          service: 'ec2',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        architecture: 'x86_64',
        instanceId: 'i-unparseable',
        instanceType: 'm7i.large',
        launchTime: '2025-03-01T00:00:00.000Z',
        region: 'us-east-1',
        state: 'stopped',
      },
    ]);
  });

  it('parses stoppedAt when the stop reason uses the GMT suffix', async () => {
    mockedCreateEc2Client.mockImplementation(({ region }) => {
      const send = vi.fn(async () => ({
        Reservations: [
          {
            Instances: [
              {
                Architecture: 'x86_64',
                InstanceId: 'i-gmt',
                InstanceType: 'm7i.large',
                LaunchTime: new Date('2025-03-01T00:00:00.000Z'),
                State: {
                  Name: 'stopped',
                },
                StateTransitionReason: 'User initiated (2025-03-15 10:30:00 GMT)',
              },
            ],
          },
        ],
      }));

      return { send, region } as never;
    });

    await expect(
      hydrateAwsEc2Instances([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-gmt',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ec2:instance',
          service: 'ec2',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        architecture: 'x86_64',
        instanceId: 'i-gmt',
        instanceType: 'm7i.large',
        launchTime: '2025-03-01T00:00:00.000Z',
        region: 'us-east-1',
        state: 'stopped',
        stoppedAt: '2025-03-15T10:30:00.000Z',
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
