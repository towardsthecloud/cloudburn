import type { AwsDiscoveryCatalog, Rule } from '@cloudburn/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listEnabledAwsRegions, resolveCurrentAwsRegion } from '../../src/providers/aws/client.js';
import {
  buildAwsDiscoveryCatalog,
  createAwsResourceExplorerSetup,
  listAwsDiscoveryIndexes,
  listAwsDiscoverySupportedResourceTypes,
} from '../../src/providers/aws/resource-explorer.js';
import { hydrateAwsEbsVolumes } from '../../src/providers/aws/resources/ebs.js';
import { hydrateAwsLambdaFunctions } from '../../src/providers/aws/resources/lambda.js';
import {
  initializeAwsDiscovery,
  listEnabledAwsDiscoveryRegions,
  listSupportedAwsResourceTypes,
  scanAwsResources,
} from '../../src/providers/aws/scanner.js';

vi.mock('../../src/providers/aws/client.js', () => ({
  listEnabledAwsRegions: vi.fn(),
  resolveCurrentAwsRegion: vi.fn(),
}));

vi.mock('../../src/providers/aws/resource-explorer.js', () => ({
  buildAwsDiscoveryCatalog: vi.fn(),
  createAwsResourceExplorerSetup: vi.fn(),
  listAwsDiscoveryIndexes: vi.fn(),
  listAwsDiscoverySupportedResourceTypes: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/ebs.js', () => ({
  hydrateAwsEbsVolumes: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/lambda.js', () => ({
  hydrateAwsLambdaFunctions: vi.fn(),
}));

const mockedResolveCurrentAwsRegion = vi.mocked(resolveCurrentAwsRegion);
const mockedListEnabledAwsRegions = vi.mocked(listEnabledAwsRegions);
const mockedBuildAwsDiscoveryCatalog = vi.mocked(buildAwsDiscoveryCatalog);
const mockedCreateAwsResourceExplorerSetup = vi.mocked(createAwsResourceExplorerSetup);
const mockedListAwsDiscoveryIndexes = vi.mocked(listAwsDiscoveryIndexes);
const mockedListAwsDiscoverySupportedResourceTypes = vi.mocked(listAwsDiscoverySupportedResourceTypes);
const mockedHydrateAwsEbsVolumes = vi.mocked(hydrateAwsEbsVolumes);
const mockedHydrateAwsLambdaFunctions = vi.mocked(hydrateAwsLambdaFunctions);

const catalog: AwsDiscoveryCatalog = {
  indexType: 'LOCAL',
  resources: [
    {
      accountId: '123456789012',
      arn: 'arn:aws:ec2:us-east-1:123456789012:volume/vol-123',
      properties: [],
      region: 'us-east-1',
      resourceType: 'ec2:volume',
      service: 'ec2',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:lambda:us-east-1:123456789012:function:my-func',
      properties: [],
      region: 'us-east-1',
      resourceType: 'lambda:function',
      service: 'lambda',
    },
  ],
  searchRegion: 'us-east-1',
};

const createRule = (overrides: Partial<Rule> = {}): Rule => ({
  description: 'test rule',
  evaluateLive: () => null,
  id: 'CLDBRN-AWS-TEST-1',
  message: 'test rule',
  name: 'test rule',
  provider: 'aws',
  service: 'ec2',
  supports: ['discovery'],
  ...overrides,
});

describe('scanAwsResources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('builds a catalog from unique rule resource types and hydrates only requested resource kinds', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue(catalog);
    mockedHydrateAwsEbsVolumes.mockResolvedValue([
      { accountId: '123456789012', region: 'us-east-1', volumeId: 'vol-123', volumeType: 'gp2' },
    ]);
    mockedHydrateAwsLambdaFunctions.mockResolvedValue([
      { accountId: '123456789012', architectures: ['x86_64'], functionName: 'my-func', region: 'us-east-1' },
    ]);

    const result = await scanAwsResources(
      [
        createRule({
          liveDiscovery: {
            hydrator: 'aws-ebs-volume',
            resourceTypes: ['ec2:volume'],
          },
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-2',
          liveDiscovery: {
            hydrator: 'aws-lambda-function',
            resourceTypes: ['lambda:function', 'ec2:volume'],
          },
          service: 'lambda',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'ec2:volume',
      'lambda:function',
    ]);
    expect(mockedHydrateAwsEbsVolumes).toHaveBeenCalledWith([catalog.resources[0]]);
    expect(mockedHydrateAwsLambdaFunctions).toHaveBeenCalledWith([catalog.resources[1]]);
    expect(result).toEqual({
      catalog,
      ebsVolumes: [{ accountId: '123456789012', region: 'us-east-1', volumeId: 'vol-123', volumeType: 'gp2' }],
      lambdaFunctions: [
        { accountId: '123456789012', architectures: ['x86_64'], functionName: 'my-func', region: 'us-east-1' },
      ],
    });
  });

  it('returns an empty catalog without Resource Explorer calls when no live rules require discovery metadata', async () => {
    mockedResolveCurrentAwsRegion.mockResolvedValue('us-east-1');

    const result = await scanAwsResources(
      [
        createRule({
          evaluateLive: undefined,
        }),
      ],
      { mode: 'current' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).not.toHaveBeenCalled();
    expect(result).toEqual({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      ebsVolumes: [],
      lambdaFunctions: [],
    });
  });

  it('fails fast when a discovery rule has an evaluator but no live discovery metadata', async () => {
    await expect(
      scanAwsResources(
        [
          createRule({
            liveDiscovery: undefined,
          }),
        ],
        { mode: 'current' },
      ),
    ).rejects.toThrow('Discovery rule CLDBRN-AWS-TEST-1 is missing liveDiscovery metadata.');

    expect(mockedBuildAwsDiscoveryCatalog).not.toHaveBeenCalled();
  });

  it('fails fast when a discovery rule declares an invalid Resource Explorer resource type', async () => {
    await expect(
      scanAwsResources(
        [
          createRule({
            liveDiscovery: {
              resourceTypes: ['ec2:volume region:us-east-1'],
            },
          }),
        ],
        { mode: 'current' },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_RESOURCE_EXPLORER_RESOURCE_TYPE',
    });

    expect(mockedBuildAwsDiscoveryCatalog).not.toHaveBeenCalled();
  });
});

describe('discovery support commands', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns existing setup details when an aggregator index already exists', async () => {
    mockedListAwsDiscoveryIndexes.mockResolvedValue([
      { region: 'eu-west-1', type: 'local' },
      { region: 'us-east-1', type: 'aggregator' },
    ]);

    await expect(initializeAwsDiscovery()).resolves.toEqual({
      aggregatorRegion: 'us-east-1',
      regions: ['eu-west-1', 'us-east-1'],
      status: 'EXISTING',
    });
    expect(mockedCreateAwsResourceExplorerSetup).not.toHaveBeenCalled();
  });

  it('creates a new setup in the current region when no aggregator exists', async () => {
    mockedListAwsDiscoveryIndexes.mockResolvedValue([]);
    mockedResolveCurrentAwsRegion.mockResolvedValue('eu-central-1');
    mockedListEnabledAwsRegions.mockResolvedValue(['eu-central-1', 'eu-west-1']);
    mockedCreateAwsResourceExplorerSetup.mockResolvedValue({
      aggregatorRegion: 'eu-central-1',
      regions: ['eu-central-1', 'eu-west-1'],
      status: 'CREATED',
      taskId: 'task-123',
    });

    await expect(initializeAwsDiscovery()).resolves.toEqual({
      aggregatorRegion: 'eu-central-1',
      regions: ['eu-central-1', 'eu-west-1'],
      status: 'CREATED',
      taskId: 'task-123',
    });
    expect(mockedCreateAwsResourceExplorerSetup).toHaveBeenCalledWith('eu-central-1', ['eu-central-1', 'eu-west-1']);
  });

  it('delegates region listing and supported resource type listing to the resource explorer module', async () => {
    mockedListAwsDiscoveryIndexes.mockResolvedValue([{ region: 'eu-west-1', type: 'local' }]);
    mockedListAwsDiscoverySupportedResourceTypes.mockResolvedValue([{ resourceType: 'ec2:volume', service: 'ec2' }]);

    await expect(listEnabledAwsDiscoveryRegions()).resolves.toEqual([{ region: 'eu-west-1', type: 'local' }]);
    await expect(listSupportedAwsResourceTypes()).resolves.toEqual([{ resourceType: 'ec2:volume', service: 'ec2' }]);
  });
});
