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
import { fetchCloudWatchSignals } from '../../src/providers/aws/resources/cloudwatch.js';
import {
  hydrateAwsEc2LoadBalancerRequestActivity,
  hydrateAwsEc2LoadBalancers,
  hydrateAwsEc2TargetGroups,
} from '../../src/providers/aws/resources/elbv2.js';
import { completeMetricEvidence } from '../helpers/cloudwatch.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  createElasticLoadBalancingClient: vi.fn(),
  createElasticLoadBalancingV2Client: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/aws/resources/cloudwatch.js')>()),
  fetchCloudWatchSignals: vi.fn(),
}));

const mockedCreateElasticLoadBalancingClient = vi.mocked(createElasticLoadBalancingClient);
const mockedCreateElasticLoadBalancingV2Client = vi.mocked(createElasticLoadBalancingV2Client);
const mockedFetchCloudWatchSignals = vi.mocked(fetchCloudWatchSignals);

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
            ListenerDescriptions: [{ Listener: { Protocol: 'HTTP' } }],
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
        listenerProtocols: ['HTTP'],
        region: 'us-east-1',
      },
    ]);
  });

  it('preserves target-group associations returned on later load-balancer lookup pages', async () => {
    const arn = 'arn:aws:elasticloadbalancing:us-east-1:111111111111:loadbalancer/app/alb/123';
    const targetArn = 'arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/later/123';
    const send = vi.fn(async (command: DescribeLoadBalancersV2Command | DescribeTargetGroupsCommand) => {
      const input = command.input as { LoadBalancerArn?: string; Marker?: string };
      if (input.LoadBalancerArn) {
        return input.Marker === 'page-2'
          ? { TargetGroups: [{ TargetGroupArn: targetArn, LoadBalancerArns: [arn] }] }
          : { TargetGroups: [], NextMarker: 'page-2' };
      }
      return { LoadBalancers: [{ LoadBalancerArn: arn, LoadBalancerName: 'alb', Type: 'application' }] };
    });
    mockedCreateElasticLoadBalancingV2Client.mockReturnValue({ send } as never);

    const result = await hydrateAwsEc2LoadBalancers([
      {
        accountId: '111111111111',
        arn,
        properties: [],
        region: 'us-east-1',
        resourceType: 'elasticloadbalancing:loadbalancer/app',
        service: 'elasticloadbalancing',
      },
    ]);

    expect(result[0]?.attachedTargetGroupArns).toEqual([targetArn]);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ input: { LoadBalancerArn: arn, Marker: 'page-2' } }));
  });

  it('does not turn a load balancer disappearing during pagination into an empty-target resource', async () => {
    const arn = 'arn:aws:elasticloadbalancing:us-east-1:111111111111:loadbalancer/app/deleted/123';
    mockedCreateElasticLoadBalancingV2Client.mockReturnValue({
      send: vi.fn(async (command) => {
        if ('LoadBalancerArn' in command.input) {
          if (command.input.Marker) throw Object.assign(new Error('deleted'), { name: 'LoadBalancerNotFound' });
          return { TargetGroups: [], NextMarker: 'page-2' };
        }
        return { LoadBalancers: [{ LoadBalancerArn: arn, LoadBalancerName: 'deleted', Type: 'application' }] };
      }),
    } as never);

    await expect(
      hydrateAwsEc2LoadBalancers([
        {
          accountId: '111111111111',
          arn,
          properties: [],
          region: 'us-east-1',
          resourceType: 'elasticloadbalancing:loadbalancer/app',
          service: 'elasticloadbalancing',
        },
      ]),
    ).resolves.toEqual([]);
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
              ListenerDescriptions: [{ Listener: { Protocol: 'HTTP' } }],
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
        listenerProtocols: ['HTTP'],
        region: 'us-east-1',
      },
    ]);
  });

  it('hydrates 14-day request activity for classic and v2 load balancers', async () => {
    mockedCreateElasticLoadBalancingClient.mockImplementation(({ region }) => {
      const send = vi.fn(async (_command: DescribeClassicLoadBalancersCommand) => ({
        LoadBalancerDescriptions: [
          {
            Instances: [{ InstanceId: 'i-123' }],
            LoadBalancerName: 'classic-lb',
            ListenerDescriptions: [{ Listener: { Protocol: 'HTTP' } }],
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
            return { TargetGroups: [] };
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
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'lb0',
          completeMetricEvidence(
            Array.from({ length: 14 }, (_, index) => ({
              timestamp: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
              value: 5,
            })),
          ),
        ],
        [
          'lb1',
          completeMetricEvidence(
            Array.from({ length: 14 }, (_, index) => ({
              timestamp: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
              value: 14,
            })),
          ),
        ],
      ]),
    );

    await expect(
      hydrateAwsEc2LoadBalancerRequestActivity([
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
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        averageRequestsPerDayLast14Days: 5,
        requestActivityStatus: 'complete',
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
        region: 'us-east-1',
      },
      {
        accountId: '123456789012',
        averageRequestsPerDayLast14Days: 14,
        requestActivityStatus: 'complete',
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/classic-lb',
        region: 'us-east-1',
      },
    ]);
  });

  it('queries HTTP requests only for ALBs and HTTP-only Classic listeners', async () => {
    const classic = (name: string, protocols?: string[]) => ({
      LoadBalancerName: name,
      Instances: [{ InstanceId: 'i-example' }],
      ListenerDescriptions: protocols?.map((Protocol) => ({ Listener: { Protocol } })),
    });
    mockedCreateElasticLoadBalancingClient.mockReturnValue({
      send: vi.fn(async () => ({
        LoadBalancerDescriptions: [
          classic('http', ['HTTP', 'HTTPS']),
          classic('tcp', ['TCP']),
          classic('mixed', ['HTTPS', 'SSL']),
          classic('unknown'),
        ],
      })),
    } as never);
    mockedCreateElasticLoadBalancingV2Client.mockReturnValue({
      send: vi.fn(async (command) => {
        if ('LoadBalancerArn' in command.input) return { TargetGroups: [] };
        return {
          LoadBalancers: [
            ['app', 'application'],
            ['net', 'network'],
            ['gwy', 'gateway'],
          ].map(([prefix, Type]) => ({
            LoadBalancerArn: `arn:aws:elasticloadbalancing:us-east-1:111111111111:loadbalancer/${prefix}/example/123`,
            LoadBalancerName: 'example',
            Type,
          })),
        };
      }),
    } as never);
    mockedFetchCloudWatchSignals.mockImplementation(
      async ({ queries }) =>
        new Map(
          queries.map((query) => [
            query.id,
            completeMetricEvidence(
              Array.from({ length: 14 }, (_, index) => ({
                timestamp: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
                value: 5,
              })),
            ),
          ]),
        ),
    );
    const resource = (suffix: string, type: string) => ({
      accountId: '111111111111',
      arn: `arn:aws:elasticloadbalancing:us-east-1:111111111111:loadbalancer/${suffix}`,
      properties: [],
      region: 'us-east-1',
      resourceType: type,
      service: 'elasticloadbalancing',
    });
    const result = await hydrateAwsEc2LoadBalancerRequestActivity([
      ...['http', 'tcp', 'mixed', 'unknown'].map((name) => resource(name, 'elasticloadbalancing:loadbalancer')),
      ...['app', 'net', 'gwy'].map((prefix) =>
        resource(`${prefix}/example/123`, `elasticloadbalancing:loadbalancer/${prefix}`),
      ),
    ]);

    expect(mockedFetchCloudWatchSignals.mock.calls[0]?.[0].queries).toEqual([
      expect.objectContaining({
        metricName: 'RequestCount',
        namespace: 'AWS/ApplicationELB',
        stat: 'Sum',
        period: 86400,
        dimensions: [{ Name: 'LoadBalancer', Value: 'app/example/123' }],
      }),
      expect.objectContaining({
        metricName: 'RequestCount',
        namespace: 'AWS/ELB',
        stat: 'Sum',
        period: 86400,
        dimensions: [{ Name: 'LoadBalancerName', Value: 'http' }],
      }),
    ]);
    expect(result.filter((activity) => activity.averageRequestsPerDayLast14Days === 5)).toHaveLength(2);
    expect(result.filter((activity) => activity.requestActivityStatus === 'unsupported')).toHaveLength(5);
    expect(
      result
        .filter((activity) => activity.requestActivityStatus === 'unsupported')
        .every((activity) => activity.averageRequestsPerDayLast14Days === null),
    ).toBe(true);
  });

  it('preserves incomplete ELB request coverage as null averages', async () => {
    mockedCreateElasticLoadBalancingV2Client.mockImplementation(({ region }) => {
      const send = vi.fn(
        async (command: DescribeLoadBalancersV2Command | DescribeTargetGroupsCommand | DescribeTargetHealthCommand) => {
          const input = command.input as { LoadBalancerArn?: string; LoadBalancerArns?: string[] };

          if ('LoadBalancerArn' in input) {
            return { TargetGroups: [] };
          }

          return {
            LoadBalancers: [
              {
                LoadBalancerArn: input.LoadBalancerArns?.[0],
                LoadBalancerName: 'alb',
                Type: 'application',
              },
            ],
          };
        },
      );

      return { send, region } as never;
    });
    mockedFetchCloudWatchSignals.mockResolvedValue(
      new Map([
        [
          'lb0',
          completeMetricEvidence([
            {
              timestamp: '2026-03-01T00:00:00.000Z',
              value: 5,
            },
          ]),
        ],
      ]),
    );

    await expect(
      hydrateAwsEc2LoadBalancerRequestActivity([
        {
          accountId: '123456789012',
          arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
          properties: [],
          region: 'us-east-1',
          resourceType: 'elasticloadbalancing:loadbalancer/app',
          service: 'elasticloadbalancing',
        },
      ]),
    ).resolves.toEqual([
      {
        accountId: '123456789012',
        averageRequestsPerDayLast14Days: null,
        requestActivityStatus: 'unknown',
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
        region: 'us-east-1',
      },
    ]);
  });

  it('loads per-load-balancer target groups concurrently with a bounded worker pool', async () => {
    let currentInFlight = 0;
    let maxInFlight = 0;

    mockedCreateElasticLoadBalancingV2Client.mockImplementation(({ region }) => {
      const send = vi.fn(
        async (command: DescribeLoadBalancersV2Command | DescribeTargetGroupsCommand) =>
          new Promise((resolve) => {
            const input = command.input as { LoadBalancerArn?: string; LoadBalancerArns?: string[] };

            if (input.LoadBalancerArn === undefined) {
              resolve({
                LoadBalancers: (input.LoadBalancerArns ?? []).map((loadBalancerArn) => ({
                  LoadBalancerArn: loadBalancerArn,
                  LoadBalancerName: loadBalancerArn.split('/')[2],
                  Type: 'application',
                })),
              });
              return;
            }

            currentInFlight += 1;
            maxInFlight = Math.max(maxInFlight, currentInFlight);

            setTimeout(() => {
              currentInFlight -= 1;
              resolve({
                TargetGroups: [
                  {
                    TargetGroupArn: `arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/tg-${input.LoadBalancerArn?.split('/')[2]}/1`,
                  },
                ],
              });
            }, 1);
          }),
      );

      return { send, region } as never;
    });

    const resources = Array.from({ length: 25 }, (_, index) => ({
      accountId: '123456789012',
      arn: `arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb-${index}/id-${index}`,
      properties: [],
      region: 'us-east-1',
      resourceType: 'elasticloadbalancing:loadbalancer/app',
      service: 'elasticloadbalancing',
    }));

    const loadBalancers = await hydrateAwsEc2LoadBalancers(resources);

    expect(loadBalancers).toHaveLength(25);
    expect(loadBalancers.every((loadBalancer) => loadBalancer.attachedTargetGroupArns.length === 1)).toBe(true);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(10);
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

  it('hydrates selected target groups and their relationships from later pages', async () => {
    const arn = 'arn:aws:elasticloadbalancing:us-east-1:111111111111:targetgroup/later/123';
    const lbArn = 'arn:aws:elasticloadbalancing:us-east-1:111111111111:loadbalancer/app/alb/123';
    const send = vi.fn(async (command: DescribeTargetGroupsCommand | DescribeTargetHealthCommand) => {
      const input = command.input as { TargetGroupArn?: string; Marker?: string };
      if (input.TargetGroupArn) return { TargetHealthDescriptions: [{ Target: { Id: 'i-example' } }] };
      return input.Marker === 'page-2'
        ? { TargetGroups: [{ TargetGroupArn: arn, LoadBalancerArns: [lbArn] }, { TargetGroupArn: 'unselected' }] }
        : { TargetGroups: [], NextMarker: 'page-2' };
    });
    mockedCreateElasticLoadBalancingV2Client.mockReturnValue({ send } as never);

    const result = await hydrateAwsEc2TargetGroups([
      {
        accountId: '111111111111',
        arn,
        properties: [],
        region: 'us-east-1',
        resourceType: 'elasticloadbalancing:targetgroup',
        service: 'elasticloadbalancing',
      },
    ]);

    expect(result).toEqual([
      {
        accountId: '111111111111',
        targetGroupArn: arn,
        region: 'us-east-1',
        loadBalancerArns: [lbArn],
        registeredTargetCount: 1,
      },
    ]);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ input: { TargetGroupArns: [arn], Marker: 'page-2' } }));
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
