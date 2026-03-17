import { describe, expect, it } from 'vitest';
import { ecsServiceAutoscalingPolicyRule } from '../src/aws/ecs/service-autoscaling-policy.js';
import type { AwsEcsService, AwsEcsServiceAutoscaling } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createService = (overrides: Partial<AwsEcsService> = {}): AwsEcsService => ({
  accountId: '123456789012',
  clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
  clusterName: 'production',
  desiredCount: 2,
  region: 'us-east-1',
  schedulingStrategy: 'REPLICA',
  serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/production/web',
  serviceName: 'web',
  status: 'ACTIVE',
  ...overrides,
});

const createAutoscaling = (overrides: Partial<AwsEcsServiceAutoscaling> = {}): AwsEcsServiceAutoscaling => ({
  accountId: '123456789012',
  clusterName: 'production',
  hasScalableTarget: true,
  hasScalingPolicy: true,
  region: 'us-east-1',
  serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/production/web',
  serviceName: 'web',
  ...overrides,
});

describe('ecsServiceAutoscalingPolicyRule', () => {
  it('flags active REPLICA services without full autoscaling coverage', () => {
    const finding = ecsServiceAutoscalingPolicyRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ecs-services': [createService()],
        'aws-ecs-autoscaling': [createAutoscaling({ hasScalingPolicy: false })],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-ECS-3',
      service: 'ecs',
      source: 'discovery',
      message: 'Active REPLICA ECS services should use an autoscaling policy.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'arn:aws:ecs:us-east-1:123456789012:service/production/web',
        },
      ],
    });
  });

  it('skips active REPLICA services with both scalable target and policy', () => {
    const finding = ecsServiceAutoscalingPolicyRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ecs-services': [createService()],
        'aws-ecs-autoscaling': [createAutoscaling()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips services when autoscaling coverage is unavailable', () => {
    const finding = ecsServiceAutoscalingPolicyRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ecs-services': [createService()],
        'aws-ecs-autoscaling': [],
      }),
    });

    expect(finding).toBeNull();
  });
});
