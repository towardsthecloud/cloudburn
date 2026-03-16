import { describe, expect, it } from 'vitest';
import { elbGatewayWithoutTargetsRule } from '../src/aws/elb/gateway-without-targets.js';
import type { AwsEc2LoadBalancer, AwsEc2TargetGroup } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createLoadBalancer = (overrides: Partial<AwsEc2LoadBalancer> = {}): AwsEc2LoadBalancer => ({
  accountId: '123456789012',
  attachedTargetGroupArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/gwlb/123'],
  instanceCount: 0,
  loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/gwy/gwlb/123',
  loadBalancerName: 'gwlb',
  loadBalancerType: 'gateway',
  region: 'us-east-1',
  ...overrides,
});

const createTargetGroup = (overrides: Partial<AwsEc2TargetGroup> = {}): AwsEc2TargetGroup => ({
  accountId: '123456789012',
  loadBalancerArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/gwy/gwlb/123'],
  region: 'us-east-1',
  registeredTargetCount: 0,
  targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/gwlb/123',
  ...overrides,
});

describe('elbGatewayWithoutTargetsRule', () => {
  it('flags Gateway Load Balancers with no attached target groups', () => {
    const finding = elbGatewayWithoutTargetsRule.evaluateLive?.({
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
        resourceId: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/gwy/gwlb/123',
      },
    ]);
  });

  it('flags Gateway Load Balancers whose attached target groups have no registered targets', () => {
    const finding = elbGatewayWithoutTargetsRule.evaluateLive?.({
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
        resourceId: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/gwy/gwlb/123',
      },
    ]);
  });

  it('skips Gateway Load Balancers with registered targets', () => {
    const finding = elbGatewayWithoutTargetsRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancers': [createLoadBalancer()],
        'aws-ec2-target-groups': [createTargetGroup({ registeredTargetCount: 1 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips Gateway Load Balancers when any attached target group is missing from the hydrated dataset', () => {
    const finding = elbGatewayWithoutTargetsRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancers': [createLoadBalancer()],
        'aws-ec2-target-groups': [],
      }),
    });

    expect(finding).toBeNull();
  });
});
