import { describe, expect, it } from 'vitest';
import { elbIdleRule } from '../src/aws/elb/idle.js';
import type {
  AwsEc2LoadBalancer,
  AwsEc2LoadBalancerRequestActivity,
  AwsEc2TargetGroup,
} from '../src/index.js';
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
  registeredTargetCount: 1,
  targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123',
  ...overrides,
});

const createActivity = (
  overrides: Partial<AwsEc2LoadBalancerRequestActivity> = {},
): AwsEc2LoadBalancerRequestActivity => ({
  accountId: '123456789012',
  averageRequestsPerDayLast14Days: 9,
  loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
  region: 'us-east-1',
  ...overrides,
});

describe('elbIdleRule', () => {
  it('flags load balancers averaging fewer than 10 requests per day over 14 days', () => {
    const finding = elbIdleRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancer-request-activity': [createActivity()],
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

  it('skips load balancers with incomplete metric coverage', () => {
    const finding = elbIdleRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancer-request-activity': [createActivity({ averageRequestsPerDayLast14Days: null })],
        'aws-ec2-load-balancers': [createLoadBalancer()],
        'aws-ec2-target-groups': [createTargetGroup()],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips load balancers already caught by empty-target cleanup rules', () => {
    const finding = elbIdleRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancer-request-activity': [createActivity()],
        'aws-ec2-load-balancers': [createLoadBalancer()],
        'aws-ec2-target-groups': [createTargetGroup({ registeredTargetCount: 0 })],
      }),
    });

    expect(finding).toBeNull();
  });

  it('skips load balancers with 10 or more average daily requests', () => {
    const finding = elbIdleRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ec2-load-balancer-request-activity': [createActivity({ averageRequestsPerDayLast14Days: 10 })],
        'aws-ec2-load-balancers': [createLoadBalancer()],
        'aws-ec2-target-groups': [createTargetGroup()],
      }),
    });

    expect(finding).toBeNull();
  });
});
