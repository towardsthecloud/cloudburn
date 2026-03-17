import type {
  DescribeScalableTargetsCommand,
  DescribeScalingPoliciesCommand,
} from '@aws-sdk/client-application-auto-scaling';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApplicationAutoScalingClient } from '../../src/providers/aws/client.js';
import { hydrateAwsEcsAutoscaling } from '../../src/providers/aws/resources/ecs-autoscaling.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createApplicationAutoScalingClient: vi.fn(),
}));

const mockedCreateApplicationAutoScalingClient = vi.mocked(createApplicationAutoScalingClient);

describe('hydrateAwsEcsAutoscaling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hydrates autoscaling coverage from scalable targets and scaling policies', async () => {
    const send = vi.fn(async (command: DescribeScalableTargetsCommand | DescribeScalingPoliciesCommand) => {
      if (command.constructor.name === 'DescribeScalableTargetsCommand') {
        const input = (command as DescribeScalableTargetsCommand).input as { ResourceIds?: string[] };

        expect(input.ResourceIds).toEqual(['service/production/web']);

        return {
          ScalableTargets: [{ ResourceId: 'service/production/web' }],
        };
      }

      return {
        ScalingPolicies: [{ ResourceId: 'service/production/web' }],
      };
    });

    mockedCreateApplicationAutoScalingClient.mockReturnValue({ send } as never);

    await expect(
      hydrateAwsEcsAutoscaling([
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
        clusterName: 'production',
        hasScalableTarget: true,
        hasScalingPolicy: true,
        region: 'us-east-1',
        serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/production/web',
        serviceName: 'web',
      },
    ]);
  });

  it('loads regional scaling policies once even when services span multiple target batches', async () => {
    let scalableTargetCalls = 0;
    let scalingPolicyCalls = 0;
    const send = vi.fn(async (command: DescribeScalableTargetsCommand | DescribeScalingPoliciesCommand) => {
      if (command.constructor.name === 'DescribeScalableTargetsCommand') {
        scalableTargetCalls += 1;
        return {
          ScalableTargets: [],
        };
      }

      scalingPolicyCalls += 1;
      return {
        ScalingPolicies: [],
      };
    });

    mockedCreateApplicationAutoScalingClient.mockReturnValue({ send } as never);

    await hydrateAwsEcsAutoscaling(
      Array.from({ length: 51 }, (_, index) => ({
        accountId: '123456789012',
        arn: `arn:aws:ecs:us-east-1:123456789012:service/production/web-${index}`,
        properties: [],
        region: 'us-east-1',
        resourceType: 'ecs:service',
        service: 'ecs',
      })),
    );

    expect(scalableTargetCalls).toBe(2);
    expect(scalingPolicyCalls).toBe(1);
  });
});
