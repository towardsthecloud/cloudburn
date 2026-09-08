import { describe, expect, it } from 'vitest';
import { elbIdleRule } from '../src/aws/elb/idle.js';
import type { AwsEc2LoadBalancer, AwsEc2LoadBalancerRequestActivity, AwsEc2TargetGroup } from '../src/index.js';
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

const createContext = (
  loadBalancer: AwsEc2LoadBalancer,
  activity: AwsEc2LoadBalancerRequestActivity = createActivity(),
  targetGroup: AwsEc2TargetGroup = createTargetGroup(),
) => ({
  catalog: { indexType: 'LOCAL' as const, resources: [], searchRegion: 'us-east-1' },
  resources: new LiveResourceBag({
    'aws-ec2-load-balancer-request-activity': [activity],
    'aws-ec2-load-balancers': [loadBalancer],
    'aws-ec2-target-groups': [targetGroup],
  }),
});

const loadBalancerMatch = {
  accountId: '123456789012',
  region: 'us-east-1',
  resourceId: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
};

describe('elbIdleRule', () => {
  it('defers an empty HTTP Classic load balancer to its cleanup rule', () => {
    const context = createContext(
      createLoadBalancer({ listenerProtocols: ['HTTP'], loadBalancerType: 'classic' }),
      createActivity({ requestActivityStatus: 'complete' }),
    );

    expect(elbIdleRule.evaluateLive?.(context)).toBeNull();
    expect(elbIdleRule.getLiveEvaluationCoverage?.(context)).toEqual({
      assessed: [loadBalancerMatch],
      unknown: [],
    });
  });

  it('requires numeric request evidence even when activity is marked complete', () => {
    const context = createContext(
      createLoadBalancer(),
      createActivity({ averageRequestsPerDayLast14Days: null, requestActivityStatus: 'complete' }),
    );

    expect(elbIdleRule.evaluateLive?.(context)).toBeNull();
    expect(elbIdleRule.getLiveEvaluationCoverage?.(context)).toEqual({
      assessed: [],
      unknown: [loadBalancerMatch],
    });
  });

  it.each([
    { loadBalancerType: 'application' as const },
    { listenerProtocols: ['HTTP'], loadBalancerType: 'classic' as const },
    { listenerProtocols: ['HTTPS'], loadBalancerType: 'classic' as const },
    { listenerProtocols: ['HTTP', 'HTTPS'], loadBalancerType: 'classic' as const },
  ])('assesses HTTP request activity for $loadBalancerType with $listenerProtocols', (overrides) => {
    for (const requestActivityStatus of ['complete', undefined] as const) {
      const context = createContext(
        createLoadBalancer({ instanceCount: 1, ...overrides }),
        createActivity({ requestActivityStatus }),
      );

      expect(elbIdleRule.evaluateLive?.(context)?.findings).toEqual([loadBalancerMatch]);
      expect(elbIdleRule.getLiveEvaluationCoverage?.(context)).toEqual({
        assessed: [loadBalancerMatch],
        unknown: [],
      });
    }
  });

  it.each([
    'application',
    'network',
    'gateway',
    'classic',
  ] as const)('assesses empty %s load balancers through cleanup evidence despite unsupported request activity', (loadBalancerType) => {
    const context = createContext(
      createLoadBalancer({ loadBalancerType }),
      createActivity({ averageRequestsPerDayLast14Days: null, requestActivityStatus: 'unsupported' }),
      createTargetGroup({ registeredTargetCount: 0 }),
    );

    expect(elbIdleRule.evaluateLive?.(context)).toBeNull();
    expect(elbIdleRule.getLiveEvaluationCoverage?.(context)).toEqual({
      assessed: [loadBalancerMatch],
      unknown: [],
    });
  });

  it('does not treat unknown attached target groups as cleanup evidence', () => {
    const context = createContext(
      createLoadBalancer({
        attachedTargetGroupArns: [createTargetGroup().targetGroupArn, 'unknown-target-group'],
        loadBalancerType: 'network',
      }),
      createActivity(),
      createTargetGroup({ registeredTargetCount: 0 }),
    );

    expect(elbIdleRule.evaluateLive?.(context)).toBeNull();
    expect(elbIdleRule.getLiveEvaluationCoverage?.(context)).toEqual({
      assessed: [],
      unknown: [loadBalancerMatch],
    });
  });

  it('leaves inventories with missing activity unknown and ignores activity outside inventory', () => {
    const context = createContext(createLoadBalancer(), createActivity({ loadBalancerArn: 'not-in-inventory' }));

    expect(elbIdleRule.evaluateLive?.(context)).toBeNull();
    expect(elbIdleRule.getLiveEvaluationCoverage?.(context)).toEqual({
      assessed: [],
      unknown: [loadBalancerMatch],
    });
  });

  it('assesses a non-idle HTTP load balancer at the 10 requests per day boundary', () => {
    const context = createContext(
      createLoadBalancer(),
      createActivity({ averageRequestsPerDayLast14Days: 10, requestActivityStatus: 'complete' }),
    );

    expect(elbIdleRule.evaluateLive?.(context)).toBeNull();
    expect(elbIdleRule.getLiveEvaluationCoverage?.(context)).toEqual({
      assessed: [loadBalancerMatch],
      unknown: [],
    });
  });

  it.each([
    'unknown',
    'unsupported',
  ] as const)('leaves explicitly %s request activity unknown despite numeric request counts', (requestActivityStatus) => {
    const context = createContext(createLoadBalancer(), createActivity({ requestActivityStatus }));

    expect(elbIdleRule.evaluateLive?.(context)).toBeNull();
    expect(elbIdleRule.getLiveEvaluationCoverage?.(context)).toEqual({
      assessed: [],
      unknown: [loadBalancerMatch],
    });
  });

  it.each([
    { listenerProtocols: ['TCP'] },
    { listenerProtocols: ['SSL'] },
    { listenerProtocols: ['HTTP', 'TCP'] },
    { listenerProtocols: [] },
    { listenerProtocols: undefined },
  ])('leaves Classic load balancers without exclusively HTTP listeners unknown ($listenerProtocols)', ({
    listenerProtocols,
  }) => {
    const context = createContext(
      createLoadBalancer({ instanceCount: 1, listenerProtocols, loadBalancerType: 'classic' }),
    );

    expect(elbIdleRule.evaluateLive?.(context)).toBeNull();
    expect(elbIdleRule.getLiveEvaluationCoverage?.(context)).toEqual({
      assessed: [],
      unknown: [loadBalancerMatch],
    });
  });

  it.each([
    'network',
    'gateway',
  ] as const)('leaves %s load balancers unknown despite low numeric request activity', (loadBalancerType) => {
    const context = createContext(createLoadBalancer({ loadBalancerType }));

    expect(elbIdleRule.evaluateLive?.(context)).toBeNull();
    expect(elbIdleRule.getLiveEvaluationCoverage?.(context)).toEqual({
      assessed: [],
      unknown: [loadBalancerMatch],
    });
  });

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
