import type { DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import type { DescribeContainerInstancesCommand, DescribeServicesCommand } from '@aws-sdk/client-ecs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEc2Client, createEcsClient } from '../../src/providers/aws/client.js';
import {
  hydrateAwsEcsClusters,
  hydrateAwsEcsContainerInstances,
  hydrateAwsEcsServices,
} from '../../src/providers/aws/resources/ecs.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createEc2Client: vi.fn(),
  createEcsClient: vi.fn(),
}));

const mockedCreateEc2Client = vi.mocked(createEc2Client);
const mockedCreateEcsClient = vi.mocked(createEcsClient);

describe('hydrateAwsEcsClusters', () => {
  it('projects ECS clusters directly from Resource Explorer resources', async () => {
    await expect(
      hydrateAwsEcsClusters([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ecs:cluster',
          service: 'ecs',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        region: 'us-east-1',
      },
    ]);
  });
});

describe('hydrateAwsEcsServices', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates ECS services with DescribeServices metadata', async () => {
    const send = vi.fn(async (command: DescribeServicesCommand) => {
      const input = command.input as { cluster?: string; services?: string[] };

      expect(input.cluster).toBe('production');
      expect(input.services).toEqual(['arn:aws:ecs:us-east-1:123456789012:service/production/web']);

      return {
        services: [
          {
            clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
            desiredCount: 2,
            schedulingStrategy: 'REPLICA',
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/production/web',
            serviceName: 'web',
            status: 'ACTIVE',
          },
        ],
      };
    });

    mockedCreateEcsClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsEcsServices([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ecs:us-east-1:123456789012:service/production/web',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ecs:service',
          service: 'ecs',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        desiredCount: 2,
        region: 'us-east-1',
        schedulingStrategy: 'REPLICA',
        serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/production/web',
        serviceName: 'web',
        status: 'ACTIVE',
      },
    ]);
  });
});

describe('hydrateAwsEcsContainerInstances', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates container instances and enriches them with backing EC2 instance details', async () => {
    const ecsSend = vi.fn(async (command: DescribeContainerInstancesCommand) => {
      const input = command.input as { cluster?: string; containerInstances?: string[] };

      expect(input.cluster).toBe('production');
      expect(input.containerInstances).toEqual([
        'arn:aws:ecs:us-east-1:123456789012:container-instance/production/abc123',
      ]);

      return {
        containerInstances: [
          {
            containerInstanceArn: 'arn:aws:ecs:us-east-1:123456789012:container-instance/production/abc123',
            ec2InstanceId: 'i-1234567890abcdef0',
          },
        ],
      };
    });
    const ec2Send = vi.fn(async (command: DescribeInstancesCommand) => {
      const input = command.input as { InstanceIds?: string[] };

      expect(input.InstanceIds).toEqual(['i-1234567890abcdef0']);

      return {
        Reservations: [
          {
            Instances: [
              {
                Architecture: 'x86_64',
                InstanceId: 'i-1234567890abcdef0',
                InstanceType: 'm7i.large',
              },
            ],
          },
        ],
      };
    });

    mockedCreateEcsClient.mockReturnValue({ send: ecsSend } as never);
    mockedCreateEc2Client.mockReturnValue({ send: ec2Send } as never);

    await expect(
      hydrateAwsEcsContainerInstances([
        {
          accountId: '123456789012',
          arn: 'arn:aws:ecs:us-east-1:123456789012:container-instance/production/abc123',
          properties: [],
          region: 'us-east-1',
          resourceType: 'ecs:container-instance',
          service: 'ecs',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        architecture: 'x86_64',
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        containerInstanceArn: 'arn:aws:ecs:us-east-1:123456789012:container-instance/production/abc123',
        ec2InstanceId: 'i-1234567890abcdef0',
        instanceType: 'm7i.large',
        region: 'us-east-1',
      },
    ]);
  });
});
