import {
  GetRecommendationCommand,
  ListEnrollmentStatusesCommand,
  ListRecommendationsCommand,
} from '@aws-sdk/client-cost-optimization-hub';
import { createAwsCostOptimizationHubFindingMatch } from '@cloudburn/rules';
import { beforeEach, expect, it, vi } from 'vitest';
import { createCostOptimizationHubClient } from '../../src/providers/aws/client.js';
import { hydrateAwsCostOptimizationHubRightsizingRecommendations } from '../../src/providers/aws/resources/cost-optimization-hub.js';

vi.mock('../../src/providers/aws/client.js', () => ({ createCostOptimizationHubClient: vi.fn() }));
const accountId = '123456789012';
const common = {
  accountId,
  region: 'eu-west-1',
  actionType: 'Rightsize',
  currentResourceType: 'Ec2Instance',
  resourceId: 'i-example',
  resourceArn: `arn:aws:ec2:eu-west-1:${accountId}:instance/i-example`,
  recommendationId: 'rec-1',
  currencyCode: 'USD',
  estimatedMonthlyCost: 100,
  estimatedMonthlySavings: 50,
  estimatedSavingsPercentage: 50,
  source: 'ComputeOptimizer',
  lastRefreshTimestamp: new Date('2026-09-04T00:00:00.000Z'),
  implementationEffort: 'Medium',
  restartNeeded: true,
  rollbackPossible: false,
};
beforeEach(() => vi.resetAllMocks());
const ecsArn = (service: string) => `arn:aws:ecs:eu-west-1:${accountId}:service/${service}`;
it.each([
  ['api', undefined, 'api', ecsArn('cluster-a/api'), 'cluster-a/api'],
  ['api', undefined, undefined, ecsArn('cluster-a/api'), 'cluster-a/api'],
  ['api', undefined, 'cluster-a/api', undefined, 'cluster-a/api'],
  ['api', ecsArn('api'), 'api', ecsArn('cluster-a/api'), 'cluster-a/api'],
  ['cluster-a/api', ecsArn('api'), 'api', ecsArn('cluster-a/api'), 'cluster-a/api'],
  ['cluster-a/api', undefined, 'api', ecsArn('api'), 'cluster-a/api'],
  [undefined, ecsArn('api'), 'cluster-a/api', undefined, 'cluster-a/api'],
  ['api', undefined, 'api', undefined, 'api'],
  ['api', undefined, 'api', ecsArn('api'), 'api'],
  ['api', ecsArn('api'), 'api', ecsArn('api'), 'api'],
  ['api', undefined, 'api', ecsArn('cluster-a/other'), null],
  ['cluster-a/api', undefined, 'cluster-b/api', ecsArn('cluster-b/api'), null],
  ['api', undefined, 'cluster-a/api', ecsArn('cluster-b/api'), null],
  ['cluster-a/api', ecsArn('cluster-b/api'), 'api', undefined, null],
  ['api', undefined, 'api', 'arn:aws:ecs:eu-west-1:222222222222:service/cluster-a/api', null],
  ['api', undefined, 'api', `arn:aws:ecs:us-east-1:${accountId}:service/cluster-a/api`, null],
])(
  'enriches compatible ECS detail identity and rejects contradictory scope (%j, %j, %j, %j)',
  async (resourceId, resourceArn, detailId, detailArn, expectedResourceId) => {
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
        if (command instanceof ListRecommendationsCommand) {
          return {
            items: [
              {
                ...common,
                currentResourceType: 'EcsService',
                resourceId,
                resourceArn,
                estimatedMonthlyCost: undefined,
              },
            ],
          };
        }
        if (command instanceof GetRecommendationCommand) {
          return {
            ...common,
            currentResourceType: 'EcsService',
            resourceId: detailId,
            resourceArn: detailArn,
            currentResourceDetails: { ecsService: { configuration: { compute: { memorySizeInMB: 1024, vCpu: 1 } } } },
            recommendedResourceDetails: {
              ecsService: { configuration: { compute: { memorySizeInMB: 512, vCpu: 0.5 } } },
            },
          };
        }
        throw new Error('Unexpected command');
      }),
    } as never);
    const result = await hydrateAwsCostOptimizationHubRightsizingRecommendations([], {
      resolveAccountId: async () => accountId,
    });
    if (expectedResourceId === null) {
      expect(result).toMatchObject({
        unavailable: true,
        resources: [],
        diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
      });
      return;
    }
    expect(result).toHaveLength(1);
    const normalized = (Array.isArray(result) ? result : [])[0];
    if (!normalized) throw new Error('Expected one normalized recommendation');
    expect(normalized).toMatchObject({ resourceId: expectedResourceId, estimatedMonthlyCost: 100 });
    expect(normalized.resourceArn).toBe(resourceArn ?? detailArn);
    const finding = createAwsCostOptimizationHubFindingMatch(normalized);
    expect(finding.resourceId).toBe(expectedResourceId);
    if (expectedResourceId === 'api') expect(finding.recommendation?.resourceKey).toBeUndefined();
    else expect(finding.recommendation?.resourceKey).toContain('cluster-a/api');
    expect(finding.impact?.currentCost).toMatchObject({
      amount: 100,
      confidence: 'estimated',
      currency: 'USD',
      period: 'month',
    });
  },
);

const lambdaArn = `arn:aws:lambda:eu-west-1:${accountId}:function:example`;
it.each([
  [undefined, true],
  ['example', true],
  ['example:production', true],
  [`${lambdaArn}:3`, true],
  ['other', false],
  ['other:production', false],
  [`arn:aws:lambda:eu-west-1:${accountId}:function:other`, false],
  ['arn:aws:lambda:eu-west-1:222222222222:function:example', false],
  [`arn:aws:lambda:us-east-1:${accountId}:function:example`, false],
] as const)('validates Lambda resource ID %s before promoting its ARN', async (resourceId, compatible) => {
  const resourceArn = `${lambdaArn}:production`;
  vi.mocked(createCostOptimizationHubClient).mockReturnValue({
    send: vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
      if (command instanceof ListRecommendationsCommand) {
        return { items: [{ ...common, currentResourceType: 'LambdaFunction', resourceId, resourceArn }] };
      }
      if (command instanceof GetRecommendationCommand) {
        return {
          ...(compatible ? { resourceId, resourceArn } : {}),
          currentResourceDetails: { lambdaFunction: { configuration: { compute: { memorySizeInMB: 1024 } } } },
          recommendedResourceDetails: { lambdaFunction: { configuration: { compute: { memorySizeInMB: 512 } } } },
        };
      }
      throw new Error('Unexpected command');
    }),
  } as never);
  const result = await hydrateAwsCostOptimizationHubRightsizingRecommendations([], {
    resolveAccountId: async () => accountId,
  });
  const normalized = (Array.isArray(result) ? result : [])[0];
  if (!normalized) throw new Error('Expected one normalized recommendation');
  expect(normalized.resourceId).toBe(compatible ? lambdaArn : resourceId);
  const finding = createAwsCostOptimizationHubFindingMatch(normalized);
  expect(finding.resourceId).toBe(compatible ? lambdaArn : resourceId);
  if (compatible) expect(finding.recommendation?.resourceKey).toContain(lambdaArn);
  else {
    expect(finding.recommendation?.resourceKey).toBeUndefined();
    expect(finding.recommendation?.opportunityId).toBeUndefined();
  }
});
it.each([
  ['example', 'example', `${lambdaArn}:production`, true],
  [`${lambdaArn}:production`, 'example', undefined, true],
  ['example:production', undefined, `${lambdaArn}:3`, true],
  ['other', 'example', `${lambdaArn}:production`, false],
  [lambdaArn, 'other', undefined, false],
  ['example', 'example', 'arn:aws:lambda:eu-west-1:222222222222:function:example', false],
] as const)(
  'prefers compatible Lambda ARN evidence without a summary ARN (%s, %s, %s)',
  async (resourceId, detailId, detailArn, compatible) => {
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
        if (command instanceof ListRecommendationsCommand) {
          return { items: [{ ...common, currentResourceType: 'LambdaFunction', resourceId, resourceArn: undefined }] };
        }
        if (command instanceof GetRecommendationCommand) {
          return {
            resourceId: detailId,
            resourceArn: detailArn,
            currentResourceDetails: { lambdaFunction: { configuration: { compute: { memorySizeInMB: 1024 } } } },
            recommendedResourceDetails: { lambdaFunction: { configuration: { compute: { memorySizeInMB: 512 } } } },
          };
        }
        throw new Error('Unexpected command');
      }),
    } as never);
    const result = await hydrateAwsCostOptimizationHubRightsizingRecommendations([], {
      resolveAccountId: async () => accountId,
    });
    if (!compatible) {
      expect(result).toMatchObject({
        unavailable: true,
        resources: [],
        diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
      });
      return;
    }
    const normalized = (Array.isArray(result) ? result : [])[0];
    if (!normalized) throw new Error('Expected one normalized recommendation');
    expect(normalized.resourceId).toBe(lambdaArn);
    const finding = createAwsCostOptimizationHubFindingMatch(normalized);
    expect(finding.recommendation?.resourceKey).toContain(lambdaArn);
    expect(finding.impact?.currentCost).toMatchObject({
      amount: 100,
      confidence: 'estimated',
      currency: 'USD',
      period: 'month',
    });
  },
);

it.each([undefined, 'not-an-arn'])('rejects missing regional identity with ARN %s', async (resourceArn) => {
  vi.mocked(createCostOptimizationHubClient).mockReturnValue({
    send: vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
      if (command instanceof ListRecommendationsCommand)
        return { items: [{ ...common, region: undefined, resourceArn }] };
      return {
        currentResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.xlarge' } } } },
        recommendedResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.large' } } } },
      };
    }),
  } as never);
  expect(
    await hydrateAwsCostOptimizationHubRightsizingRecommendations([], { resolveAccountId: async () => accountId }),
  ).toMatchObject({
    unavailable: true,
    resources: [],
    diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
  });
});
it.each(['', ':3', ':production'])(
  'derives the Region and canonical Lambda identity from ARN qualifier %s',
  async (qualifier) => {
    const functionArn = `arn:aws:lambda:eu-west-1:${accountId}:function:example`;
    const resourceArn = functionArn + qualifier;
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
        if (command instanceof ListRecommendationsCommand)
          return {
            items: [
              {
                ...common,
                region: undefined,
                resourceId: undefined,
                resourceArn,
                currentResourceType: 'LambdaFunction',
              },
            ],
          };
        return {
          currentResourceDetails: { lambdaFunction: { configuration: { compute: { memorySizeInMB: 1024 } } } },
          recommendedResourceDetails: { lambdaFunction: { configuration: { compute: { memorySizeInMB: 512 } } } },
        };
      }),
    } as never);
    expect(
      await hydrateAwsCostOptimizationHubRightsizingRecommendations([], { resolveAccountId: async () => accountId }),
    ).toEqual([expect.objectContaining({ region: 'eu-west-1', resourceId: functionArn, resourceArn })]);
  },
);
it('paginates, deduplicates IDs, and uses identical account, action, and resource filters on every page', async () => {
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
    if (command instanceof ListRecommendationsCommand)
      return command.input.nextToken
        ? { items: [common, { ...common, recommendationId: 'rec-2' }] }
        : { items: [common], nextToken: 'page-2' };
    return {
      currentResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.xlarge' } } } },
      recommendedResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.large' } } } },
    };
  });
  vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
  expect(
    await hydrateAwsCostOptimizationHubRightsizingRecommendations([], { resolveAccountId: async () => accountId }),
  ).toMatchObject([{ recommendationId: 'rec-1' }, { recommendationId: 'rec-2' }]);
  expect(send.mock.calls.filter(([command]) => command instanceof GetRecommendationCommand)).toHaveLength(2);
  const pages = send.mock.calls
    .map(([command]) => command)
    .filter((command) => command instanceof ListRecommendationsCommand);
  expect(pages.map((command) => command.input)).toEqual(
    [undefined, 'page-2'].map((nextToken) => ({
      filter: {
        accountIds: [accountId],
        actionTypes: ['Rightsize'],
        resourceTypes: [
          'Ec2Instance',
          'Ec2AutoScalingGroup',
          'EbsVolume',
          'LambdaFunction',
          'EcsService',
          'RdsDbInstance',
          'RdsDbInstanceStorage',
          'AuroraDbClusterStorage',
        ],
      },
      includeAllRecommendations: false,
      maxResults: 1000,
      nextToken,
    })),
  );
});
it.each(['enrollment', 'list', 'detail', 'unenrolled', 'clean'])(
  'distinguishes %s evidence availability',
  async (state) => {
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: vi.fn(async (command: unknown) => {
        const operation =
          command instanceof ListEnrollmentStatusesCommand
            ? 'enrollment'
            : command instanceof ListRecommendationsCommand
              ? 'list'
              : 'detail';
        if (state === operation) throw Object.assign(new Error('Access denied'), { name: 'AccessDeniedException' });
        if (operation === 'enrollment')
          return { items: [{ accountId, status: state === 'unenrolled' ? 'Inactive' : 'Active' }] };
        if (operation === 'list') return { items: state === 'clean' ? [] : [common] };
        throw new Error('Unexpected detail request');
      }),
    } as never);
    const result = await hydrateAwsCostOptimizationHubRightsizingRecommendations([], {
      resolveAccountId: async () => accountId,
    });
    if (state === 'clean') expect(result).toEqual([]);
    else
      expect(result).toMatchObject({
        unavailable: true,
        resources: [],
        diagnostics: [
          {
            code: state === 'unenrolled' ? 'CostOptimizationHubNotEnrolled' : 'AccessDeniedException',
            status: state === 'unenrolled' ? 'skipped' : 'access_denied',
          },
        ],
      });
  },
);
it.each(['Upgrade', 'MigrateToGraviton', 'Stop', 'ScaleIn'])(
  'never reports a %s action as rightsizing',
  async (actionType) => {
    const send = vi.fn(async (command: unknown) =>
      command instanceof ListEnrollmentStatusesCommand
        ? { items: [{ accountId, status: 'Active' }] }
        : { items: [{ ...common, actionType }] },
    );
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
    expect(
      await hydrateAwsCostOptimizationHubRightsizingRecommendations([], { resolveAccountId: async () => accountId }),
    ).toMatchObject({ resources: [], unavailable: true });
    expect(send.mock.calls.some(([command]) => command instanceof GetRecommendationCommand)).toBe(false);
  },
);
it('retains valid recommendations when another detail is unavailable', async () => {
  vi.mocked(createCostOptimizationHubClient).mockReturnValue({
    send: vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
      if (command instanceof ListRecommendationsCommand)
        return { items: [common, { ...common, recommendationId: 'rec-bad' }] };
      if (command instanceof GetRecommendationCommand && command.input.recommendationId === 'rec-bad') return {};
      return {
        currentResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.xlarge' } } } },
        recommendedResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.large' } } } },
      };
    }),
  } as never);
  expect(
    await hydrateAwsCostOptimizationHubRightsizingRecommendations([], { resolveAccountId: async () => accountId }),
  ).toMatchObject({
    unavailable: true,
    resources: [{ recommendationId: 'rec-1' }],
    diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
  });
});
it.each([undefined, 'example'])(
  'uses the Lambda ARN for native-rule identity when AWS resourceId is %s',
  async (resourceId) => {
    const resourceArn = `arn:aws:lambda:eu-west-1:${accountId}:function:example`;
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
        if (command instanceof ListRecommendationsCommand)
          return { items: [{ ...common, resourceId, resourceArn, currentResourceType: 'LambdaFunction' }] };
        return {
          currentResourceDetails: { lambdaFunction: { configuration: { compute: { memorySizeInMB: 1024 } } } },
          recommendedResourceDetails: { lambdaFunction: { configuration: { compute: { memorySizeInMB: 512 } } } },
        };
      }),
    } as never);
    expect(
      await hydrateAwsCostOptimizationHubRightsizingRecommendations([], { resolveAccountId: async () => accountId }),
    ).toEqual([expect.objectContaining({ resourceId: resourceArn, resourceArn })]);
  },
);
it.each([
  ['Ec2Instance', 'ec2Instance', { instance: {} }],
  ['Ec2AutoScalingGroup', 'ec2AutoScalingGroup', { mixedInstances: [{ type: 'm7i.large' }, {}] }],
  ['EbsVolume', 'ebsVolume', { storage: { type: 'gp3', sizeInGb: Number.NaN } }],
  ['LambdaFunction', 'lambdaFunction', { compute: { memorySizeInMB: Number.POSITIVE_INFINITY } }],
  ['EcsService', 'ecsService', { compute: { memorySizeInMB: 1024 } }],
  ['RdsDbInstance', 'rdsDbInstance', { instance: {} }],
  ['RdsDbInstanceStorage', 'rdsDbInstanceStorage', { storageType: 'gp3', allocatedStorageInGb: 100, iops: Number.NaN }],
  ['AuroraDbClusterStorage', 'auroraDbClusterStorage', { storageType: '' }],
])('reports malformed %s configuration as unavailable', async (resourceType, detailKey, configuration) => {
  vi.mocked(createCostOptimizationHubClient).mockReturnValue({
    send: vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
      if (command instanceof ListRecommendationsCommand)
        return { items: [{ ...common, currentResourceType: resourceType }] };
      return {
        currentResourceDetails: { [detailKey as string]: { configuration } },
        recommendedResourceDetails: { [detailKey as string]: { configuration } },
      };
    }),
  } as never);
  expect(
    await hydrateAwsCostOptimizationHubRightsizingRecommendations([], { resolveAccountId: async () => accountId }),
  ).toMatchObject({
    unavailable: true,
    resources: [],
    diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
  });
});
it.each([
  [
    'Ec2AutoScalingGroup',
    'ec2AutoScalingGroup',
    { instance: { type: 'm7i.xlarge' }, type: 'SingleInstanceType', allocationStrategy: 'Prioritized' },
    {
      mixedInstances: [{ type: 'm7i.large' }, { type: 'm6i.large' }],
      type: 'MixedInstanceTypes',
      allocationStrategy: 'LowestPrice',
    },
  ],
  [
    'EbsVolume',
    'ebsVolume',
    {
      storage: { type: 'gp3', sizeInGb: 100 },
      performance: { iops: 6000, throughput: 250 },
      attachmentState: 'attached',
    },
    {
      storage: { type: 'gp3', sizeInGb: 100 },
      performance: { iops: 3000, throughput: 125 },
      attachmentState: 'attached',
    },
  ],
  [
    'LambdaFunction',
    'lambdaFunction',
    { compute: { memorySizeInMB: 1024, architecture: 'x86_64', platform: 'Linux' } },
    { compute: { memorySizeInMB: 512, architecture: 'x86_64', platform: 'Linux' } },
  ],
  [
    'EcsService',
    'ecsService',
    { compute: { memorySizeInMB: 4096, vCpu: 2, architecture: 'X86_64', platform: 'Linux' } },
    { compute: { memorySizeInMB: 2048, vCpu: 1, architecture: 'X86_64', platform: 'Linux' } },
  ],
  [
    'RdsDbInstance',
    'rdsDbInstance',
    { instance: { dbInstanceClass: 'db.r7g.xlarge' } },
    { instance: { dbInstanceClass: 'db.r7g.large' } },
  ],
  [
    'RdsDbInstanceStorage',
    'rdsDbInstanceStorage',
    { storageType: 'gp3', allocatedStorageInGb: 200, iops: 6000, storageThroughput: 250 },
    { storageType: 'gp3', allocatedStorageInGb: 200, iops: 3000, storageThroughput: 125 },
  ],
  ['AuroraDbClusterStorage', 'auroraDbClusterStorage', { storageType: 'aurora-iopt1' }, { storageType: 'aurora' }],
])(
  'preserves both complete %s configurations',
  async (resourceType, detailKey, currentConfiguration, recommendedConfiguration) => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
      if (command instanceof ListRecommendationsCommand)
        return { items: [{ ...common, currentResourceType: resourceType }] };
      return {
        currentResourceDetails: { [detailKey as string]: { configuration: currentConfiguration } },
        recommendedResourceDetails: { [detailKey as string]: { configuration: recommendedConfiguration } },
      };
    });
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
    expect(
      await hydrateAwsCostOptimizationHubRightsizingRecommendations([], { resolveAccountId: async () => accountId }),
    ).toEqual([expect.objectContaining({ resourceType, currentConfiguration, recommendedConfiguration })]);
  },
);
it.each([
  [{ resourceId: 'i-other' }, null],
  [{ resourceArn: `arn:aws:ec2:eu-west-1:${accountId}:instance/i-other` }, null],
  [
    {
      resourceId: 'i-other',
      resourceArn: `arn:aws:ec2:eu-west-1:${accountId}:instance/i-other`,
    },
    null,
  ],
  [{ resourceArn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-example' }, null],
  [{ resourceArn: 'arn:aws:ec2:eu-west-1:222222222222:instance/i-example' }, null],
  [{ resourceId: 'i-other', currencyCode: 'EUR' }, null],
  [{ resourceId: common.resourceArn }, 80],
  [{ resourceArn: common.resourceArn }, 80],
  [{}, 80],
])(
  'rejects conflicting detail resources before exposing configuration or impact (%j)',
  async (detailIdentity, expectedCost) => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) {
        return { items: [{ accountId, status: 'Active' }] };
      }
      if (command instanceof ListRecommendationsCommand) {
        return { items: [{ ...common, estimatedMonthlyCost: undefined }] };
      }
      if (command instanceof GetRecommendationCommand) {
        return {
          recommendationId: common.recommendationId,
          accountId,
          region: common.region,
          actionType: common.actionType,
          currentResourceType: common.currentResourceType,
          source: common.source,
          lastRefreshTimestamp: common.lastRefreshTimestamp,
          currencyCode: 'USD',
          estimatedMonthlyCost: 80,
          estimatedMonthlySavings: 99,
          costCalculationLookbackPeriodInDays: 30,
          currentResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.xlarge' } } } },
          recommendedResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.large' } } } },
          ...detailIdentity,
        };
      }
      throw new Error('Unexpected command');
    });
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
    const result = await hydrateAwsCostOptimizationHubRightsizingRecommendations([], {
      resolveAccountId: async () => accountId,
    });
    if (expectedCost === null) {
      expect(result).toMatchObject({
        unavailable: true,
        resources: [],
        diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
      });
      return;
    }
    expect(result).toEqual([
      expect.objectContaining({
        resourceId: 'i-example',
        resourceArn: common.resourceArn,
        currencyCode: 'USD',
        estimatedMonthlySavings: 50,
        estimatedMonthlyCost: expectedCost,
      }),
    ]);
    const normalized = (Array.isArray(result) ? result : [])[0];
    if (!normalized) throw new Error('expected one normalized recommendation');
    expect(normalized).toMatchObject({ costCalculationLookbackPeriodInDays: 30 });
    const impact = createAwsCostOptimizationHubFindingMatch(normalized).impact;
    expect(impact?.currentCost).toMatchObject({
      amount: 80,
      confidence: 'estimated',
      currency: 'USD',
      period: 'month',
    });
    expect(impact?.potentialSavings).toMatchObject({
      amount: 50,
      confidence: 'estimated',
      currency: 'USD',
      period: 'month',
    });
  },
);
it('rejects detail whose reported Region conflicts with the ARN-derived Region', async () => {
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof ListEnrollmentStatusesCommand) {
      return { items: [{ accountId, status: 'Active' }] };
    }
    if (command instanceof ListRecommendationsCommand) {
      return { items: [{ ...common, region: undefined }] };
    }
    if (command instanceof GetRecommendationCommand) {
      return {
        recommendationId: common.recommendationId,
        accountId,
        region: 'us-east-1',
        actionType: common.actionType,
        currentResourceType: common.currentResourceType,
        source: common.source,
        lastRefreshTimestamp: common.lastRefreshTimestamp,
        currencyCode: 'USD',
        estimatedMonthlyCost: 80,
        costCalculationLookbackPeriodInDays: 30,
        resourceId: common.resourceId,
        resourceArn: common.resourceArn,
        currentResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.xlarge' } } } },
        recommendedResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.large' } } } },
      };
    }
    throw new Error('Unexpected command');
  });
  vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
  expect(
    await hydrateAwsCostOptimizationHubRightsizingRecommendations([], { resolveAccountId: async () => accountId }),
  ).toMatchObject({
    unavailable: true,
    resources: [],
    diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
  });
});
it('loads both typed EC2 configurations and retains common recommendation evidence', async () => {
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
    if (command instanceof ListRecommendationsCommand) return { items: [common] };
    if (command instanceof GetRecommendationCommand)
      return {
        currentResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.xlarge' } } } },
        recommendedResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.large' } } } },
      };
    throw new Error('Unexpected command');
  });
  vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
  expect(
    await hydrateAwsCostOptimizationHubRightsizingRecommendations([], { resolveAccountId: async () => accountId }),
  ).toEqual([
    {
      accountId,
      region: 'eu-west-1',
      actionType: 'Rightsize',
      resourceType: 'Ec2Instance',
      resourceId: 'i-example',
      resourceArn: common.resourceArn,
      recommendationId: 'rec-1',
      currencyCode: 'USD',
      estimatedMonthlyCost: 100,
      estimatedMonthlySavings: 50,
      estimatedSavingsPercentage: 50,
      recommendationSource: 'ComputeOptimizer',
      lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
      implementationEffort: 'Medium',
      restartNeeded: true,
      rollbackPossible: false,
      currentConfiguration: { instance: { type: 'm7i.xlarge' } },
      recommendedConfiguration: { instance: { type: 'm7i.large' } },
    },
  ]);
});
