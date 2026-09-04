import {
  GetRecommendationCommand,
  ListEnrollmentStatusesCommand,
  ListRecommendationsCommand,
} from '@aws-sdk/client-cost-optimization-hub';
import { describe, expect, it, vi } from 'vitest';
import { createCostOptimizationHubClient } from '../../src/providers/aws/client.js';
import { hydrateAwsCostOptimizationHubIdleRecommendations } from '../../src/providers/aws/resources/cost-optimization-hub.js';

vi.mock('../../src/providers/aws/client.js', () => ({ createCostOptimizationHubClient: vi.fn() }));

const accountId = '123456789012';
const cases = [
  ['Stop', 'Ec2Instance', 'ec2Instance', { instance: { type: 'm7i.large' } }],
  ['Stop', 'RdsDbInstance', 'rdsDbInstance', { instance: { dbInstanceClass: 'db.t4g.medium' } }],
  ['Delete', 'RdsDbInstance', 'rdsDbInstance', { instance: { dbInstanceClass: 'db.r7g.large' } }],
  [
    'Delete',
    'EbsVolume',
    'ebsVolume',
    {
      storage: { type: 'gp3', sizeInGb: 20 },
      attachmentState: 'detached',
      performance: { iops: 3000, throughput: 125 },
    },
  ],
  [
    'Delete',
    'EcsService',
    'ecsService',
    { compute: { vCpu: 1, memorySizeInMB: 2048, architecture: 'ARM64', platform: 'Linux' } },
  ],
  [
    'ScaleIn',
    'Ec2AutoScalingGroup',
    'ec2AutoScalingGroup',
    { instance: { type: 'm7i.large' }, type: 'SingleInstanceType', allocationStrategy: 'LowestPrice' },
  ],
] as const;
const summary = (actionType = 'Stop', currentResourceType = 'Ec2Instance', recommendationId = 'rec-1') => ({
  accountId,
  actionType,
  currentResourceType,
  recommendationId,
  resourceId: 'i-test',
  region: 'eu-west-1',
  currencyCode: 'USD',
  estimatedMonthlyCost: 50,
  estimatedMonthlySavings: 40,
  estimatedSavingsPercentage: 80,
  implementationEffort: 'Low',
  restartNeeded: false,
  rollbackPossible: true,
  source: 'ComputeOptimizer',
  lastRefreshTimestamp: new Date('2026-09-04T00:00:00Z'),
});
const load = () => hydrateAwsCostOptimizationHubIdleRecommendations([], { resolveAccountId: async () => accountId });

describe('idle recommendation loader', () => {
  it('passes the requested regional scope to the Hub query', async () => {
    const send = vi.fn(async (command: unknown) =>
      command instanceof ListEnrollmentStatusesCommand ? { items: [{ accountId, status: 'Active' }] } : { items: [] },
    );
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
    await hydrateAwsCostOptimizationHubIdleRecommendations([], {
      resolveAccountId: async () => accountId,
      regions: ['eu-west-1', 'eu-central-1'],
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          filter: expect.objectContaining({ regions: ['eu-west-1', 'eu-central-1'] }),
        }),
      }),
    );
  });
  it('paginates and deduplicates IDs before fetching details, allowing absent Stop targets', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
      if (command instanceof ListRecommendationsCommand)
        return command.input.nextToken
          ? { items: [summary(), summary('Stop', 'Ec2Instance', 'rec-2')] }
          : { items: [summary()], nextToken: 'page-2' };
      return { currentResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.large' } } } } };
    });
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
    expect(await load()).toEqual([
      expect.objectContaining({ recommendationId: 'rec-1', recommendedConfiguration: null }),
      expect.objectContaining({ recommendationId: 'rec-2' }),
    ]);
    expect(send.mock.calls.filter(([c]) => c instanceof GetRecommendationCommand)).toHaveLength(2);
  });
  it.each(['enrollment', 'list', 'detail'])('reports access denied during %s as unavailable', async (stage) => {
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: async (command: unknown) => {
        const denied = () => {
          throw Object.assign(new Error('Denied'), { name: 'AccessDeniedException' });
        };
        if (command instanceof ListEnrollmentStatusesCommand)
          return stage === 'enrollment' ? denied() : { items: [{ accountId, status: 'Active' }] };
        if (command instanceof ListRecommendationsCommand) return stage === 'list' ? denied() : { items: [summary()] };
        return denied();
      },
    } as never);
    expect(await load()).toMatchObject({
      unavailable: true,
      resources: [],
      diagnostics: [{ status: 'access_denied' }],
    });
  });
  it.each([true, false])('distinguishes an enrolled empty result (%s) from unenrolled', async (enrolled) => {
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: async (command: unknown) =>
        command instanceof ListEnrollmentStatusesCommand
          ? { items: [{ accountId, status: enrolled ? 'Active' : 'Inactive' }] }
          : { items: [] },
    } as never);
    expect(await load()).toEqual(
      enrolled
        ? []
        : expect.objectContaining({
            unavailable: true,
            diagnostics: [expect.objectContaining({ code: 'CostOptimizationHubNotEnrolled' })],
          }),
    );
  });
  it.each([
    { currentResourceDetails: undefined },
    { currentResourceDetails: { ec2Instance: { configuration: {} } } },
    { currentResourceDetails: { ec2Instance: { configuration: { instance: { type: 123 } } } } },
    { recommendedResourceDetails: {} },
    { actionType: 'Delete' },
    { recommendationId: 'wrong-id' },
  ])('rejects malformed or mismatched detail %j', async (override) => {
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
        if (command instanceof ListRecommendationsCommand) return { items: [summary()] };
        return {
          currentResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.large' } } } },
          ...override,
        };
      },
    } as never);
    expect(await load()).toMatchObject({
      unavailable: true,
      diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
    });
  });
  it.each([
    { recommendationId: undefined },
    { restartNeeded: undefined },
    { rollbackPossible: undefined },
    { implementationEffort: undefined },
    { resourceId: undefined },
    { region: undefined },
    { estimatedMonthlyCost: NaN },
    { actionType: 'Delete' },
  ])('rejects incomplete common evidence %j', async (override) => {
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({
      send: async (command: unknown) => {
        if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
        if (command instanceof ListRecommendationsCommand) return { items: [{ ...summary(), ...override }] };
        return { currentResourceDetails: { ec2Instance: { configuration: { instance: { type: 'm7i.large' } } } } };
      },
    } as never);
    expect(await load()).toMatchObject({
      unavailable: true,
      diagnostics: [{ code: 'CostOptimizationHubRecommendationIncomplete' }],
    });
  });
  it.each(cases)('retains %s %s configuration and common evidence', async (action, type, key, configuration) => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
      if (command instanceof ListRecommendationsCommand) return { items: [summary(action, type)] };
      if (command instanceof GetRecommendationCommand)
        return {
          currentResourceDetails: { [key]: { configuration } },
          recommendedResourceDetails: { [key]: { configuration } },
        };
      throw new Error('Unexpected request');
    });
    vi.mocked(createCostOptimizationHubClient).mockReturnValue({ send } as never);
    expect(await load()).toEqual([
      expect.objectContaining({
        actionType: action,
        currentResourceType: type,
        currentConfiguration: configuration,
        recommendedConfiguration: configuration,
        accountId,
        region: 'eu-west-1',
        resourceId: 'i-test',
        estimatedMonthlyCost: 50,
        estimatedMonthlySavings: 40,
        estimatedSavingsPercentage: 80,
        implementationEffort: 'Low',
        restartNeeded: false,
        rollbackPossible: true,
        recommendationSource: 'ComputeOptimizer',
        lastRefreshTimestamp: '2026-09-04T00:00:00.000Z',
      }),
    ]);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          filter: {
            accountIds: [accountId],
            actionTypes: ['Stop', 'Delete', 'ScaleIn'],
            resourceTypes: ['Ec2Instance', 'RdsDbInstance', 'EbsVolume', 'EcsService', 'Ec2AutoScalingGroup'],
          },
        }),
      }),
    );
  });
});
