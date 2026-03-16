import type { DescribeLoadBalancersCommand as DescribeClassicLoadBalancersCommand } from '@aws-sdk/client-elastic-load-balancing';
import type {
  DescribeLoadBalancersCommand as DescribeLoadBalancersV2Command,
  DescribeTargetGroupsCommand,
  DescribeTargetHealthCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createElasticLoadBalancingClient,
  createElasticLoadBalancingV2Client,
} from '../../src/providers/aws/client.js';
import { hydrateAwsEc2LoadBalancers, hydrateAwsEc2TargetGroups } from '../../src/providers/aws/resources/elbv2.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createElasticLoadBalancingClient: vi.fn(),
  createElasticLoadBalancingV2Client: vi.fn(),
}));

const mockedCreateElasticLoadBalancingClient = vi.mocked(createElasticLoadBalancingClient);
const mockedCreateElasticLoadBalancingV2Client = vi.mocked(createElasticLoadBalancingV2Client);

describe('hydrateAwsEc2LoadBalancers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns an empty list when no load-balancer resources are provided', async () => {
    await expect(hydrateAwsEc2LoadBalancers([])).resolves.toEqual([]);
    expect(mockedCreateElasticLoadBalancingClient).not.toHaveBeenCalled();
    expect(mockedCreateElasticLoadBalancingV2Client).not.toHaveBeenCalled();
  });

  it('hydrates classic and v2 load balancers with the fields required by cleanup rules', async () => {
    mockedCreateElasticLoadBalancingClient.mockImplementation(({ region }) => {
      const send = vi.fn(async (_command: DescribeClassicLoadBalancersCommand) => ({
        LoadBalancerDescriptions: [
          {
            Instances: [{ InstanceId: 'i-123' }],
            LoadBalancerName: 'classic-lb',
          },
        ],
      }));

      return { send, region } as never;
    });
    mockedCreateElasticLoadBalancingV2Client.mockImplementation(({ region }) => {
      const send = vi.fn(
        async (command: DescribeLoadBalancersV2Command | DescribeTargetGroupsCommand | DescribeTargetHealthCommand) => {
          const input = command.input as { LoadBalancerArn?: string; LoadBalancerArns?: string[] };

          if ('LoadBalancerArn' in input) {
            return {
              TargetGroups: [
                {
                  TargetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123',
                },
              ],
            };
          }

          return {
            LoadBalancers: (input.LoadBalancerArns ?? []).map((loadBalancerArn) => ({
              LoadBalancerArn: loadBalancerArn,
              LoadBalancerName: 'alb',
              Type: 'application',
            })),
          };
        },
      );

      return { send, region } as never;
    });

    const loadBalancers = await hydrateAwsEc2LoadBalancers([
      {
        accountId: '123456789012',
        arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/classic-lb',
        properties: [],
        region: 'us-east-1',
        resourceType: 'elasticloadbalancing:loadbalancer',
        service: 'elasticloadbalancing',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
        properties: [],
        region: 'us-east-1',
        resourceType: 'elasticloadbalancing:loadbalancer/app',
        service: 'elasticloadbalancing',
      },
    ]);

    expect(loadBalancers).toEqual([
      {
        accountId: '123456789012',
        attachedTargetGroupArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123'],
        instanceCount: 0,
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
        loadBalancerName: 'alb',
        loadBalancerType: 'application',
        region: 'us-east-1',
      },
      {
        accountId: '123456789012',
        attachedTargetGroupArns: [],
        instanceCount: 1,
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/classic-lb',
        loadBalancerName: 'classic-lb',
        loadBalancerType: 'classic',
        region: 'us-east-1',
      },
    ]);
  });

  it('skips stale v2 load balancer arns while preserving valid load balancers', async () => {
    mockedCreateElasticLoadBalancingV2Client.mockImplementation(({ region }) => {
      const send = vi.fn(
        async (command: DescribeLoadBalancersV2Command | DescribeTargetGroupsCommand | DescribeTargetHealthCommand) => {
          const input = command.input as { LoadBalancerArn?: string; LoadBalancerArns?: string[] };

          if ('LoadBalancerArn' in input) {
            if (
              input.LoadBalancerArn ===
              'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/missing/123'
            ) {
              const error = new Error('Load balancer not found');
              error.name = 'LoadBalancerNotFound';
              throw error;
            }

            return {
              TargetGroups: [
                {
                  TargetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123',
                },
              ],
            };
          }

          const loadBalancerArns = input.LoadBalancerArns ?? [];

          if (loadBalancerArns.length > 1) {
            const error = new Error('Load balancer not found');
            error.name = 'LoadBalancerNotFound';
            throw error;
          }

          if (
            loadBalancerArns[0] === 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/missing/123'
          ) {
            const error = new Error('Load balancer not found');
            error.name = 'LoadBalancerNotFound';
            throw error;
          }

          return {
            LoadBalancers: [
              {
                LoadBalancerArn: loadBalancerArns[0],
                LoadBalancerName: 'alb-valid',
                Type: 'application',
              },
            ],
          };
        },
      );

      return { send, region } as never;
    });

    const loadBalancers = await hydrateAwsEc2LoadBalancers([
      {
        accountId: '123456789012',
        arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb-valid/123',
        properties: [],
        region: 'us-east-1',
        resourceType: 'elasticloadbalancing:loadbalancer/app',
        service: 'elasticloadbalancing',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/missing/123',
        properties: [],
        region: 'us-east-1',
        resourceType: 'elasticloadbalancing:loadbalancer/app',
        service: 'elasticloadbalancing',
      },
    ]);

    expect(loadBalancers).toEqual([
      {
        accountId: '123456789012',
        attachedTargetGroupArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123'],
        instanceCount: 0,
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb-valid/123',
        loadBalancerName: 'alb-valid',
        loadBalancerType: 'application',
        region: 'us-east-1',
      },
    ]);
  });

  it('skips stale classic load balancer names while preserving valid load balancers', async () => {
    mockedCreateElasticLoadBalancingClient.mockImplementation(({ region }) => {
      const send = vi.fn(async (command: DescribeClassicLoadBalancersCommand) => {
        const input = command.input as { LoadBalancerNames?: string[] };
        const loadBalancerNames = input.LoadBalancerNames ?? [];

        if (loadBalancerNames.length > 1 || loadBalancerNames[0] === 'missing-classic-lb') {
          const error = new Error('Load balancer not found');
          error.name = 'AccessPointNotFound';
          throw error;
        }

        return {
          LoadBalancerDescriptions: [
            {
              Instances: [{ InstanceId: 'i-123' }],
              LoadBalancerName: 'classic-lb',
            },
          ],
        };
      });

      return { send, region } as never;
    });

    const loadBalancers = await hydrateAwsEc2LoadBalancers([
      {
        accountId: '123456789012',
        arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/classic-lb',
        properties: [],
        region: 'us-east-1',
        resourceType: 'elasticloadbalancing:loadbalancer',
        service: 'elasticloadbalancing',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/missing-classic-lb',
        properties: [],
        region: 'us-east-1',
        resourceType: 'elasticloadbalancing:loadbalancer',
        service: 'elasticloadbalancing',
      },
    ]);

    expect(loadBalancers).toEqual([
      {
        accountId: '123456789012',
        attachedTargetGroupArns: [],
        instanceCount: 1,
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/classic-lb',
        loadBalancerName: 'classic-lb',
        loadBalancerType: 'classic',
        region: 'us-east-1',
      },
    ]);
  });
});

describe('hydrateAwsEc2TargetGroups', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns an empty list when no target-group resources are provided', async () => {
    await expect(hydrateAwsEc2TargetGroups([])).resolves.toEqual([]);
    expect(mockedCreateElasticLoadBalancingV2Client).not.toHaveBeenCalled();
  });

  it('hydrates target groups with attached load balancers and registered target counts', async () => {
    mockedCreateElasticLoadBalancingV2Client.mockImplementation(({ region }) => {
      const send = vi.fn(async (command: DescribeTargetGroupsCommand | DescribeTargetHealthCommand) => {
        const input = command.input as { TargetGroupArns?: string[]; TargetGroupArn?: string };

        if (input.TargetGroupArn) {
          return {
            TargetHealthDescriptions: [{ Target: { Id: 'i-123' } }, { Target: { Id: 'i-456' } }],
          };
        }

        return {
          TargetGroups: (input.TargetGroupArns ?? []).map((targetGroupArn) => ({
            LoadBalancerArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123'],
            TargetGroupArn: targetGroupArn,
          })),
        };
      });

      return { send, region } as never;
    });

    const targetGroups = await hydrateAwsEc2TargetGroups([
      {
        accountId: '123456789012',
        arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123',
        properties: [],
        region: 'us-east-1',
        resourceType: 'elasticloadbalancing:targetgroup',
        service: 'elasticloadbalancing',
      },
    ]);

    expect(targetGroups).toEqual([
      {
        accountId: '123456789012',
        loadBalancerArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123'],
        region: 'us-east-1',
        registeredTargetCount: 2,
        targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123',
      },
    ]);
  });

  it('skips resources with invalid target-group arns', async () => {
    const targetGroups = await hydrateAwsEc2TargetGroups([
      {
        accountId: '123456789012',
        arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
        properties: [],
        region: 'us-east-1',
        resourceType: 'elasticloadbalancing:targetgroup',
        service: 'elasticloadbalancing',
      },
    ]);

    expect(targetGroups).toEqual([]);
    expect(mockedCreateElasticLoadBalancingV2Client).not.toHaveBeenCalled();
  });

  it('skips stale target group arns while preserving valid target groups', async () => {
    mockedCreateElasticLoadBalancingV2Client.mockImplementation(({ region }) => {
      const send = vi.fn(async (command: DescribeTargetGroupsCommand | DescribeTargetHealthCommand) => {
        const input = command.input as { TargetGroupArns?: string[]; TargetGroupArn?: string };

        if (input.TargetGroupArn) {
          return {
            TargetHealthDescriptions: [{ Target: { Id: 'i-123' } }],
          };
        }

        const targetGroupArns = input.TargetGroupArns ?? [];

        if (
          targetGroupArns.length > 1 ||
          targetGroupArns[0] === 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/missing/123'
        ) {
          const error = new Error('Target group not found');
          error.name = 'TargetGroupNotFound';
          throw error;
        }

        return {
          TargetGroups: [
            {
              LoadBalancerArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123'],
              TargetGroupArn: targetGroupArns[0],
            },
          ],
        };
      });

      return { send, region } as never;
    });

    const targetGroups = await hydrateAwsEc2TargetGroups([
      {
        accountId: '123456789012',
        arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123',
        properties: [],
        region: 'us-east-1',
        resourceType: 'elasticloadbalancing:targetgroup',
        service: 'elasticloadbalancing',
      },
      {
        accountId: '123456789012',
        arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/missing/123',
        properties: [],
        region: 'us-east-1',
        resourceType: 'elasticloadbalancing:targetgroup',
        service: 'elasticloadbalancing',
      },
    ]);

    expect(targetGroups).toEqual([
      {
        accountId: '123456789012',
        loadBalancerArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123'],
        region: 'us-east-1',
        registeredTargetCount: 1,
        targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123',
      },
    ]);
  });
});
