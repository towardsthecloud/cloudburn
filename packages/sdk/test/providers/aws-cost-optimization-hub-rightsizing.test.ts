import {
  GetRecommendationCommand,
  ListEnrollmentStatusesCommand,
  ListRecommendationsCommand,
} from '@aws-sdk/client-cost-optimization-hub';
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
it.each([
  '',
  ':3',
  ':production',
])('derives the Region and canonical Lambda identity from ARN qualifier %s', async (qualifier) => {
  const functionArn = `arn:aws:lambda:eu-west-1:${accountId}:function:example`;
  const resourceArn = functionArn + qualifier;
  vi.mocked(createCostOptimizationHubClient).mockReturnValue({
    send: vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
      if (command instanceof ListRecommendationsCommand)
        return {
          items: [
            { ...common, region: undefined, resourceId: undefined, resourceArn, currentResourceType: 'LambdaFunction' },
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
});
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
it.each([
  'enrollment',
  'list',
  'detail',
  'unenrolled',
  'clean',
])('distinguishes %s evidence availability', async (state) => {
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
});
it.each([
  'Upgrade',
  'MigrateToGraviton',
  'Stop',
  'ScaleIn',
])('never reports a %s action as rightsizing', async (actionType) => {
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
});
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
it.each([
  undefined,
  'example',
])('uses the Lambda ARN for native-rule identity when AWS resourceId is %s', async (resourceId) => {
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
});
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
])('preserves both complete %s configurations', async (resourceType, detailKey, currentConfiguration, recommendedConfiguration) => {
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
