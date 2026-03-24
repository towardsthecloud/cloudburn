import { describe, expect, it } from 'vitest';
import { elbNetworkWithoutTargetsRule } from '../src/aws/elb/network-without-targets.js';
import type { AwsEc2LoadBalancer, AwsEc2TargetGroup } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createLoadBalancer = (overrides: Partial<AwsEc2LoadBalancer> = {}): AwsEc2LoadBalancer => ({
  accountId: '123456789012',
  attachedTargetGroupArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/nlb/123'],
  instanceCount: 0,
  loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/nlb/123',
  loadBalancerName: 'nlb',
  loadBalancerType: 'network',
  region: 'us-east-1',
  ...overrides,
});

const createTargetGroup = (overrides: Partial<AwsEc2TargetGroup> = {}): AwsEc2TargetGroup => ({
  accountId: '123456789012',
  loadBalancerArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/nlb/123'],
  region: 'us-east-1',
  registeredTargetCount: 0,
  targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/nlb/123',
  ...overrides,
});

describe('elbNetworkWithoutTargetsRule', () => {
  it('flags Network Load Balancers with no attached target groups', () => {
    const finding = elbNetworkWithoutTargetsRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancers': [createLoadBalancer({ attachedTargetGroupArns: [] })],
        'aws-ec2-target-groups': [],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/nlb/123',
      },
    ]);
  });

  it('flags Network Load Balancers whose attached target groups have no registered targets', () => {
    const finding = elbNetworkWithoutTargetsRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancers': [createLoadBalancer()],
        'aws-ec2-target-groups': [createTargetGroup()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/net/nlb/123',
      },
    ]);
  });

  it('skips Network Load Balancers with registered targets', () => {
    const finding = elbNetworkWithoutTargetsRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancers': [createLoadBalancer()],
        'aws-ec2-target-groups': [createTargetGroup({ registeredTargetCount: 2 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips non-network load balancers even when they have no targets', () => {
    const finding = elbNetworkWithoutTargetsRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancers': [createLoadBalancer({ loadBalancerType: 'application' })],
        'aws-ec2-target-groups': [createTargetGroup()],
      }),
    });

    expect(finding).toBeNull();
  });
});
