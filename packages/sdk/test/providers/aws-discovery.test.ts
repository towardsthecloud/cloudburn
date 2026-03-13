import type { AwsDiscoveryCatalog, Rule } from '@cloudburn/rules';
import { LiveResourceBag } from '@cloudburn/rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listEnabledAwsRegions, resolveCurrentAwsRegion } from '../../src/providers/aws/client.js';
import {
  discoverAwsResources,
  getAwsDiscoveryStatus,
  initializeAwsDiscovery,
  listEnabledAwsDiscoveryRegions,
  listSupportedAwsResourceTypes,
} from '../../src/providers/aws/discovery.js';
import {
  buildAwsDiscoveryCatalog,
  createAwsResourceExplorerSetup,
  getAwsDiscoveryRegionStatus,
  listAwsDiscoveryIndexes,
  listAwsDiscoverySupportedResourceTypes,
  updateAwsResourceExplorerIndexType,
  waitForAwsResourceExplorerIndex,
  waitForAwsResourceExplorerSetup,
} from '../../src/providers/aws/resource-explorer.js';
import { hydrateAwsEbsVolumes } from '../../src/providers/aws/resources/ebs.js';
import { hydrateAwsEc2Instances } from '../../src/providers/aws/resources/ec2.js';
import { hydrateAwsLambdaFunctions } from '../../src/providers/aws/resources/lambda.js';
import { hydrateAwsRdsInstances } from '../../src/providers/aws/resources/rds.js';
import { hydrateAwsS3BucketAnalyses } from '../../src/providers/aws/resources/s3.js';

vi.mock('../../src/providers/aws/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers/aws/client.js')>();

  return {
    ...actual,
    listEnabledAwsRegions: vi.fn(),
    resolveCurrentAwsRegion: vi.fn(),
  };
});

vi.mock('../../src/providers/aws/resource-explorer.js', () => ({
  buildAwsDiscoveryCatalog: vi.fn(),
  createAwsResourceExplorerSetup: vi.fn(),
  getAwsDiscoveryRegionStatus: vi.fn(),
  listAwsDiscoveryIndexes: vi.fn(),
  listAwsDiscoverySupportedResourceTypes: vi.fn(),
  updateAwsResourceExplorerIndexType: vi.fn(),
  waitForAwsResourceExplorerIndex: vi.fn(),
  waitForAwsResourceExplorerSetup: vi.fn(),
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
const mockedGetAwsDiscoveryRegionStatus = vi.mocked(getAwsDiscoveryRegionStatus);
const mockedListAwsDiscoveryIndexes = vi.mocked(listAwsDiscoveryIndexes);
const mockedListAwsDiscoverySupportedResourceTypes = vi.mocked(listAwsDiscoverySupportedResourceTypes);
const mockedUpdateAwsResourceExplorerIndexType = vi.mocked(updateAwsResourceExplorerIndexType);
const mockedWaitForAwsResourceExplorerIndex = vi.mocked(waitForAwsResourceExplorerIndex);
const mockedWaitForAwsResourceExplorerSetup = vi.mocked(waitForAwsResourceExplorerSetup);
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

const mockObservedStatus = (regions: Parameters<typeof mockedGetAwsDiscoveryRegionStatus.mockResolvedValue>[0][]) => {
  mockedListEnabledAwsRegions.mockResolvedValue(regions.map((region) => region.region));
  mockedGetAwsDiscoveryRegionStatus.mockImplementation(async (region) => {
    const match = regions.find((entry) => entry.region === region);

    if (!match) {
      throw new Error(`Unexpected region ${region}`);
    }

    return match;
  });
};

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

  it('records a non-fatal diagnostic when one hydrator is access denied and continues loading other datasets', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue(catalog);
    mockedHydrateAwsEbsVolumes.mockResolvedValue([
      { accountId: '123456789012', region: 'us-east-1', volumeId: 'vol-123', volumeType: 'gp3' },
    ]);
    const accessDeniedCause = Object.assign(new Error('Access denied by SCP.'), {
      name: 'AccessDeniedException',
      $metadata: {
        httpStatusCode: 403,
        requestId: 'req-123',
      },
    });
    mockedHydrateAwsLambdaFunctions.mockRejectedValue(
      new Error(
        'AWS Lambda GetFunctionConfiguration failed in us-east-1 with AccessDeniedException: Access denied by SCP. Request ID: req-123.',
        {
          cause: accessDeniedCause,
        },
      ),
    );

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-ebs-volumes'],
          service: 'ebs',
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-2',
          discoveryDependencies: ['aws-lambda-functions'],
          service: 'lambda',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(result.resources.get('aws-ebs-volumes')).toEqual([
      { accountId: '123456789012', region: 'us-east-1', volumeId: 'vol-123', volumeType: 'gp3' },
    ]);
    expect(result.resources.get('aws-lambda-functions')).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: 'AccessDeniedException',
        details:
          'AWS Lambda GetFunctionConfiguration failed in us-east-1 with AccessDeniedException: Access denied by SCP. Request ID: req-123.',
        message: 'Skipped lambda discovery in us-east-1 because access is denied by a service control policy (SCP).',
        provider: 'aws',
        region: 'us-east-1',
        service: 'lambda',
        source: 'discovery',
        status: 'access_denied',
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

  it('collects discovery status across all enabled regions', async () => {
    mockedResolveCurrentAwsRegion.mockResolvedValue('eu-central-1');
    mockObservedStatus([
      {
        region: 'eu-central-1',
        indexType: 'aggregator',
        isAggregator: true,
        status: 'indexed',
        viewStatus: 'present',
      },
      {
        region: 'eu-west-1',
        indexType: 'local',
        status: 'indexed',
        viewStatus: 'present',
      },
      {
        region: 'us-east-1',
        status: 'access_denied',
        notes: 'Access denied by SCP.',
      },
    ]);

    await expect(getAwsDiscoveryStatus()).resolves.toEqual({
      accessibleRegionCount: 2,
      aggregatorRegion: 'eu-central-1',
      coverage: 'partial',
      indexedRegionCount: 2,
      regions: [
        {
          region: 'eu-central-1',
          indexType: 'aggregator',
          isAggregator: true,
          status: 'indexed',
          viewStatus: 'present',
        },
        {
          region: 'eu-west-1',
          indexType: 'local',
          status: 'indexed',
          viewStatus: 'present',
        },
        {
          region: 'us-east-1',
          status: 'access_denied',
          notes: 'Access denied by SCP.',
        },
      ],
      totalRegionCount: 3,
      warning:
        'Discovery coverage is limited. 1 of 3 regions could not be inspected, which may be intentional if SCPs restrict regional Resource Explorer access.',
    });
    expect(mockedListEnabledAwsRegions).toHaveBeenCalledWith('eu-central-1');
  });

  it('uses the requested region as the control plane when collecting discovery status', async () => {
    mockedListEnabledAwsRegions.mockResolvedValue(['eu-west-1']);
    mockedGetAwsDiscoveryRegionStatus.mockResolvedValue({
      region: 'eu-west-1',
      indexType: 'local',
      status: 'indexed',
      viewStatus: 'present',
    });

    await getAwsDiscoveryStatus('eu-west-1');

    expect(mockedListEnabledAwsRegions).toHaveBeenCalledWith('eu-west-1');
  });

  it('returns existing setup details when an aggregator index already exists', async () => {
    mockedListAwsDiscoveryIndexes.mockResolvedValue([
      { region: 'eu-west-1', type: 'local' },
      { region: 'us-east-1', type: 'aggregator' },
    ]);
    mockObservedStatus([
      {
        region: 'eu-west-1',
        indexType: 'local',
        status: 'indexed',
        viewStatus: 'present',
      },
      {
        region: 'us-east-1',
        indexType: 'aggregator',
        isAggregator: true,
        status: 'indexed',
        viewStatus: 'present',
      },
    ]);

    await expect(initializeAwsDiscovery()).resolves.toEqual({
      aggregatorAction: 'unchanged',
      aggregatorRegion: 'us-east-1',
      coverage: 'full',
      createdIndexCount: 0,
      indexType: 'aggregator',
      regions: ['eu-west-1', 'us-east-1'],
      observedStatus: {
        accessibleRegionCount: 2,
        aggregatorRegion: 'us-east-1',
        coverage: 'full',
        indexedRegionCount: 2,
        regions: [
          {
            region: 'eu-west-1',
            indexType: 'local',
            status: 'indexed',
            viewStatus: 'present',
          },
          {
            region: 'us-east-1',
            indexType: 'aggregator',
            isAggregator: true,
            status: 'indexed',
            viewStatus: 'present',
          },
        ],
        totalRegionCount: 2,
      },
      reusedIndexCount: 2,
      status: 'EXISTING',
      verificationStatus: 'verified',
    });
    expect(mockedCreateAwsResourceExplorerSetup).not.toHaveBeenCalled();
  });

  it('promotes an existing local setup to an aggregator when permissions allow it', async () => {
    mockedResolveCurrentAwsRegion.mockResolvedValue('eu-central-1');
    mockedListAwsDiscoveryIndexes.mockResolvedValue([
      { region: 'eu-central-1', type: 'local' },
      { region: 'eu-west-1', type: 'local' },
    ]);
    mockedUpdateAwsResourceExplorerIndexType.mockResolvedValue({
      region: 'eu-central-1',
      state: 'UPDATING',
      type: 'aggregator',
    });
    mockedWaitForAwsResourceExplorerIndex.mockResolvedValue('verified');
    mockedListEnabledAwsRegions.mockResolvedValue(['eu-central-1', 'eu-west-1']);
    mockedGetAwsDiscoveryRegionStatus
      .mockResolvedValueOnce({
        region: 'eu-central-1',
        indexType: 'local',
        status: 'indexed',
        viewStatus: 'present',
      })
      .mockResolvedValueOnce({
        region: 'eu-west-1',
        indexType: 'local',
        status: 'indexed',
        viewStatus: 'present',
      })
      .mockResolvedValueOnce({
        region: 'eu-central-1',
        indexType: 'aggregator',
        isAggregator: true,
        status: 'indexed',
        viewStatus: 'present',
      })
      .mockResolvedValueOnce({
        region: 'eu-west-1',
        indexType: 'local',
        status: 'indexed',
        viewStatus: 'present',
      });

    await expect(initializeAwsDiscovery()).resolves.toEqual({
      aggregatorAction: 'promoted',
      aggregatorRegion: 'eu-central-1',
      coverage: 'full',
      createdIndexCount: 0,
      indexType: 'aggregator',
      observedStatus: {
        accessibleRegionCount: 2,
        aggregatorRegion: 'eu-central-1',
        coverage: 'full',
        indexedRegionCount: 2,
        regions: [
          {
            region: 'eu-central-1',
            indexType: 'aggregator',
            isAggregator: true,
            status: 'indexed',
            viewStatus: 'present',
          },
          {
            region: 'eu-west-1',
            indexType: 'local',
            status: 'indexed',
            viewStatus: 'present',
          },
        ],
        totalRegionCount: 2,
      },
      regions: ['eu-central-1', 'eu-west-1'],
      reusedIndexCount: 2,
      status: 'EXISTING',
      verificationStatus: 'verified',
    });
    expect(mockedListAwsDiscoveryIndexes).toHaveBeenCalledWith('eu-central-1');
    expect(mockedCreateAwsResourceExplorerSetup).not.toHaveBeenCalled();
    expect(mockedUpdateAwsResourceExplorerIndexType).toHaveBeenCalledWith('eu-central-1', 'aggregator');
    expect(mockedWaitForAwsResourceExplorerIndex).toHaveBeenCalledWith('eu-central-1');
  });

  it('creates a new setup in the current region when no aggregator exists', async () => {
    mockedListAwsDiscoveryIndexes.mockResolvedValue([]);
    mockedResolveCurrentAwsRegion.mockResolvedValue('eu-central-1');
    mockedListEnabledAwsRegions.mockResolvedValue(['eu-central-1', 'eu-west-1']);
    mockedCreateAwsResourceExplorerSetup.mockResolvedValue({
      aggregatorRegion: 'eu-central-1',
      indexType: 'aggregator',
      regions: ['eu-central-1', 'eu-west-1'],
      status: 'CREATED',
      taskId: 'task-123',
    });
    mockedWaitForAwsResourceExplorerSetup.mockResolvedValue('verified');
    mockedGetAwsDiscoveryRegionStatus
      .mockResolvedValueOnce({
        region: 'eu-central-1',
        status: 'not_indexed',
      })
      .mockResolvedValueOnce({
        region: 'eu-west-1',
        status: 'not_indexed',
      })
      .mockResolvedValueOnce({
        region: 'eu-central-1',
        indexType: 'aggregator',
        isAggregator: true,
        status: 'indexed',
        viewStatus: 'present',
      })
      .mockResolvedValueOnce({
        region: 'eu-west-1',
        indexType: 'local',
        status: 'indexed',
        viewStatus: 'present',
      });

    await expect(initializeAwsDiscovery()).resolves.toEqual({
      aggregatorAction: 'created',
      aggregatorRegion: 'eu-central-1',
      coverage: 'full',
      createdIndexCount: 2,
      indexType: 'aggregator',
      observedStatus: {
        accessibleRegionCount: 2,
        aggregatorRegion: 'eu-central-1',
        coverage: 'full',
        indexedRegionCount: 2,
        regions: [
          {
            region: 'eu-central-1',
            indexType: 'aggregator',
            isAggregator: true,
            status: 'indexed',
            viewStatus: 'present',
          },
          {
            region: 'eu-west-1',
            indexType: 'local',
            status: 'indexed',
            viewStatus: 'present',
          },
        ],
        totalRegionCount: 2,
      },
      regions: ['eu-central-1', 'eu-west-1'],
      reusedIndexCount: 0,
      status: 'CREATED',
      taskId: 'task-123',
      verificationStatus: 'verified',
    });
    expect(mockedCreateAwsResourceExplorerSetup).toHaveBeenCalledWith({
      aggregatorRegion: 'eu-central-1',
      region: 'eu-central-1',
      regions: ['eu-central-1', 'eu-west-1'],
    });
  });

  it('keeps setup status as CREATED when a new setup task starts but verification times out before indexes appear', async () => {
    mockedListAwsDiscoveryIndexes.mockResolvedValue([]);
    mockedResolveCurrentAwsRegion.mockResolvedValue('eu-central-1');
    mockedListEnabledAwsRegions.mockResolvedValue(['eu-central-1', 'eu-west-1']);
    mockedCreateAwsResourceExplorerSetup.mockResolvedValue({
      aggregatorRegion: 'eu-central-1',
      indexType: 'aggregator',
      regions: ['eu-central-1', 'eu-west-1'],
      status: 'CREATED',
      taskId: 'task-timeout',
    });
    mockedWaitForAwsResourceExplorerSetup.mockResolvedValue('timed_out');
    mockedGetAwsDiscoveryRegionStatus
      .mockResolvedValueOnce({
        region: 'eu-central-1',
        status: 'not_indexed',
      })
      .mockResolvedValueOnce({
        region: 'eu-west-1',
        status: 'not_indexed',
      })
      .mockResolvedValueOnce({
        region: 'eu-central-1',
        status: 'not_indexed',
      })
      .mockResolvedValueOnce({
        region: 'eu-west-1',
        status: 'not_indexed',
      });

    await expect(initializeAwsDiscovery()).resolves.toEqual({
      aggregatorAction: 'none',
      aggregatorRegion: 'eu-central-1',
      coverage: 'none',
      createdIndexCount: 0,
      indexType: 'aggregator',
      observedStatus: {
        accessibleRegionCount: 2,
        aggregatorRegion: undefined,
        coverage: 'none',
        indexedRegionCount: 0,
        regions: [
          {
            region: 'eu-central-1',
            status: 'not_indexed',
          },
          {
            region: 'eu-west-1',
            status: 'not_indexed',
          },
        ],
        totalRegionCount: 2,
      },
      regions: [],
      reusedIndexCount: 0,
      status: 'CREATED',
      taskId: 'task-timeout',
      verificationStatus: 'timed_out',
    });
  });

  it('does not fall back to local-only setup when access is denied after setup creation succeeds', async () => {
    mockedListAwsDiscoveryIndexes.mockResolvedValue([]);
    mockedResolveCurrentAwsRegion.mockResolvedValue('eu-central-1');
    mockedListEnabledAwsRegions.mockResolvedValue(['eu-central-1', 'eu-west-1']);
    mockedCreateAwsResourceExplorerSetup.mockResolvedValue({
      aggregatorRegion: 'eu-central-1',
      indexType: 'aggregator',
      regions: ['eu-central-1', 'eu-west-1'],
      status: 'CREATED',
      taskId: 'task-123',
    });
    mockedWaitForAwsResourceExplorerSetup.mockResolvedValue('verified');
    mockedGetAwsDiscoveryRegionStatus
      .mockResolvedValueOnce({
        region: 'eu-central-1',
        status: 'not_indexed',
      })
      .mockResolvedValueOnce({
        region: 'eu-west-1',
        status: 'not_indexed',
      })
      .mockRejectedValueOnce(
        Object.assign(new Error('User is not authorized to perform: resource-explorer-2:GetResourceExplorerSetup'), {
          name: 'AccessDeniedException',
        }),
      );

    await expect(initializeAwsDiscovery()).rejects.toMatchObject({
      name: 'AccessDeniedException',
    });
    expect(mockedCreateAwsResourceExplorerSetup).toHaveBeenCalledTimes(1);
  });

  it('falls back to local-only setup when aggregator creation is denied', async () => {
    mockedListAwsDiscoveryIndexes.mockResolvedValue([]);
    mockedResolveCurrentAwsRegion.mockResolvedValue('eu-central-1');
    mockedCreateAwsResourceExplorerSetup
      .mockRejectedValueOnce(
        Object.assign(new Error('User is not authorized to perform: resource-explorer-2:CreateIndex'), {
          name: 'AccessDeniedException',
        }),
      )
      .mockResolvedValueOnce({
        aggregatorRegion: 'eu-central-1',
        indexType: 'local',
        regions: ['eu-central-1'],
        status: 'CREATED',
        taskId: 'task-456',
        warning: 'Cross-region Resource Explorer setup could not be created; using a local index in eu-central-1.',
      });
    mockedWaitForAwsResourceExplorerSetup.mockResolvedValue('verified');
    mockedListEnabledAwsRegions.mockResolvedValue(['eu-central-1', 'eu-west-1']);
    mockedGetAwsDiscoveryRegionStatus
      .mockResolvedValueOnce({
        region: 'eu-central-1',
        status: 'not_indexed',
      })
      .mockResolvedValueOnce({
        region: 'eu-west-1',
        status: 'access_denied',
        notes: 'Access denied by SCP.',
      })
      .mockResolvedValueOnce({
        region: 'eu-central-1',
        indexType: 'local',
        status: 'indexed',
        viewStatus: 'present',
      })
      .mockResolvedValueOnce({
        region: 'eu-west-1',
        status: 'access_denied',
        notes: 'Access denied by SCP.',
      });

    await expect(initializeAwsDiscovery()).resolves.toEqual({
      aggregatorAction: 'none',
      aggregatorRegion: 'eu-central-1',
      coverage: 'local_only',
      createdIndexCount: 1,
      indexType: 'local',
      observedStatus: {
        aggregatorRegion: undefined,
        accessibleRegionCount: 1,
        coverage: 'local_only',
        indexedRegionCount: 1,
        regions: [
          {
            region: 'eu-central-1',
            indexType: 'local',
            status: 'indexed',
            viewStatus: 'present',
          },
          {
            region: 'eu-west-1',
            status: 'access_denied',
            notes: 'Access denied by SCP.',
          },
        ],
        totalRegionCount: 2,
        warning:
          'Discovery coverage is limited. 1 of 2 regions could not be inspected, which may be intentional if SCPs restrict regional Resource Explorer access.',
      },
      regions: ['eu-central-1'],
      reusedIndexCount: 0,
      status: 'CREATED',
      taskId: 'task-456',
      verificationStatus: 'verified',
      warning:
        'Discovery coverage is limited. 1 of 2 regions could not be inspected, which may be intentional if SCPs restrict regional Resource Explorer access.',
    });
    expect(mockedCreateAwsResourceExplorerSetup).toHaveBeenNthCalledWith(1, {
      aggregatorRegion: 'eu-central-1',
      region: 'eu-central-1',
      regions: ['eu-central-1', 'eu-west-1'],
    });
    expect(mockedCreateAwsResourceExplorerSetup).toHaveBeenNthCalledWith(2, {
      region: 'eu-central-1',
      regions: ['eu-central-1'],
    });
  });

  it('reports an existing local index when aggregator creation is denied', async () => {
    mockedResolveCurrentAwsRegion.mockResolvedValue('eu-central-1');
    mockedListAwsDiscoveryIndexes.mockResolvedValue([{ region: 'eu-central-1', type: 'local' }]);
    mockedCreateAwsResourceExplorerSetup.mockRejectedValueOnce(
      Object.assign(new Error('User is not authorized to perform: resource-explorer-2:CreateIndex'), {
        name: 'AccessDeniedException',
      }),
    );
    mockedListEnabledAwsRegions.mockResolvedValue(['eu-central-1', 'eu-west-1']);
    mockedGetAwsDiscoveryRegionStatus
      .mockResolvedValueOnce({
        region: 'eu-central-1',
        indexType: 'local',
        status: 'indexed',
        viewStatus: 'present',
      })
      .mockResolvedValueOnce({
        region: 'eu-west-1',
        status: 'access_denied',
        notes: 'Access denied by SCP.',
      })
      .mockResolvedValueOnce({
        region: 'eu-central-1',
        indexType: 'local',
        status: 'indexed',
        viewStatus: 'present',
      })
      .mockResolvedValueOnce({
        region: 'eu-west-1',
        status: 'access_denied',
        notes: 'Access denied by SCP.',
      });

    await expect(initializeAwsDiscovery()).resolves.toEqual({
      aggregatorAction: 'none',
      aggregatorRegion: 'eu-central-1',
      coverage: 'local_only',
      createdIndexCount: 0,
      indexType: 'local',
      observedStatus: {
        aggregatorRegion: undefined,
        accessibleRegionCount: 1,
        coverage: 'local_only',
        indexedRegionCount: 1,
        regions: [
          {
            region: 'eu-central-1',
            indexType: 'local',
            status: 'indexed',
            viewStatus: 'present',
          },
          {
            region: 'eu-west-1',
            status: 'access_denied',
            notes: 'Access denied by SCP.',
          },
        ],
        totalRegionCount: 2,
        warning:
          'Discovery coverage is limited. 1 of 2 regions could not be inspected, which may be intentional if SCPs restrict regional Resource Explorer access.',
      },
      regions: ['eu-central-1'],
      reusedIndexCount: 1,
      status: 'EXISTING',
      verificationStatus: 'verified',
      warning:
        'Discovery coverage is limited. 1 of 2 regions could not be inspected, which may be intentional if SCPs restrict regional Resource Explorer access.',
    });
    expect(mockedCreateAwsResourceExplorerSetup).toHaveBeenCalledTimes(1);
    expect(mockedCreateAwsResourceExplorerSetup).toHaveBeenCalledWith({
      aggregatorRegion: 'eu-central-1',
      region: 'eu-central-1',
      regions: ['eu-central-1', 'eu-west-1'],
    });
  });

  it('fails clearly when another region is already the aggregator and a different region is requested explicitly', async () => {
    mockedListAwsDiscoveryIndexes.mockResolvedValue([
      { region: 'eu-central-1', type: 'aggregator' },
      { region: 'eu-west-1', type: 'local' },
    ]);
    mockObservedStatus([
      {
        region: 'eu-central-1',
        indexType: 'aggregator',
        isAggregator: true,
        status: 'indexed',
        viewStatus: 'present',
      },
      {
        region: 'eu-west-1',
        indexType: 'local',
        status: 'indexed',
        viewStatus: 'present',
      },
    ]);

    await expect(initializeAwsDiscovery('eu-west-1')).rejects.toMatchObject({
      code: 'RESOURCE_EXPLORER_AGGREGATOR_SWITCH_REQUIRES_DELAY',
      message:
        'AWS Resource Explorer already has an aggregator in eu-central-1. AWS requires demoting that index to LOCAL and waiting 24 hours before promoting eu-west-1 to be the new aggregator.',
    });
  });

  it('delegates region listing and supported resource type listing to the resource explorer module', async () => {
    mockedListAwsDiscoveryIndexes.mockResolvedValue([{ region: 'eu-west-1', type: 'local' }]);
    mockedListAwsDiscoverySupportedResourceTypes.mockResolvedValue([{ resourceType: 'ec2:volume', service: 'ec2' }]);

    await expect(listEnabledAwsDiscoveryRegions()).resolves.toEqual([{ region: 'eu-west-1', type: 'local' }]);
    await expect(listSupportedAwsResourceTypes()).resolves.toEqual([{ resourceType: 'ec2:volume', service: 'ec2' }]);
  });
});
