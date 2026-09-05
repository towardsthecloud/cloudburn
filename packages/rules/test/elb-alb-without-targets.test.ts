import { describe, expect, it } from 'vitest';
import { elbAlbWithoutTargetsRule } from '../src/aws/elb/alb-without-targets.js';
import type { AwsEc2LoadBalancer, AwsEc2TargetGroup } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createLoadBalancer = (overrides: Partial<AwsEc2LoadBalancer> = {}): AwsEc2LoadBalancer => ({
  accountId: '123456789012',
  attachedTargetGroupArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123'],
  instanceCount: 0,
  loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
  loadBalancerName: 'alb',
  loadBalancerType: 'application',
  region: 'us-east-1',
  ...overrides,
});

const createTargetGroup = (overrides: Partial<AwsEc2TargetGroup> = {}): AwsEc2TargetGroup => ({
  accountId: '123456789012',
  loadBalancerArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123'],
  region: 'us-east-1',
  registeredTargetCount: 0,
  targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123',
  ...overrides,
});

describe('elbAlbWithoutTargetsRule', () => {
  it('flags ALBs with no attached target groups', () => {
    const finding = elbAlbWithoutTargetsRule.evaluateLive?.({
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
        resourceId: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
      },
    ]);
  });

  it('flags ALBs whose attached target groups have no registered targets', () => {
    const finding = elbAlbWithoutTargetsRule.evaluateLive?.({
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
        resourceId: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
      },
    ]);
  });

  it('looks up target groups in linear work for a large load-balancer fleet', () => {
    const size = 500;
    let targetGroupReads = 0;
    const finding = elbAlbWithoutTargetsRule.evaluateLive?.({
      catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'us-east-1' },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancers': Array.from({ length: size }, (_, index) =>
          createLoadBalancer({ loadBalancerArn: `lb-${index}`, attachedTargetGroupArns: [`tg-${index}`] }),
        ),
        'aws-ec2-target-groups': Array.from({ length: size }, (_, index) => ({
          ...createTargetGroup(),
          get targetGroupArn() {
            targetGroupReads += 1;
            return `tg-${index}`;
          },
        })),
      }),
    });
    expect(finding?.findings).toHaveLength(size);
    expect(targetGroupReads).toBeLessThanOrEqual(size * 3);
  });

  it('skips ALBs with registered targets', () => {
    const finding = elbAlbWithoutTargetsRule.evaluateLive?.({
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

  it('skips ALBs when any attached target group is missing from the hydrated dataset', () => {
    const finding = elbAlbWithoutTargetsRule.evaluateLive?.({
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
