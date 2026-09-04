import {
  GetRecommendationCommand,
  ListEnrollmentStatusesCommand,
  ListRecommendationsCommand,
  type Recommendation,
  type ResourceDetails,
} from '@aws-sdk/client-cost-optimization-hub';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCostOptimizationHubClient } from '../../src/providers/aws/client.js';
import {
  hydrateAwsCostOptimizationHubReservationRecommendations,
  hydrateAwsCostOptimizationHubUpgradeRecommendations,
} from '../../src/providers/aws/resources/cost-optimization-hub.js';

vi.mock('../../src/providers/aws/client.js', () => ({ createCostOptimizationHubClient: vi.fn() }));
const accountId = '123456789012';
const summary = (overrides: Partial<Recommendation> = {}): Recommendation => ({
  accountId,
  actionType: 'Upgrade',
  currentResourceType: 'Ec2Instance',
  recommendedResourceType: 'Ec2Instance',
  recommendationId: 'rec-1',
  resourceId: 'i-example',
  region: 'eu-west-1',
  currencyCode: 'USD',
  estimatedMonthlyCost: 100,
  estimatedMonthlySavings: 10,
  estimatedSavingsPercentage: 10,
  implementationEffort: 'Medium',
  restartNeeded: true,
  rollbackPossible: true,
  source: 'ComputeOptimizer',
  lastRefreshTimestamp: new Date('2026-09-04T00:00:00Z'),
  ...overrides,
});
const currentDetails: ResourceDetails = { ec2Instance: { configuration: { instance: { type: 'm6i.large' } } } };
const recommendedDetails: ResourceDetails = { ec2Instance: { configuration: { instance: { type: 'm7i.large' } } } };
const load = () => hydrateAwsCostOptimizationHubUpgradeRecommendations([], { resolveAccountId: async () => accountId });
const mockHub = (recommendation = summary(), current = currentDetails, recommended = recommendedDetails) => {
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
    if (command instanceof ListRecommendationsCommand) return { items: [recommendation] };
    if (command instanceof GetRecommendationCommand)
      return {
        ...recommendation,
        currentResourceDetails: current,
        recommendedResourceDetails: recommended,
      };
    throw new Error('Unexpected command');
  });
  vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
  return send;
};

describe('Cost Optimization Hub upgrades', () => {
  beforeEach(() => vi.resetAllMocks());
  it('shares enrollment with reservation loading within a discovery run', async () => {
    let enrollmentReads = 0;
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) {
          enrollmentReads += 1;
          return { items: [{ accountId, status: 'Active' }] };
        }
        return { items: [] };
      }),
    } as never);
    const context = { resolveAccountId: async () => accountId };
    expect(
      await Promise.all([
        hydrateAwsCostOptimizationHubUpgradeRecommendations([], context),
        hydrateAwsCostOptimizationHubReservationRecommendations([], context),
      ]),
    ).toEqual([[], []]);
    expect(enrollmentReads).toBe(1);
  });
  it.each([
    [
      'EbsVolume',
      { ebsVolume: { configuration: { storage: { type: 42, sizeInGb: 100 } } } },
      { ebsVolume: { configuration: { storage: { type: 'gp3', sizeInGb: 100 } } } },
    ],
    [
      'EbsVolume',
      { ebsVolume: { configuration: { storage: { type: 'gp2', sizeInGb: 100 }, attachmentState: 42 } } },
      { ebsVolume: { configuration: { storage: { type: 'gp3', sizeInGb: 100 } } } },
    ],
    [
      'RdsDbInstanceStorage',
      { rdsDbInstanceStorage: { configuration: { storageType: 42, allocatedStorageInGb: 100 } } },
      { rdsDbInstanceStorage: { configuration: { storageType: 'gp3', allocatedStorageInGb: 100 } } },
    ],
    [
      'Ec2AutoScalingGroup',
      {
        ec2AutoScalingGroup: {
          configuration: { type: 'SingleInstanceType', instance: { type: 'm6i.large' }, allocationStrategy: 'unknown' },
        },
      },
      { ec2AutoScalingGroup: { configuration: { type: 'SingleInstanceType', instance: { type: 'm7i.large' } } } },
    ],
  ] as const)('rejects invalid typed fields in %s', async (resourceType, current, recommended) => {
    mockHub(
      summary({ currentResourceType: resourceType, recommendedResourceType: resourceType }),
      current as unknown as ResourceDetails,
      recommended as ResourceDetails,
    );
    expect(await load()).toMatchObject({ unavailable: true });
  });
  it('rejects detail evidence from a different account', async () => {
    const send = mockHub();
    send.mockImplementation(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
      if (command instanceof ListRecommendationsCommand) return { items: [summary()] };
      return {
        ...summary(),
        accountId: '999999999999',
        currentResourceDetails: currentDetails,
        recommendedResourceDetails: recommendedDetails,
      };
    });
    expect(await load()).toMatchObject({ unavailable: true });
  });
  it('rejects capacity-only Auto Scaling upgrades', async () => {
    mockHub(
      summary({ currentResourceType: 'Ec2AutoScalingGroup', recommendedResourceType: 'Ec2AutoScalingGroup' }),
      { ec2AutoScalingGroup: { configuration: { type: 'SingleInstanceType', instance: { type: 'm6i.large' } } } },
      { ec2AutoScalingGroup: { configuration: { type: 'SingleInstanceType', instance: { type: 'm6i.small' } } } },
    );
    expect(await load()).toMatchObject({ unavailable: true });
  });
  it('rejects mixed-instance upgrades with unchanged instance families', async () => {
    mockHub(
      summary({ currentResourceType: 'Ec2AutoScalingGroup', recommendedResourceType: 'Ec2AutoScalingGroup' }),
      {
        ec2AutoScalingGroup: {
          configuration: { type: 'MixedInstanceTypes', mixedInstances: [{ type: 'm6i.large' }, { type: 'm6a.large' }] },
        },
      },
      {
        ec2AutoScalingGroup: {
          configuration: { type: 'MixedInstanceTypes', mixedInstances: [{ type: 'm6a.small' }, { type: 'm6i.small' }] },
        },
      },
    );
    expect(await load()).toMatchObject({ unavailable: true });
  });
  it.each([
    { ...summary(), lastRefreshTimestamp: 'invalid' },
    { ...summary(), source: 'UnknownSource' },
  ])('makes malformed common evidence unavailable without throwing', async (invalid) => {
    mockHub(invalid as unknown as Recommendation);
    expect(await load()).toMatchObject({ unavailable: true });
  });
  it('makes a non-string instance type unavailable', async () => {
    mockHub(summary(), { ec2Instance: { configuration: { instance: { type: 42 } } } } as unknown as ResourceDetails);
    expect(await load()).toMatchObject({ unavailable: true });
  });
  it('uses the shared filtered pagination and deduplicates recommendation IDs', async () => {
    const filters: unknown[] = [];
    const details: string[] = [];
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
        if (command instanceof ListRecommendationsCommand) {
          filters.push(command.input);
          return command.input.nextToken ? { items: [summary()] } : { items: [summary()], nextToken: 'page-2' };
        }
        if (command instanceof GetRecommendationCommand) {
          details.push(command.input.recommendationId ?? 'missing');
          return {
            ...summary(),
            currentResourceDetails: currentDetails,
            recommendedResourceDetails: recommendedDetails,
          };
        }
        throw new Error('Unexpected command');
      }),
    } as never);
    expect(await load()).toHaveLength(1);
    expect(details).toEqual(['rec-1']);
    expect(filters).toEqual(
      [undefined, 'page-2'].map((nextToken) => ({
        filter: {
          accountIds: [accountId],
          actionTypes: ['Upgrade'],
          resourceTypes: ['Ec2Instance', 'Ec2AutoScalingGroup', 'EbsVolume', 'RdsDbInstance', 'RdsDbInstanceStorage'],
        },
        maxResults: 1000,
        includeAllRecommendations: false,
        nextToken,
      })),
    );
  });
  it.each([
    {},
    { items: [null] },
    { items: [{}] },
  ])('reports malformed recommendation pages as unavailable: %j', async (page) => {
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: vi.fn(async (command: unknown) =>
        command instanceof ListEnrollmentStatusesCommand ? { items: [{ accountId, status: 'Active' }] } : page,
      ),
    } as never);
    expect(await load()).toMatchObject({
      unavailable: true,
      diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
    });
  });
  it('returns a clean empty dataset only after an enrolled, successful empty response', async () => {
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: vi.fn(async (command: unknown) =>
        command instanceof ListEnrollmentStatusesCommand ? { items: [{ accountId, status: 'Active' }] } : { items: [] },
      ),
    } as never);
    expect(await load()).toEqual([]);
  });
  it('checks unenrolled accounts without loading recommendations or changing enrollment', async () => {
    const send = vi.fn(async (command: unknown) => {
      expect(command).toBeInstanceOf(ListEnrollmentStatusesCommand);
      return { items: [{ accountId, status: 'Inactive' }] };
    });
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
    expect(await load()).toMatchObject({
      unavailable: true,
      resources: [],
      diagnostics: [{ code: 'CostOptimizationHubNotEnrolled' }],
    });
  });
  it.each(['enrollment', 'list', 'detail'])('makes access denial at %s unavailable', async (stage) => {
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: vi.fn(async (command: unknown) => {
        if (
          stage === 'enrollment' ||
          (stage === 'list' && command instanceof ListRecommendationsCommand) ||
          command instanceof GetRecommendationCommand
        ) {
          throw Object.assign(new Error('Access denied'), { name: 'AccessDeniedException' });
        }
        return command instanceof ListEnrollmentStatusesCommand
          ? { items: [{ accountId, status: 'Active' }] }
          : { items: [summary()] };
      }),
    } as never);
    expect(await load()).toMatchObject({
      unavailable: true,
      resources: [],
      diagnostics: [{ status: 'access_denied' }],
    });
  });
  it.each([
    { resourceId: undefined, resourceArn: undefined },
    { region: undefined },
    { implementationEffort: undefined },
    { restartNeeded: undefined },
    { rollbackPossible: undefined },
    { actionType: 'Rightsize' as const },
    { estimatedMonthlyCost: Number.NaN },
    { estimatedMonthlySavings: undefined },
    { estimatedSavingsPercentage: undefined },
    { source: undefined },
    { lastRefreshTimestamp: undefined },
  ])('makes incomplete or non-upgrade summary evidence unavailable: %j', async (invalid) => {
    mockHub(summary(invalid));
    expect(await load()).toMatchObject({
      unavailable: true,
      diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
    });
  });
  it.each([
    ['Ec2Instance', { ec2Instance: { configuration: { instance: {} } } }],
    ['Ec2Instance', { ec2Instance: { configuration: { instance: { type: 'm6i.small' } } } }],
    ['EbsVolume', { ebsVolume: { configuration: { storage: { type: 'gp3', sizeInGb: Number.NaN } } } }],
    [
      'EbsVolume',
      { ebsVolume: { configuration: { storage: { type: 'gp3', sizeInGb: 100 }, performance: { iops: -1 } } } },
    ],
    ['RdsDbInstance', { rdsDbInstance: { configuration: { instance: {} } } }],
    [
      'RdsDbInstanceStorage',
      {
        rdsDbInstanceStorage: { configuration: { storageType: 'gp3', allocatedStorageInGb: Number.POSITIVE_INFINITY } },
      },
    ],
    [
      'Ec2AutoScalingGroup',
      { ec2AutoScalingGroup: { configuration: { type: 'MixedInstanceTypes', mixedInstances: [] } } },
    ],
    [
      'Ec2AutoScalingGroup',
      { ec2AutoScalingGroup: { configuration: { type: 'MixedInstanceTypes', mixedInstances: [{}] } } },
    ],
  ] as const)('rejects malformed %s configuration', async (resourceType, details) => {
    mockHub(
      summary({ currentResourceType: resourceType, recommendedResourceType: resourceType }),
      details as ResourceDetails,
      details as ResourceDetails,
    );
    expect(await load()).toMatchObject({ unavailable: true });
  });
  it('rejects capacity-only EC2 changes labelled as upgrades', async () => {
    mockHub(summary(), currentDetails, { ec2Instance: { configuration: { instance: { type: 'm6i.small' } } } });
    expect(await load()).toMatchObject({ unavailable: true });
  });
  it.each([
    'currentResourceDetails',
    'recommendedResourceDetails',
    'recommendationId',
    'actionType',
    'currentResourceType',
    'recommendedResourceType',
  ])('requires matching detail identity and both configurations: %s', async (key) => {
    const send = mockHub();
    send.mockImplementation(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
      if (command instanceof ListRecommendationsCommand) return { items: [summary()] };
      return {
        ...summary(),
        currentResourceDetails: currentDetails,
        recommendedResourceDetails: recommendedDetails,
        [key]: undefined,
      };
    });
    expect(await load()).toMatchObject({ unavailable: true });
  });
  it('retains mixed-instance Auto Scaling groups and allocation strategy', async () => {
    const current = {
      type: 'MixedInstanceTypes' as const,
      mixedInstances: [{ type: 'm6i.large' }, { type: 'm6a.large' }],
      allocationStrategy: 'LowestPrice' as const,
    };
    const recommended = { ...current, mixedInstances: [{ type: 'm7i.large' }, { type: 'm7a.large' }] };
    mockHub(
      summary({ currentResourceType: 'Ec2AutoScalingGroup', recommendedResourceType: 'Ec2AutoScalingGroup' }),
      { ec2AutoScalingGroup: { configuration: current } },
      { ec2AutoScalingGroup: { configuration: recommended } },
    );
    expect(await load()).toEqual([
      expect.objectContaining({
        resourceType: 'Ec2AutoScalingGroup',
        currentConfiguration: current,
        recommendedConfiguration: recommended,
      }),
    ]);
  });
  it('retains single-instance Auto Scaling group configuration', async () => {
    const current = { type: 'SingleInstanceType' as const, instance: { type: 'm6i.large' } };
    const recommended = { type: 'SingleInstanceType' as const, instance: { type: 'm7i.large' } };
    mockHub(
      summary({ currentResourceType: 'Ec2AutoScalingGroup', recommendedResourceType: 'Ec2AutoScalingGroup' }),
      { ec2AutoScalingGroup: { configuration: current } },
      { ec2AutoScalingGroup: { configuration: recommended } },
    );
    expect(await load()).toEqual([
      expect.objectContaining({
        resourceType: 'Ec2AutoScalingGroup',
        currentConfiguration: current,
        recommendedConfiguration: recommended,
      }),
    ]);
  });
  it('retains RDS storage capacity, IOPS, and throughput', async () => {
    const current = { storageType: 'gp2', allocatedStorageInGb: 100, iops: 3000, storageThroughput: 125 };
    const recommended = { ...current, storageType: 'gp3' };
    mockHub(
      summary({ currentResourceType: 'RdsDbInstanceStorage', recommendedResourceType: 'RdsDbInstanceStorage' }),
      { rdsDbInstanceStorage: { configuration: current } },
      { rdsDbInstanceStorage: { configuration: recommended } },
    );
    expect(await load()).toEqual([
      expect.objectContaining({
        resourceType: 'RdsDbInstanceStorage',
        currentConfiguration: current,
        recommendedConfiguration: recommended,
      }),
    ]);
  });
  it('retains RDS DB instance classes', async () => {
    const current = { instance: { dbInstanceClass: 'db.m5.large' } };
    const recommended = { instance: { dbInstanceClass: 'db.m6i.large' } };
    mockHub(
      summary({ currentResourceType: 'RdsDbInstance', recommendedResourceType: 'RdsDbInstance' }),
      { rdsDbInstance: { configuration: current } },
      { rdsDbInstance: { configuration: recommended } },
    );
    expect(await load()).toEqual([
      expect.objectContaining({
        resourceType: 'RdsDbInstance',
        currentConfiguration: current,
        recommendedConfiguration: recommended,
      }),
    ]);
  });
  it('preserves EBS storage size, performance, and attachment state on both sides', async () => {
    const current = {
      storage: { type: 'io1', sizeInGb: 100 },
      performance: { iops: 3000, throughput: 125 },
      attachmentState: 'attached',
    };
    const recommended = {
      storage: { type: 'io2', sizeInGb: 100 },
      performance: { iops: 3000, throughput: 125 },
      attachmentState: 'attached',
    };
    mockHub(
      summary({ currentResourceType: 'EbsVolume', recommendedResourceType: 'EbsVolume' }),
      { ebsVolume: { configuration: current } },
      { ebsVolume: { configuration: recommended } },
    );
    expect(await load()).toEqual([
      expect.objectContaining({
        resourceType: 'EbsVolume',
        currentConfiguration: current,
        recommendedConfiguration: recommended,
      }),
    ]);
  });
  it('retains both typed EC2 configurations and the complete recommendation evidence', async () => {
    mockHub();
    expect(await load()).toEqual([
      {
        accountId,
        actionType: 'Upgrade',
        resourceType: 'Ec2Instance',
        recommendationId: 'rec-1',
        resourceId: 'i-example',
        region: 'eu-west-1',
        currencyCode: 'USD',
        estimatedMonthlyCost: 100,
        estimatedMonthlySavings: 10,
        estimatedSavingsPercentage: 10,
        implementationEffort: 'Medium',
        restartNeeded: true,
        rollbackPossible: true,
        recommendationSource: 'ComputeOptimizer',
        lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
        currentConfiguration: { instance: { type: 'm6i.large' } },
        recommendedConfiguration: { instance: { type: 'm7i.large' } },
      },
    ]);
  });
});
