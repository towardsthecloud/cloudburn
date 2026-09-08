import { CostExplorerClient, GetSavingsPlansCoverageCommand } from '@aws-sdk/client-cost-explorer';
import {
  CostOptimizationHubClient,
  GetRecommendationCommand,
  ListEnrollmentStatusesCommand,
  ListRecommendationsCommand,
} from '@aws-sdk/client-cost-optimization-hub';
import { DescribeInstancesCommand, DescribeVolumesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { STSClient } from '@aws-sdk/client-sts';
import type { AwsDiscoveryCatalog } from '@cloudburn/rules';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runLiveScan } from '../src/engine/run-live.js';
import { buildAwsDiscoveryCatalog } from '../src/providers/aws/resource-explorer.js';
import type { AwsDiscoveryProgressEvent } from '../src/types.js';

vi.mock('../src/providers/aws/resource-explorer.js', async (original) => ({
  ...(await original<typeof import('../src/providers/aws/resource-explorer.js')>()),
  buildAwsDiscoveryCatalog: vi.fn(),
}));

const accountId = '123456789012';
const region = 'eu-west-1';
const nativeRule = 'CLDBRN-AWS-EBS-2';
const idleHubRule = 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-3';
const savingsHubRule = 'CLDBRN-AWS-COSTOPTIMIZATIONHUB-1';
const coverageRule = 'CLDBRN-AWS-SAGEMAKER-3';
const previousGenerationRule = 'CLDBRN-AWS-EC2-8';
const catalogFor = (resourceType = 'ec2:volume', regions = [region]): AwsDiscoveryCatalog => ({
  indexType: 'AGGREGATOR',
  searchRegion: region,
  viewArn: 'synthetic-view',
  resources: regions.map((resourceRegion) => ({
    accountId,
    region: resourceRegion,
    resourceType,
    service: 'ec2',
    arn: `arn:aws:ec2:${resourceRegion}:${accountId}:${resourceType === 'ec2:volume' ? 'volume/vol-test' : 'instance/i-test'}`,
  })),
});
const volumeResponse = { Volumes: [{ VolumeId: 'vol-test', VolumeType: 'gp3', Size: 20, Attachments: [] }] };
const instanceResponse = { Reservations: [{ Instances: [{ InstanceId: 'i-test', InstanceType: 'm5.24xlarge' }] }] };
const idleRecommendation = {
  accountId,
  region,
  resourceId: `arn:aws:ec2:${region}:${accountId}:volume/vol-test`,
  actionType: 'Delete',
  currentResourceType: 'EbsVolume',
  currencyCode: 'USD',
  estimatedMonthlyCost: 20,
  estimatedMonthlySavings: 20,
  estimatedSavingsPercentage: 100,
  implementationEffort: 'Low',
  restartNeeded: false,
  rollbackPossible: false,
  recommendationId: 'idle-volume',
  source: 'ComputeOptimizer',
  lastRefreshTimestamp: new Date('2026-09-04T00:00:00Z'),
};
const run = (enabledRules: string[], onProgress?: (event: AwsDiscoveryProgressEvent) => void) =>
  runLiveScan({ discovery: { enabledRules } }, { mode: 'all' }, { includeEvaluationResources: true, onProgress });
const ruleEvents = (events: AwsDiscoveryProgressEvent[]) => events.filter((event) => event.kind === 'rule');

beforeEach(() => {
  vi.stubEnv('AWS_REGION', region);
  vi.spyOn(STSClient.prototype, 'send').mockResolvedValue({ Account: accountId } as never);
  vi.mocked(buildAwsDiscoveryCatalog).mockImplementation(async (_target, _types, options) => {
    const catalog = catalogFor();
    options?.onResourceTypeReady?.('ec2:volume', catalog);
    return catalog;
  });
  vi.spyOn(EC2Client.prototype, 'send').mockImplementation(async (command) => {
    if (command instanceof DescribeVolumesCommand) return volumeResponse;
    if (command instanceof DescribeInstancesCommand) return instanceResponse;
    throw new Error(`Unexpected EC2 command: ${command.constructor.name}`);
  });
  vi.spyOn(CostOptimizationHubClient.prototype, 'send').mockImplementation(async (command) => {
    if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
    if (command instanceof ListRecommendationsCommand) return { items: [idleRecommendation] };
    if (command instanceof GetRecommendationCommand)
      return { currentResourceDetails: { ebsVolume: { configuration: { storage: { type: 'gp3', sizeInGb: 20 } } } } };
    throw new Error(`Unexpected Hub command: ${command.constructor.name}`);
  });
  vi.spyOn(CostExplorerClient.prototype, 'send').mockImplementation(async (command) => {
    if (command instanceof GetSavingsPlansCoverageCommand)
      return {
        SavingsPlansCoverages: [
          {
            Coverage: {
              CoveragePercentage: '60',
              OnDemandCost: '100',
              SpendCoveredBySavingsPlans: '150',
              TotalCost: '250',
            },
            TimePeriod: { End: '2026-09-04', Start: '2026-08-05' },
          },
        ],
      };
    throw new Error(`Unexpected Cost Explorer command: ${command.constructor.name}`);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('reports provisional Hub evidence before native evidence and preserves final finding precedence', async () => {
  const volumeGate = Promise.withResolvers<void>();
  vi.mocked(EC2Client.prototype.send).mockImplementation(async (command) => {
    if (!(command instanceof DescribeVolumesCommand)) throw new Error('Unexpected EC2 command');
    await volumeGate.promise;
    return volumeResponse;
  });
  const events: AwsDiscoveryProgressEvent[] = [];
  const selected = [idleHubRule, nativeRule];
  const pending = run(selected, (event) => events.push(event));
  try {
    await vi.waitFor(() =>
      expect(ruleEvents(events)).toContainEqual(
        expect.objectContaining({
          ruleId: idleHubRule,
          provisional: true,
          status: 'triggered',
          findingCount: 1,
          findings: [{ accountId, region, resourceId: 'vol-test', resourceType: 'ec2:volume', actionType: 'Delete' }],
        }),
      ),
    );
    expect(ruleEvents(events).some((event) => event.ruleId === nativeRule)).toBe(false);
    volumeGate.resolve();
    const result = await pending;
    expect(result.providers.flatMap((provider) => provider.rules).map((rule) => rule.ruleId)).toEqual([nativeRule]);
    expect(result.evaluations?.rules.find((rule) => rule.ruleId === idleHubRule)).toMatchObject({
      status: 'triggered',
      findingCount: 1,
    });
    expect(ruleEvents(events).find((event) => event.ruleId === nativeRule)).toMatchObject({
      provisional: true,
      status: 'triggered',
      findingCount: 1,
    });
    expect(result).toEqual(await run(selected));
  } finally {
    volumeGate.resolve();
    await pending;
  }
});

it('waits for selected optional recommendations before evaluating SageMaker coverage', async () => {
  const recommendationsGate = Promise.withResolvers<void>();
  vi.mocked(CostOptimizationHubClient.prototype.send).mockImplementation(async (command) => {
    if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
    if (command instanceof ListRecommendationsCommand) {
      await recommendationsGate.promise;
      return {
        items: [
          {
            accountId,
            actionType: 'PurchaseSavingsPlans',
            currencyCode: 'USD',
            currentResourceType: 'SageMakerSavingsPlans',
            estimatedMonthlyCost: 200,
            estimatedMonthlySavings: 50,
            estimatedSavingsPercentage: 25,
            lastRefreshTimestamp: new Date('2026-09-03T00:00:00Z'),
            recommendationId: 'sagemaker-purchase',
            source: 'CostExplorer',
          },
        ],
      };
    }
    if (command instanceof GetRecommendationCommand)
      return {
        recommendationId: 'sagemaker-purchase',
        recommendedResourceDetails: {
          sageMakerSavingsPlans: {
            configuration: {
              accountScope: 'LINKED',
              hourlyCommitment: '0.42',
              paymentOption: 'NoUpfront',
              term: 'OneYear',
            },
          },
        },
      };
    throw new Error('Unexpected Hub command');
  });
  const events: AwsDiscoveryProgressEvent[] = [];
  const selected = [coverageRule, savingsHubRule];
  const pending = run(selected, (event) => events.push(event));
  try {
    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({ kind: 'dataset', datasetKey: 'aws-sagemaker-savings-plans-coverage' }),
      ),
    );
    expect(ruleEvents(events)).toEqual([]);
    recommendationsGate.resolve();
    const result = await pending;
    expect(ruleEvents(events).find((event) => event.ruleId === coverageRule)).toMatchObject({
      provisional: true,
      status: 'passed',
      findingCount: 0,
      findings: [],
    });
    expect(result.providers.flatMap((provider) => provider.rules).map((rule) => rule.ruleId)).toEqual([savingsHubRule]);
    expect(result.evaluations?.rules.find((rule) => rule.ruleId === coverageRule)).toMatchObject({
      status: 'passed',
      findingCount: 0,
    });
    expect(result).toEqual(await run(selected));
  } finally {
    recommendationsGate.resolve();
    await pending;
  }
});

it('preserves healthy regional progress and final evaluation evidence while another dataset remains blocked', async () => {
  const regions = ['eu-west-1', 'us-east-1', 'eu-central-1'];
  vi.mocked(buildAwsDiscoveryCatalog).mockImplementation(async (_target, _types, options) => {
    const catalog = catalogFor('ec2:instance', regions);
    options?.onResourceTypeReady?.('ec2:instance', catalog);
    return catalog;
  });
  vi.mocked(EC2Client.prototype.send).mockImplementation(async function (this: EC2Client, command) {
    if (!(command instanceof DescribeInstancesCommand)) throw new Error('Unexpected EC2 command');
    if ((await this.config.region()) === 'us-east-1') throw new Error('synthetic regional outage');
    return instanceResponse;
  });
  const hubGate = Promise.withResolvers<void>();
  vi.mocked(CostOptimizationHubClient.prototype.send).mockImplementation(async (command) => {
    if (command instanceof ListEnrollmentStatusesCommand) return { items: [{ accountId, status: 'Active' }] };
    if (command instanceof ListRecommendationsCommand) {
      await hubGate.promise;
      return { items: [] };
    }
    throw new Error('Unexpected Hub command');
  });
  const events: AwsDiscoveryProgressEvent[] = [];
  const selected = [previousGenerationRule, idleHubRule];
  const pending = run(selected, (event) => events.push(event));
  try {
    await vi.waitFor(() =>
      expect(ruleEvents(events).find((event) => event.ruleId === previousGenerationRule)).toMatchObject({
        provisional: true,
        status: 'triggered',
        findingCount: 2,
        reason: expect.stringContaining('us-east-1'),
      }),
    );
    expect(
      ruleEvents(events)
        .find((event) => event.ruleId === previousGenerationRule)
        ?.findings.map((finding) => finding.region)
        .sort(),
    ).toEqual(['eu-central-1', 'eu-west-1']);
    expect(ruleEvents(events).some((event) => event.ruleId === idleHubRule)).toBe(false);
    hubGate.resolve();
    const result = await pending;
    const evaluation = result.evaluations?.rules.find((rule) => rule.ruleId === previousGenerationRule);
    expect(
      result.evaluations?.resourceSets.find((set) => set.id === evaluation?.resourceSetId)?.resources,
    ).toHaveLength(2);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ region: 'us-east-1', status: 'error' }));
    expect(result).toEqual(await run(selected));
  } finally {
    hubGate.resolve();
    await pending;
  }
});

it('discards earlier catalog-backed provisional findings after a later catalog failure while retaining account evidence', async () => {
  const catalogFailure = Promise.withResolvers<void>();
  vi.mocked(buildAwsDiscoveryCatalog).mockImplementation(async (_target, _types, options) => {
    options?.onResourceTypeReady?.('ec2:volume', catalogFor());
    await catalogFailure.promise;
    throw new Error('synthetic later catalog page failed');
  });
  const events: AwsDiscoveryProgressEvent[] = [];
  const selected = [nativeRule, previousGenerationRule, idleHubRule];
  const pending = run(selected, (event) => events.push(event));
  try {
    await vi.waitFor(() =>
      expect(ruleEvents(events).find((event) => event.ruleId === nativeRule)).toMatchObject({
        provisional: true,
        status: 'triggered',
        findingCount: 1,
      }),
    );
    catalogFailure.resolve();
    const result = await pending;
    expect(result.providers.flatMap((provider) => provider.rules).map((rule) => rule.ruleId)).toEqual([idleHubRule]);
    expect(result.evaluations?.rules.find((rule) => rule.ruleId === nativeRule)).toMatchObject({
      status: 'not_applicable',
      findingCount: 0,
    });
    expect(result.evaluations?.rules.find((rule) => rule.ruleId === previousGenerationRule)).toMatchObject({
      status: 'not_applicable',
      findingCount: 0,
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('only account-scoped datasets were evaluated') }),
    );
    expect(result).toEqual(await run(selected));
  } finally {
    catalogFailure.resolve();
    await pending;
  }
});

it('reports catalog-backed work that finishes after a known catalog failure as not applicable', async () => {
  const catalogFailure = Promise.withResolvers<void>();
  const volumeStarted = Promise.withResolvers<void>();
  const volumeResponseGate = Promise.withResolvers<void>();
  vi.mocked(buildAwsDiscoveryCatalog).mockImplementation(async (_target, _types, options) => {
    options?.onResourceTypeReady?.('ec2:volume', catalogFor());
    await catalogFailure.promise;
    throw new Error('synthetic catalog failed while hydration was running');
  });
  vi.mocked(EC2Client.prototype.send).mockImplementation(async (command) => {
    if (!(command instanceof DescribeVolumesCommand)) throw new Error('Unexpected EC2 command');
    volumeStarted.resolve();
    await volumeResponseGate.promise;
    return volumeResponse;
  });
  const events: AwsDiscoveryProgressEvent[] = [];
  const pending = run([nativeRule, previousGenerationRule, idleHubRule], (event) => events.push(event));
  try {
    await volumeStarted.promise;
    catalogFailure.resolve();
    // The unresolved instance scope becomes unavailable only after orchestration
    // has handled the failure; keep the earlier volume response held until then.
    await vi.waitFor(() =>
      expect(ruleEvents(events).find((event) => event.ruleId === previousGenerationRule)).toMatchObject({
        status: 'not_applicable',
      }),
    );
    expect(ruleEvents(events).some((event) => event.ruleId === nativeRule)).toBe(false);
    volumeResponseGate.resolve();
    const result = await pending;
    expect(ruleEvents(events).find((event) => event.ruleId === nativeRule)).toMatchObject({
      provisional: true,
      status: 'not_applicable',
      findingCount: 0,
      findings: [],
    });
    expect(result.providers.flatMap((provider) => provider.rules).map((rule) => rule.ruleId)).toEqual([idleHubRule]);
    expect(result.evaluations?.rules.find((rule) => rule.ruleId === nativeRule)).toMatchObject({
      status: 'not_applicable',
      findingCount: 0,
    });
  } finally {
    catalogFailure.resolve();
    volumeResponseGate.resolve();
    await pending;
  }
});
