import { describe, expect, it } from 'vitest';
import { elbClassicWithoutInstancesRule } from '../src/aws/elb/classic-without-instances.js';
import type { AwsEc2LoadBalancer } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createLoadBalancer = (overrides: Partial<AwsEc2LoadBalancer> = {}): AwsEc2LoadBalancer => ({
  accountId: '123456789012',
  attachedTargetGroupArns: [],
  instanceCount: 0,
  loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/classic-lb',
  loadBalancerName: 'classic-lb',
  loadBalancerType: 'classic',
  region: 'us-east-1',
  ...overrides,
});

describe('elbClassicWithoutInstancesRule', () => {
  it('flags Classic Load Balancers with no attached instances', () => {
    const finding = elbClassicWithoutInstancesRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancers': [createLoadBalancer()],
      }),
    });

    expect(finding?.findings).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        resourceId: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/classic-lb',
      },
    ]);
  });

  it('skips Classic Load Balancers with attached instances', () => {
    const finding = elbClassicWithoutInstancesRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancers': [createLoadBalancer({ instanceCount: 2 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips non-Classic load balancers', () => {
    const finding = elbClassicWithoutInstancesRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancers': [createLoadBalancer({ loadBalancerType: 'application' })],
      }),
    });

    expect(finding).toBeNull();
  });
});
