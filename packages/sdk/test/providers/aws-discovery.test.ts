import type { AwsDiscoveryCatalog, Rule } from '@cloudburn/rules';
import { LiveResourceBag } from '@cloudburn/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listEnabledAwsRegions, resolveCurrentAwsRegion } from '../../src/providers/aws/client.js';
import {
  discoverAwsResources,
  initializeAwsDiscovery,
  listEnabledAwsDiscoveryRegions,
  listSupportedAwsResourceTypes,
} from '../../src/providers/aws/discovery.js';
import {
  buildAwsDiscoveryCatalog,
  createAwsResourceExplorerSetup,
  listAwsDiscoveryIndexes,
  listAwsDiscoverySupportedResourceTypes,
} from '../../src/providers/aws/resource-explorer.js';
import { hydrateAwsEbsVolumes } from '../../src/providers/aws/resources/ebs.js';
import { hydrateAwsEc2Instances } from '../../src/providers/aws/resources/ec2.js';
import { hydrateAwsLambdaFunctions } from '../../src/providers/aws/resources/lambda.js';
import { hydrateAwsRdsInstances } from '../../src/providers/aws/resources/rds.js';
import { hydrateAwsS3BucketAnalyses } from '../../src/providers/aws/resources/s3.js';

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

vi.mock('../../src/providers/aws/resources/ec2.js', () => ({
  hydrateAwsEc2Instances: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/lambda.js', () => ({
  hydrateAwsLambdaFunctions: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/rds.js', () => ({
  hydrateAwsRdsInstances: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/s3.js', () => ({
  hydrateAwsS3BucketAnalyses: vi.fn(),
}));

const mockedResolveCurrentAwsRegion = vi.mocked(resolveCurrentAwsRegion);
const mockedListEnabledAwsRegions = vi.mocked(listEnabledAwsRegions);
const mockedBuildAwsDiscoveryCatalog = vi.mocked(buildAwsDiscoveryCatalog);
const mockedCreateAwsResourceExplorerSetup = vi.mocked(createAwsResourceExplorerSetup);
const mockedListAwsDiscoveryIndexes = vi.mocked(listAwsDiscoveryIndexes);
const mockedListAwsDiscoverySupportedResourceTypes = vi.mocked(listAwsDiscoverySupportedResourceTypes);
const mockedHydrateAwsEbsVolumes = vi.mocked(hydrateAwsEbsVolumes);
const mockedHydrateAwsEc2Instances = vi.mocked(hydrateAwsEc2Instances);
const mockedHydrateAwsLambdaFunctions = vi.mocked(hydrateAwsLambdaFunctions);
const mockedHydrateAwsRdsInstances = vi.mocked(hydrateAwsRdsInstances);
const mockedHydrateAwsS3BucketAnalyses = vi.mocked(hydrateAwsS3BucketAnalyses);

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
      arn: 'arn:aws:ec2:us-east-1:123456789012:instance/i-123',
      properties: [],
      region: 'us-east-1',
      resourceType: 'ec2:instance',
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
    {
      accountId: '123456789012',
      arn: 'arn:aws:s3:::logs-bucket',
      properties: [],
      region: 'us-east-1',
      resourceType: 's3:bucket',
      service: 's3',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:rds:us-east-1:123456789012:db:legacy-db',
      properties: [],
      region: 'us-east-1',
      resourceType: 'rds:db',
      service: 'rds',
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

describe('discoverAwsResources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('builds a catalog from unique rule resource types and hydrates only requested resource kinds', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue(catalog);
    mockedHydrateAwsEbsVolumes.mockResolvedValue([
      { accountId: '123456789012', region: 'us-east-1', volumeId: 'vol-123', volumeType: 'gp2' },
    ]);
    mockedHydrateAwsEc2Instances.mockResolvedValue([
      {
        accountId: '123456789012',
        instanceId: 'i-123',
        instanceType: 'c6i.large',
        region: 'us-east-1',
      },
    ]);
    mockedHydrateAwsLambdaFunctions.mockResolvedValue([
      { accountId: '123456789012', architectures: ['x86_64'], functionName: 'my-func', region: 'us-east-1' },
    ]);
    mockedHydrateAwsS3BucketAnalyses.mockResolvedValue([
      {
        accountId: '123456789012',
        bucketName: 'logs-bucket',
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: false,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: false,
        hasUnclassifiedTransition: false,
        region: 'us-east-1',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-ebs-volumes'],
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-2',
          discoveryDependencies: ['aws-ec2-instances'],
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-3',
          discoveryDependencies: ['aws-lambda-functions', 'aws-ebs-volumes'],
          service: 'lambda',
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-4',
          discoveryDependencies: ['aws-s3-bucket-analyses'],
          service: 's3',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'ec2:instance',
      'ec2:volume',
      'lambda:function',
      's3:bucket',
    ]);
    expect(mockedHydrateAwsEbsVolumes).toHaveBeenCalledWith([catalog.resources[0]]);
    expect(mockedHydrateAwsEc2Instances).toHaveBeenCalledWith([catalog.resources[1]]);
    expect(mockedHydrateAwsLambdaFunctions).toHaveBeenCalledWith([catalog.resources[2]]);
    expect(mockedHydrateAwsS3BucketAnalyses).toHaveBeenCalledWith([catalog.resources[3]]);
    expect(result.catalog).toEqual(catalog);
    expect(result.resources).toBeInstanceOf(LiveResourceBag);
    expect(result.resources.get('aws-ebs-volumes')).toEqual([
      { accountId: '123456789012', region: 'us-east-1', volumeId: 'vol-123', volumeType: 'gp2' },
    ]);
    expect(result.resources.get('aws-ec2-instances')).toEqual([
      {
        accountId: '123456789012',
        instanceId: 'i-123',
        instanceType: 'c6i.large',
        region: 'us-east-1',
      },
    ]);
    expect(result.resources.get('aws-lambda-functions')).toEqual([
      { accountId: '123456789012', architectures: ['x86_64'], functionName: 'my-func', region: 'us-east-1' },
    ]);
    expect(result.resources.get('aws-s3-bucket-analyses')).toEqual([
      {
        accountId: '123456789012',
        bucketName: 'logs-bucket',
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: false,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: false,
        hasUnclassifiedTransition: false,
        region: 'us-east-1',
      },
    ]);
  });

  it('loads only the S3 hydrator when active rules require only S3 bucket analyses', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue(catalog);
    mockedHydrateAwsS3BucketAnalyses.mockResolvedValue([
      {
        accountId: '123456789012',
        bucketName: 'logs-bucket',
        hasAlternativeStorageClassTransition: false,
        hasCostFocusedLifecycle: false,
        hasIntelligentTieringConfiguration: false,
        hasIntelligentTieringTransition: false,
        hasLifecycleSignal: false,
        hasUnclassifiedTransition: false,
        region: 'us-east-1',
      },
    ]);

    await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-s3-bucket-analyses'],
          service: 's3',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, ['s3:bucket']);
    expect(mockedHydrateAwsS3BucketAnalyses).toHaveBeenCalledWith([catalog.resources[3]]);
    expect(mockedHydrateAwsEbsVolumes).not.toHaveBeenCalled();
    expect(mockedHydrateAwsEc2Instances).not.toHaveBeenCalled();
    expect(mockedHydrateAwsLambdaFunctions).not.toHaveBeenCalled();
  });

  it('hydrates RDS DB instances when an active rule requires the shared RDS dataset', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue(catalog);
    mockedHydrateAwsRdsInstances.mockResolvedValue([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'legacy-db',
        instanceClass: 'db.m6i.large',
        region: 'us-east-1',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-rds-instances' as Rule['discoveryDependencies'][number]],
          service: 'rds',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, ['rds:db']);
    expect(mockedHydrateAwsRdsInstances).toHaveBeenCalledWith([catalog.resources[4]]);
    expect(result.resources.get('aws-rds-instances' as never)).toEqual([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'legacy-db',
        instanceClass: 'db.m6i.large',
        region: 'us-east-1',
      },
    ]);
  });

  it('returns an empty catalog without Resource Explorer calls when no live rules require discovery metadata', async () => {
    mockedResolveCurrentAwsRegion.mockResolvedValue('us-east-1');

    const result = await discoverAwsResources(
      [
        createRule({
          evaluateLive: undefined,
        }),
      ],
      { mode: 'current' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).not.toHaveBeenCalled();
    expect(result.catalog).toEqual({
      indexType: 'LOCAL',
      resources: [],
      searchRegion: 'us-east-1',
    });
    expect(result.resources).toBeInstanceOf(LiveResourceBag);
    expect(result.resources.get('aws-ebs-volumes')).toEqual([]);
    expect(result.resources.get('aws-ec2-instances')).toEqual([]);
    expect(result.resources.get('aws-lambda-functions')).toEqual([]);
    expect(result.resources.get('aws-s3-bucket-analyses')).toEqual([]);
  });

  it('fails fast when a discovery rule has an evaluator but no discoveryDependencies metadata', async () => {
    await expect(
      discoverAwsResources(
        [
          createRule({
            discoveryDependencies: undefined,
          }),
        ],
        { mode: 'current' },
      ),
    ).rejects.toThrow('Discovery rule CLDBRN-AWS-TEST-1 is missing discoveryDependencies metadata.');

    expect(mockedBuildAwsDiscoveryCatalog).not.toHaveBeenCalled();
  });

  it('fails fast when a discovery rule declares an unknown discovery dependency', async () => {
    await expect(
      discoverAwsResources(
        [
          createRule({
            discoveryDependencies: ['aws-missing-dataset' as Rule['discoveryDependencies'][number]],
          }),
        ],
        { mode: 'current' },
      ),
    ).rejects.toThrow("Discovery rule CLDBRN-AWS-TEST-1 declares unknown discovery dependency 'aws-missing-dataset'.");

    expect(mockedBuildAwsDiscoveryCatalog).not.toHaveBeenCalled();
  });

  it('treats prototype keys as unknown discovery dependencies', async () => {
    await expect(
      discoverAwsResources(
        [
          createRule({
            discoveryDependencies: ['__proto__' as Rule['discoveryDependencies'][number]],
          }),
        ],
        { mode: 'current' },
      ),
    ).rejects.toThrow("Discovery rule CLDBRN-AWS-TEST-1 declares unknown discovery dependency '__proto__'.");

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
