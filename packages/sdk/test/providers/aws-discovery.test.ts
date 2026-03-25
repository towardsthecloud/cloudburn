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
import { hydrateAwsApiGatewayStages } from '../../src/providers/aws/resources/apigateway.js';
import {
  hydrateAwsCloudFrontDistributionRequestActivity,
  hydrateAwsCloudFrontDistributions,
} from '../../src/providers/aws/resources/cloudfront.js';
import { hydrateAwsCloudTrailTrails } from '../../src/providers/aws/resources/cloudtrail.js';
import {
  hydrateAwsCloudWatchLogGroups,
  hydrateAwsCloudWatchLogMetricFilterCoverage,
  hydrateAwsCloudWatchLogStreams,
} from '../../src/providers/aws/resources/cloudwatch-logs.js';
import { hydrateAwsCostUsage } from '../../src/providers/aws/resources/cost-explorer.js';
import {
  hydrateAwsCostAnomalyMonitors,
  hydrateAwsCostGuardrailBudgets,
} from '../../src/providers/aws/resources/cost-guardrails.js';
import {
  hydrateAwsDynamoDbAutoscaling,
  hydrateAwsDynamoDbTables,
  hydrateAwsDynamoDbTableUtilization,
} from '../../src/providers/aws/resources/dynamodb.js';
import { hydrateAwsEbsSnapshots, hydrateAwsEbsVolumes } from '../../src/providers/aws/resources/ebs.js';
import { hydrateAwsEc2Instances } from '../../src/providers/aws/resources/ec2.js';
import { hydrateAwsEc2ReservedInstances } from '../../src/providers/aws/resources/ec2-reserved-instances.js';
import { hydrateAwsEc2InstanceUtilization } from '../../src/providers/aws/resources/ec2-utilization.js';
import { hydrateAwsEcrRepositories } from '../../src/providers/aws/resources/ecr.js';
import {
  hydrateAwsEcsClusters,
  hydrateAwsEcsContainerInstances,
  hydrateAwsEcsServices,
} from '../../src/providers/aws/resources/ecs.js';
import { hydrateAwsEcsAutoscaling } from '../../src/providers/aws/resources/ecs-autoscaling.js';
import { hydrateAwsEcsClusterMetrics } from '../../src/providers/aws/resources/ecs-cluster-metrics.js';
import { hydrateAwsEksNodegroups } from '../../src/providers/aws/resources/eks.js';
import {
  hydrateAwsElastiCacheClusterActivity,
  hydrateAwsElastiCacheClusters,
  hydrateAwsElastiCacheReservedNodes,
} from '../../src/providers/aws/resources/elasticache.js';
import {
  hydrateAwsEc2LoadBalancerRequestActivity,
  hydrateAwsEc2LoadBalancers,
  hydrateAwsEc2TargetGroups,
} from '../../src/providers/aws/resources/elbv2.js';
import { hydrateAwsEmrClusterMetrics, hydrateAwsEmrClusters } from '../../src/providers/aws/resources/emr.js';
import {
  hydrateAwsLambdaFunctionMetrics,
  hydrateAwsLambdaFunctions,
} from '../../src/providers/aws/resources/lambda.js';
import {
  hydrateAwsRdsInstances,
  hydrateAwsRdsReservedInstances,
  hydrateAwsRdsSnapshots,
} from '../../src/providers/aws/resources/rds.js';
import {
  hydrateAwsRdsInstanceActivity,
  hydrateAwsRdsInstanceCpuMetrics,
} from '../../src/providers/aws/resources/rds-activity.js';
import {
  hydrateAwsRedshiftClusterMetrics,
  hydrateAwsRedshiftClusters,
  hydrateAwsRedshiftReservedNodes,
} from '../../src/providers/aws/resources/redshift.js';
import {
  hydrateAwsRoute53HealthChecks,
  hydrateAwsRoute53Records,
  hydrateAwsRoute53Zones,
} from '../../src/providers/aws/resources/route53.js';
import { hydrateAwsS3BucketAnalyses } from '../../src/providers/aws/resources/s3.js';
import { hydrateAwsSecretsManagerSecrets } from '../../src/providers/aws/resources/secretsmanager.js';

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
  hydrateAwsEbsSnapshots: vi.fn(),
  hydrateAwsEbsVolumes: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/elasticache.js', () => ({
  hydrateAwsElastiCacheClusterActivity: vi.fn(),
  hydrateAwsElastiCacheClusters: vi.fn(),
  hydrateAwsElastiCacheReservedNodes: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/ecs-autoscaling.js', () => ({
  hydrateAwsEcsAutoscaling: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/ecs-cluster-metrics.js', () => ({
  hydrateAwsEcsClusterMetrics: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/ecs.js', () => ({
  hydrateAwsEcsClusters: vi.fn(),
  hydrateAwsEcsContainerInstances: vi.fn(),
  hydrateAwsEcsServices: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudtrail.js', () => ({
  hydrateAwsCloudTrailTrails: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/apigateway.js', () => ({
  hydrateAwsApiGatewayStages: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudfront.js', () => ({
  hydrateAwsCloudFrontDistributionRequestActivity: vi.fn(),
  hydrateAwsCloudFrontDistributions: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cloudwatch-logs.js', () => ({
  hydrateAwsCloudWatchLogGroups: vi.fn(),
  hydrateAwsCloudWatchLogMetricFilterCoverage: vi.fn(),
  hydrateAwsCloudWatchLogStreams: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cost-explorer.js', () => ({
  hydrateAwsCostUsage: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/cost-guardrails.js', () => ({
  hydrateAwsCostAnomalyMonitors: vi.fn(),
  hydrateAwsCostGuardrailBudgets: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/dynamodb.js', () => ({
  hydrateAwsDynamoDbAutoscaling: vi.fn(),
  hydrateAwsDynamoDbTableUtilization: vi.fn(),
  hydrateAwsDynamoDbTables: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/ecr.js', () => ({
  hydrateAwsEcrRepositories: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/eks.js', () => ({
  hydrateAwsEksNodegroups: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/emr.js', () => ({
  hydrateAwsEmrClusterMetrics: vi.fn(),
  hydrateAwsEmrClusters: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/ec2.js', () => ({
  hydrateAwsEc2Instances: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/ec2-utilization.js', () => ({
  hydrateAwsEc2InstanceUtilization: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/ec2-reserved-instances.js', () => ({
  hydrateAwsEc2ReservedInstances: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/lambda.js', () => ({
  hydrateAwsLambdaFunctionMetrics: vi.fn(),
  hydrateAwsLambdaFunctions: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/elbv2.js', () => ({
  hydrateAwsEc2LoadBalancerRequestActivity: vi.fn(),
  hydrateAwsEc2LoadBalancers: vi.fn(),
  hydrateAwsEc2TargetGroups: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/rds.js', () => ({
  hydrateAwsRdsInstances: vi.fn(),
  hydrateAwsRdsReservedInstances: vi.fn(),
  hydrateAwsRdsSnapshots: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/rds-activity.js', () => ({
  hydrateAwsRdsInstanceActivity: vi.fn(),
  hydrateAwsRdsInstanceCpuMetrics: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/redshift.js', () => ({
  hydrateAwsRedshiftClusterMetrics: vi.fn(),
  hydrateAwsRedshiftClusters: vi.fn(),
  hydrateAwsRedshiftReservedNodes: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/route53.js', () => ({
  hydrateAwsRoute53HealthChecks: vi.fn(),
  hydrateAwsRoute53Records: vi.fn(),
  hydrateAwsRoute53Zones: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/s3.js', () => ({
  hydrateAwsS3BucketAnalyses: vi.fn(),
}));

vi.mock('../../src/providers/aws/resources/secretsmanager.js', () => ({
  hydrateAwsSecretsManagerSecrets: vi.fn(),
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
const mockedHydrateAwsApiGatewayStages = vi.mocked(hydrateAwsApiGatewayStages);
const mockedHydrateAwsCloudFrontDistributions = vi.mocked(hydrateAwsCloudFrontDistributions);
const _mockedHydrateAwsCloudFrontDistributionRequestActivity = vi.mocked(
  hydrateAwsCloudFrontDistributionRequestActivity,
);
const mockedHydrateAwsCloudTrailTrails = vi.mocked(hydrateAwsCloudTrailTrails);
const mockedHydrateAwsCloudWatchLogGroups = vi.mocked(hydrateAwsCloudWatchLogGroups);
const mockedHydrateAwsCloudWatchLogMetricFilterCoverage = vi.mocked(hydrateAwsCloudWatchLogMetricFilterCoverage);
const mockedHydrateAwsCloudWatchLogStreams = vi.mocked(hydrateAwsCloudWatchLogStreams);
const mockedHydrateAwsCostUsage = vi.mocked(hydrateAwsCostUsage);
const mockedHydrateAwsCostAnomalyMonitors = vi.mocked(hydrateAwsCostAnomalyMonitors);
const mockedHydrateAwsCostGuardrailBudgets = vi.mocked(hydrateAwsCostGuardrailBudgets);
const mockedHydrateAwsDynamoDbAutoscaling = vi.mocked(hydrateAwsDynamoDbAutoscaling);
const mockedHydrateAwsDynamoDbTableUtilization = vi.mocked(hydrateAwsDynamoDbTableUtilization);
const mockedHydrateAwsDynamoDbTables = vi.mocked(hydrateAwsDynamoDbTables);
const mockedHydrateAwsEbsSnapshots = vi.mocked(hydrateAwsEbsSnapshots);
const mockedHydrateAwsEbsVolumes = vi.mocked(hydrateAwsEbsVolumes);
const _mockedHydrateAwsElastiCacheClusterActivity = vi.mocked(hydrateAwsElastiCacheClusterActivity);
const mockedHydrateAwsElastiCacheClusters = vi.mocked(hydrateAwsElastiCacheClusters);
const mockedHydrateAwsElastiCacheReservedNodes = vi.mocked(hydrateAwsElastiCacheReservedNodes);
const mockedHydrateAwsEcsAutoscaling = vi.mocked(hydrateAwsEcsAutoscaling);
const mockedHydrateAwsEcsClusterMetrics = vi.mocked(hydrateAwsEcsClusterMetrics);
const mockedHydrateAwsEcsClusters = vi.mocked(hydrateAwsEcsClusters);
const mockedHydrateAwsEcsContainerInstances = vi.mocked(hydrateAwsEcsContainerInstances);
const mockedHydrateAwsEcsServices = vi.mocked(hydrateAwsEcsServices);
const mockedHydrateAwsEcrRepositories = vi.mocked(hydrateAwsEcrRepositories);
const mockedHydrateAwsEmrClusterMetrics = vi.mocked(hydrateAwsEmrClusterMetrics);
const mockedHydrateAwsEmrClusters = vi.mocked(hydrateAwsEmrClusters);
const mockedHydrateAwsEc2Instances = vi.mocked(hydrateAwsEc2Instances);
const mockedHydrateAwsEc2InstanceUtilization = vi.mocked(hydrateAwsEc2InstanceUtilization);
const mockedHydrateAwsEc2ReservedInstances = vi.mocked(hydrateAwsEc2ReservedInstances);
const mockedHydrateAwsEc2LoadBalancers = vi.mocked(hydrateAwsEc2LoadBalancers);
const _mockedHydrateAwsEc2LoadBalancerRequestActivity = vi.mocked(hydrateAwsEc2LoadBalancerRequestActivity);
const mockedHydrateAwsEc2TargetGroups = vi.mocked(hydrateAwsEc2TargetGroups);
const mockedHydrateAwsEksNodegroups = vi.mocked(hydrateAwsEksNodegroups);
const mockedHydrateAwsLambdaFunctionMetrics = vi.mocked(hydrateAwsLambdaFunctionMetrics);
const mockedHydrateAwsLambdaFunctions = vi.mocked(hydrateAwsLambdaFunctions);
const mockedHydrateAwsRdsInstanceActivity = vi.mocked(hydrateAwsRdsInstanceActivity);
const mockedHydrateAwsRdsInstanceCpuMetrics = vi.mocked(hydrateAwsRdsInstanceCpuMetrics);
const mockedHydrateAwsRdsInstances = vi.mocked(hydrateAwsRdsInstances);
const mockedHydrateAwsRdsReservedInstances = vi.mocked(hydrateAwsRdsReservedInstances);
const mockedHydrateAwsRdsSnapshots = vi.mocked(hydrateAwsRdsSnapshots);
const mockedHydrateAwsRedshiftClusterMetrics = vi.mocked(hydrateAwsRedshiftClusterMetrics);
const mockedHydrateAwsRedshiftClusters = vi.mocked(hydrateAwsRedshiftClusters);
const mockedHydrateAwsRedshiftReservedNodes = vi.mocked(hydrateAwsRedshiftReservedNodes);
const mockedHydrateAwsRoute53HealthChecks = vi.mocked(hydrateAwsRoute53HealthChecks);
const mockedHydrateAwsRoute53Records = vi.mocked(hydrateAwsRoute53Records);
const mockedHydrateAwsRoute53Zones = vi.mocked(hydrateAwsRoute53Zones);
const mockedHydrateAwsS3BucketAnalyses = vi.mocked(hydrateAwsS3BucketAnalyses);
const mockedHydrateAwsSecretsManagerSecrets = vi.mocked(hydrateAwsSecretsManagerSecrets);

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
      arn: 'arn:aws:ecr:us-east-1:123456789012:repository/app',
      properties: [],
      region: 'us-east-1',
      resourceType: 'ecr:repository',
      service: 'ecr',
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
    {
      accountId: '123456789012',
      arn: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/org-trail',
      properties: [],
      region: 'us-east-1',
      resourceType: 'cloudtrail:trail',
      service: 'cloudtrail',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
      properties: [],
      region: 'us-east-1',
      resourceType: 'logs:log-group',
      service: 'logs',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:ec2:us-east-1:123456789012:reserved-instances/abcd1234-ef56-7890-abcd-1234567890ab',
      properties: [],
      region: 'us-east-1',
      resourceType: 'ec2:reserved-instances',
      service: 'ec2',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
      properties: [],
      region: 'us-east-1',
      resourceType: 'elasticloadbalancing:loadbalancer/app',
      service: 'elasticloadbalancing',
    },
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
      arn: 'arn:aws:ecs:us-east-1:123456789012:container-instance/production/abc123',
      properties: [],
      region: 'us-east-1',
      resourceType: 'ecs:container-instance',
      service: 'ecs',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
      properties: [],
      region: 'us-east-1',
      resourceType: 'ecs:cluster',
      service: 'ecs',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:ecs:us-east-1:123456789012:service/production/web',
      properties: [],
      region: 'us-east-1',
      resourceType: 'ecs:service',
      service: 'ecs',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:eks:us-east-1:123456789012:cluster/production',
      properties: [],
      region: 'us-east-1',
      resourceType: 'eks:cluster',
      service: 'eks',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:elasticache:us-east-1:123456789012:cluster:cache-prod',
      properties: [],
      region: 'us-east-1',
      resourceType: 'elasticache:cluster',
      service: 'elasticache',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:elasticache:us-east-1:123456789012:reserved-instance:reserved-cache-prod',
      properties: [],
      region: 'us-east-1',
      resourceType: 'elasticache:reserved-instance',
      service: 'elasticache',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:emr:us-east-1:123456789012:cluster/j-CLUSTER1',
      properties: [],
      region: 'us-east-1',
      resourceType: 'elasticmapreduce:cluster',
      service: 'emr',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:redshift:us-east-1:123456789012:cluster:warehouse-prod',
      properties: [],
      region: 'us-east-1',
      resourceType: 'redshift:cluster',
      service: 'redshift',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:ec2:us-east-1:123456789012:snapshot/snap-123',
      properties: [],
      region: 'us-east-1',
      resourceType: 'ec2:snapshot',
      service: 'ec2',
    },
    {
      accountId: '123456789012',
      arn: 'arn:aws:rds:us-east-1:123456789012:snapshot:snapshot-123',
      properties: [],
      region: 'us-east-1',
      resourceType: 'rds:snapshot',
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
      {
        accountId: '123456789012',
        iops: 3000,
        region: 'us-east-1',
        sizeGiB: 128,
        volumeId: 'vol-123',
        volumeType: 'gp2',
      },
    ]);
    mockedHydrateAwsEcrRepositories.mockResolvedValue([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ecr:us-east-1:123456789012:repository/app',
        hasLifecyclePolicy: true,
        region: 'us-east-1',
        repositoryName: 'app',
      },
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
      {
        accountId: '123456789012',
        architectures: ['x86_64'],
        functionName: 'my-func',
        memorySizeMb: 512,
        region: 'us-east-1',
        timeoutSeconds: 60,
      },
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
          discoveryDependencies: ['aws-ecr-repositories'],
          service: 'ecr',
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-4',
          discoveryDependencies: ['aws-lambda-functions', 'aws-ebs-volumes'],
          service: 'lambda',
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-5',
          discoveryDependencies: ['aws-s3-bucket-analyses'],
          service: 's3',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'ec2:instance',
      'ec2:volume',
      'ecr:repository',
      'lambda:function',
      's3:bucket',
    ]);
    expect(mockedHydrateAwsEbsVolumes).toHaveBeenCalledWith([catalog.resources[0]]);
    expect(mockedHydrateAwsEc2Instances).toHaveBeenCalledWith([catalog.resources[1]]);
    expect(mockedHydrateAwsEcrRepositories).toHaveBeenCalledWith([catalog.resources[2]]);
    expect(mockedHydrateAwsLambdaFunctions).toHaveBeenCalledWith([catalog.resources[3]]);
    expect(mockedHydrateAwsS3BucketAnalyses).toHaveBeenCalledWith([catalog.resources[4]]);
    expect(result.catalog).toEqual(catalog);
    expect(result.resources).toBeInstanceOf(LiveResourceBag);
    expect(result.resources.get('aws-ebs-volumes')).toEqual([
      {
        accountId: '123456789012',
        iops: 3000,
        region: 'us-east-1',
        sizeGiB: 128,
        volumeId: 'vol-123',
        volumeType: 'gp2',
      },
    ]);
    expect(result.resources.get('aws-ec2-instances')).toEqual([
      {
        accountId: '123456789012',
        instanceId: 'i-123',
        instanceType: 'c6i.large',
        region: 'us-east-1',
      },
    ]);
    expect(result.resources.get('aws-ecr-repositories')).toEqual([
      {
        accountId: '123456789012',
        arn: 'arn:aws:ecr:us-east-1:123456789012:repository/app',
        hasLifecyclePolicy: true,
        region: 'us-east-1',
        repositoryName: 'app',
      },
    ]);
    expect(result.resources.get('aws-lambda-functions')).toEqual([
      {
        accountId: '123456789012',
        architectures: ['x86_64'],
        functionName: 'my-func',
        memorySizeMb: 512,
        region: 'us-east-1',
        timeoutSeconds: 60,
      },
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

  it('hydrates the new AWS discovery datasets from the expected global and regional resource types', async () => {
    const extendedCatalog: AwsDiscoveryCatalog = {
      indexType: 'AGGREGATOR',
      resources: [
        {
          accountId: '123456789012',
          arn: 'arn:aws:apigateway:us-east-1::/restapis/a1b2c3/stages/prod',
          properties: [],
          region: 'us-east-1',
          resourceType: 'apigateway:restapis/stages',
          service: 'apigateway',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
          properties: [],
          region: 'global',
          resourceType: 'cloudfront:distribution',
          service: 'cloudfront',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
          properties: [],
          region: 'us-east-1',
          resourceType: 'dynamodb:table',
          service: 'dynamodb',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:route53:::hostedzone/Z1234567890',
          name: 'example.com.',
          properties: [],
          region: 'global',
          resourceType: 'route53:hostedzone',
          service: 'route53',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:route53:::healthcheck/abcd1234',
          properties: [],
          region: 'global',
          resourceType: 'route53:healthcheck',
          service: 'route53',
        },
        {
          accountId: '123456789012',
          arn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:db-password-AbCdEf',
          properties: [],
          region: 'us-east-1',
          resourceType: 'secretsmanager:secret',
          service: 'secretsmanager',
        },
      ],
      searchRegion: 'us-east-1',
    };

    mockedBuildAwsDiscoveryCatalog.mockResolvedValue(extendedCatalog);
    mockedHydrateAwsApiGatewayStages.mockResolvedValue([
      {
        accountId: '123456789012',
        cacheClusterEnabled: false,
        region: 'us-east-1',
        restApiId: 'a1b2c3',
        stageArn: 'arn:aws:apigateway:us-east-1::/restapis/a1b2c3/stages/prod',
        stageName: 'prod',
      },
    ]);
    mockedHydrateAwsCloudFrontDistributions.mockResolvedValue([
      {
        accountId: '123456789012',
        distributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
        distributionId: 'E1234567890ABC',
        priceClass: 'PriceClass_All',
        region: 'global',
      },
    ]);
    mockedHydrateAwsCostUsage.mockResolvedValue([
      {
        accountId: '123456789012',
        costIncrease: 15,
        costUnit: 'USD',
        currentMonthCost: 25,
        previousMonthCost: 10,
        serviceName: 'Amazon DynamoDB',
        serviceSlug: 'amazon-dynamodb',
      },
    ]);
    mockedHydrateAwsDynamoDbTables.mockResolvedValue([
      {
        accountId: '123456789012',
        billingMode: 'PROVISIONED',
        latestStreamLabel: '2025-12-01T00:00:00.000',
        region: 'us-east-1',
        tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
        tableName: 'orders',
      },
    ]);
    mockedHydrateAwsDynamoDbAutoscaling.mockResolvedValue([
      {
        accountId: '123456789012',
        hasReadTarget: false,
        hasWriteTarget: false,
        region: 'us-east-1',
        tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
        tableName: 'orders',
      },
    ]);
    mockedHydrateAwsDynamoDbTableUtilization.mockResolvedValue([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
        tableName: 'orders',
        totalConsumedReadCapacityUnitsLast30Days: 0,
        totalConsumedWriteCapacityUnitsLast30Days: 0,
      },
    ]);
    mockedHydrateAwsRoute53Zones.mockResolvedValue([
      {
        accountId: '123456789012',
        hostedZoneArn: 'arn:aws:route53:::hostedzone/Z1234567890',
        hostedZoneId: 'Z1234567890',
        region: 'global',
        zoneName: 'example.com.',
      },
    ]);
    mockedHydrateAwsRoute53Records.mockResolvedValue([
      {
        accountId: '123456789012',
        hostedZoneId: 'Z1234567890',
        isAlias: false,
        recordId: 'arn:aws:route53:::hostedzone/Z1234567890/recordset/www.example.com./A',
        recordName: 'www.example.com.',
        recordType: 'A',
        region: 'global',
        ttl: 300,
      },
    ]);
    mockedHydrateAwsRoute53HealthChecks.mockResolvedValue([
      {
        accountId: '123456789012',
        healthCheckArn: 'arn:aws:route53:::healthcheck/abcd1234',
        healthCheckId: 'abcd1234',
        region: 'global',
      },
    ]);
    mockedHydrateAwsSecretsManagerSecrets.mockResolvedValue([
      {
        accountId: '123456789012',
        lastAccessedDate: '2025-12-01T00:00:00.000Z',
        region: 'us-east-1',
        secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:db-password-AbCdEf',
        secretName: 'db-password',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          service: 'apigateway',
          discoveryDependencies: ['aws-apigateway-stages'],
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-2',
          service: 'cloudfront',
          discoveryDependencies: ['aws-cloudfront-distributions'],
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-3',
          service: 'costexplorer',
          discoveryDependencies: ['aws-cost-usage'],
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-4',
          service: 'dynamodb',
          discoveryDependencies: ['aws-dynamodb-tables', 'aws-dynamodb-autoscaling', 'aws-dynamodb-table-utilization'],
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-5',
          service: 'route53',
          discoveryDependencies: ['aws-route53-zones', 'aws-route53-records', 'aws-route53-health-checks'],
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-6',
          service: 'secretsmanager',
          discoveryDependencies: ['aws-secretsmanager-secrets'],
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'apigateway:restapis/stages',
      'cloudfront:distribution',
      'dynamodb:table',
      'route53:healthcheck',
      'route53:hostedzone',
      'secretsmanager:secret',
    ]);
    expect(mockedHydrateAwsApiGatewayStages).toHaveBeenCalledWith([extendedCatalog.resources[0]]);
    expect(mockedHydrateAwsCloudFrontDistributions).toHaveBeenCalledWith([extendedCatalog.resources[1]]);
    expect(mockedHydrateAwsCostUsage).toHaveBeenCalledWith([]);
    expect(mockedHydrateAwsDynamoDbTables).toHaveBeenCalledWith([extendedCatalog.resources[2]]);
    expect(mockedHydrateAwsDynamoDbAutoscaling).toHaveBeenCalledWith([extendedCatalog.resources[2]]);
    expect(mockedHydrateAwsDynamoDbTableUtilization).toHaveBeenCalledWith([extendedCatalog.resources[2]]);
    expect(mockedHydrateAwsRoute53Zones).toHaveBeenCalledWith([extendedCatalog.resources[3]]);
    expect(mockedHydrateAwsRoute53Records).toHaveBeenCalledWith([extendedCatalog.resources[3]]);
    expect(mockedHydrateAwsRoute53HealthChecks).toHaveBeenCalledWith([extendedCatalog.resources[4]]);
    expect(mockedHydrateAwsSecretsManagerSecrets).toHaveBeenCalledWith([extendedCatalog.resources[5]]);
    expect(result.resources.get('aws-cost-usage')).toHaveLength(1);
    expect(result.resources.get('aws-route53-records')).toHaveLength(1);
  });

  it('loads account-scoped discovery datasets without building a Resource Explorer catalog', async () => {
    mockedResolveCurrentAwsRegion.mockResolvedValue('eu-west-1');
    mockedHydrateAwsCostUsage.mockResolvedValue([
      {
        accountId: '123456789012',
        costIncrease: 20,
        costUnit: 'USD',
        currentMonthCost: 40,
        previousMonthCost: 20,
        serviceName: 'Amazon Route 53',
        serviceSlug: 'amazon-route-53',
      },
    ]);
    mockedHydrateAwsCostGuardrailBudgets.mockResolvedValue([
      {
        accountId: '123456789012',
        budgetCount: 0,
      },
    ]);
    mockedHydrateAwsCostAnomalyMonitors.mockResolvedValue([
      {
        accountId: '123456789012',
        monitorCount: 0,
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          service: 'costexplorer',
          discoveryDependencies: ['aws-cost-usage'],
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-BUDGETS',
          service: 'costguardrails',
          discoveryDependencies: ['aws-cost-guardrail-budgets'],
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-ANOMALY',
          service: 'costguardrails',
          discoveryDependencies: ['aws-cost-anomaly-monitors'],
        }),
      ],
      { mode: 'region', region: 'eu-west-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).not.toHaveBeenCalled();
    expect(mockedHydrateAwsCostUsage).toHaveBeenCalledWith([]);
    expect(mockedHydrateAwsCostGuardrailBudgets).toHaveBeenCalledWith([]);
    expect(mockedHydrateAwsCostAnomalyMonitors).toHaveBeenCalledWith([]);
    expect(result.catalog).toEqual({
      indexType: 'LOCAL',
      resources: [],
      searchRegion: 'eu-west-1',
    });
    expect(result.resources.get('aws-cost-usage')).toEqual([
      {
        accountId: '123456789012',
        costIncrease: 20,
        costUnit: 'USD',
        currentMonthCost: 40,
        previousMonthCost: 20,
        serviceName: 'Amazon Route 53',
        serviceSlug: 'amazon-route-53',
      },
    ]);
    expect(result.resources.get('aws-cost-guardrail-budgets')).toEqual([
      {
        accountId: '123456789012',
        budgetCount: 0,
      },
    ]);
    expect(result.resources.get('aws-cost-anomaly-monitors')).toEqual([
      {
        accountId: '123456789012',
        monitorCount: 0,
      },
    ]);
  });

  it('hydrates CloudTrail trails when an active rule requires the CloudTrail dataset', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[6]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsCloudTrailTrails.mockResolvedValue([
      {
        accountId: '123456789012',
        homeRegion: 'us-east-1',
        isMultiRegionTrail: true,
        isOrganizationTrail: false,
        region: 'us-east-1',
        trailArn: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/org-trail',
        trailName: 'org-trail',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-cloudtrail-trails'],
          service: 'cloudtrail',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'cloudtrail:trail',
    ]);
    expect(mockedHydrateAwsCloudTrailTrails).toHaveBeenCalledWith([catalog.resources[6]]);
    expect(result.resources.get('aws-cloudtrail-trails')).toEqual([
      {
        accountId: '123456789012',
        homeRegion: 'us-east-1',
        isMultiRegionTrail: true,
        isOrganizationTrail: false,
        region: 'us-east-1',
        trailArn: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/org-trail',
        trailName: 'org-trail',
      },
    ]);
  });

  it('hydrates Lambda function metrics when an active rule requires the metrics dataset', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[3]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsLambdaFunctionMetrics.mockResolvedValue([
      {
        accountId: '123456789012',
        averageDurationMsLast7Days: 2_500,
        functionName: 'my-func',
        region: 'us-east-1',
        totalErrorsLast7Days: 12,
        totalInvocationsLast7Days: 100,
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-lambda-function-metrics'],
          service: 'lambda',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'lambda:function',
    ]);
    expect(mockedHydrateAwsLambdaFunctionMetrics).toHaveBeenCalledWith([catalog.resources[3]]);
    expect(result.resources.get('aws-lambda-function-metrics')).toEqual([
      {
        accountId: '123456789012',
        averageDurationMsLast7Days: 2_500,
        functionName: 'my-func',
        region: 'us-east-1',
        totalErrorsLast7Days: 12,
        totalInvocationsLast7Days: 100,
      },
    ]);
  });

  it('hydrates ECS and EKS datasets from their discovery resource types', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[11], catalog.resources[12], catalog.resources[13], catalog.resources[14]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsEcsContainerInstances.mockResolvedValue([
      {
        accountId: '123456789012',
        architecture: 'x86_64',
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        containerInstanceArn: 'arn:aws:ecs:us-east-1:123456789012:container-instance/production/abc123',
        ec2InstanceId: 'i-1234567890abcdef0',
        instanceType: 'm7i.large',
        region: 'us-east-1',
      },
    ]);
    mockedHydrateAwsEcsClusters.mockResolvedValue([
      {
        accountId: '123456789012',
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        region: 'us-east-1',
      },
    ]);
    mockedHydrateAwsEcsClusterMetrics.mockResolvedValue([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast14Days: 4.2,
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        region: 'us-east-1',
      },
    ]);
    mockedHydrateAwsEcsServices.mockResolvedValue([
      {
        accountId: '123456789012',
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        desiredCount: 2,
        region: 'us-east-1',
        schedulingStrategy: 'REPLICA',
        serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/production/web',
        serviceName: 'web',
        status: 'ACTIVE',
      },
    ]);
    mockedHydrateAwsEcsAutoscaling.mockResolvedValue([
      {
        accountId: '123456789012',
        clusterName: 'production',
        hasScalableTarget: true,
        hasScalingPolicy: true,
        region: 'us-east-1',
        serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/production/web',
        serviceName: 'web',
      },
    ]);
    mockedHydrateAwsEksNodegroups.mockResolvedValue([
      {
        accountId: '123456789012',
        amiType: 'AL2023_x86_64_STANDARD',
        clusterArn: 'arn:aws:eks:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        instanceTypes: ['m7i.large'],
        nodegroupArn: 'arn:aws:eks:us-east-1:123456789012:nodegroup/production/workers/abc123',
        nodegroupName: 'workers',
        region: 'us-east-1',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-ecs-container-instances'],
          service: 'ecs',
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-6',
          discoveryDependencies: ['aws-ecs-clusters', 'aws-ecs-cluster-metrics'],
          service: 'ecs',
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-7',
          discoveryDependencies: ['aws-ecs-services', 'aws-ecs-autoscaling'],
          service: 'ecs',
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-8',
          discoveryDependencies: ['aws-eks-nodegroups'],
          service: 'eks',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'ecs:cluster',
      'ecs:container-instance',
      'ecs:service',
      'eks:cluster',
    ]);
    expect(mockedHydrateAwsEcsContainerInstances).toHaveBeenCalledWith([catalog.resources[11]]);
    expect(mockedHydrateAwsEcsClusters).toHaveBeenCalledWith([catalog.resources[12]]);
    expect(mockedHydrateAwsEcsClusterMetrics).toHaveBeenCalledWith([catalog.resources[12]]);
    expect(mockedHydrateAwsEcsServices).toHaveBeenCalledWith([catalog.resources[13]]);
    expect(mockedHydrateAwsEcsAutoscaling).toHaveBeenCalledWith([catalog.resources[13]]);
    expect(mockedHydrateAwsEksNodegroups).toHaveBeenCalledWith([catalog.resources[14]]);
    expect(result.resources.get('aws-ecs-container-instances')).toEqual([
      {
        accountId: '123456789012',
        architecture: 'x86_64',
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        containerInstanceArn: 'arn:aws:ecs:us-east-1:123456789012:container-instance/production/abc123',
        ec2InstanceId: 'i-1234567890abcdef0',
        instanceType: 'm7i.large',
        region: 'us-east-1',
      },
    ]);
    expect(result.resources.get('aws-ecs-clusters')).toEqual([
      {
        accountId: '123456789012',
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        region: 'us-east-1',
      },
    ]);
    expect(result.resources.get('aws-ecs-cluster-metrics')).toEqual([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast14Days: 4.2,
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        region: 'us-east-1',
      },
    ]);
    expect(result.resources.get('aws-ecs-services')).toEqual([
      {
        accountId: '123456789012',
        clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        desiredCount: 2,
        region: 'us-east-1',
        schedulingStrategy: 'REPLICA',
        serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/production/web',
        serviceName: 'web',
        status: 'ACTIVE',
      },
    ]);
    expect(result.resources.get('aws-ecs-autoscaling')).toEqual([
      {
        accountId: '123456789012',
        clusterName: 'production',
        hasScalableTarget: true,
        hasScalingPolicy: true,
        region: 'us-east-1',
        serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/production/web',
        serviceName: 'web',
      },
    ]);
    expect(result.resources.get('aws-eks-nodegroups')).toEqual([
      {
        accountId: '123456789012',
        amiType: 'AL2023_x86_64_STANDARD',
        clusterArn: 'arn:aws:eks:us-east-1:123456789012:cluster/production',
        clusterName: 'production',
        instanceTypes: ['m7i.large'],
        nodegroupArn: 'arn:aws:eks:us-east-1:123456789012:nodegroup/production/workers/abc123',
        nodegroupName: 'workers',
        region: 'us-east-1',
      },
    ]);
  });

  it('hydrates ElastiCache, EMR, and Redshift datasets when active rules require them', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[15], catalog.resources[16], catalog.resources[17], catalog.resources[18]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsElastiCacheClusters.mockResolvedValue([
      {
        accountId: '123456789012',
        cacheClusterCreateTime: '2025-01-01T00:00:00.000Z',
        cacheClusterId: 'cache-prod',
        cacheClusterStatus: 'available',
        cacheNodeType: 'cache.r6g.large',
        engine: 'redis',
        numCacheNodes: 2,
        region: 'us-east-1',
      },
    ]);
    mockedHydrateAwsElastiCacheReservedNodes.mockResolvedValue([
      {
        accountId: '123456789012',
        cacheNodeCount: 2,
        cacheNodeType: 'cache.r6g.large',
        productDescription: 'redis',
        region: 'us-east-1',
        reservedCacheNodeId: 'reserved-cache-prod',
        state: 'active',
      },
    ]);
    mockedHydrateAwsEmrClusters.mockResolvedValue([
      {
        accountId: '123456789012',
        clusterId: 'j-CLUSTER1',
        clusterName: 'analytics',
        instanceTypes: ['m8g.xlarge'],
        region: 'us-east-1',
        state: 'RUNNING',
      },
    ]);
    mockedHydrateAwsEmrClusterMetrics.mockResolvedValue([
      {
        accountId: '123456789012',
        clusterId: 'j-CLUSTER1',
        idlePeriodsLast30Minutes: 6,
        region: 'us-east-1',
      },
    ]);
    mockedHydrateAwsRedshiftClusters.mockResolvedValue([
      {
        accountId: '123456789012',
        automatedSnapshotRetentionPeriod: 1,
        clusterIdentifier: 'warehouse-prod',
        clusterStatus: 'available',
        hasPauseSchedule: false,
        hasResumeSchedule: true,
        hsmEnabled: false,
        nodeType: 'ra3.xlplus',
        numberOfNodes: 2,
        region: 'us-east-1',
        vpcId: 'vpc-123',
      },
    ]);
    mockedHydrateAwsRedshiftClusterMetrics.mockResolvedValue([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast14Days: 4,
        clusterIdentifier: 'warehouse-prod',
        region: 'us-east-1',
      },
    ]);
    mockedHydrateAwsRedshiftReservedNodes.mockResolvedValue([
      {
        accountId: '123456789012',
        nodeCount: 2,
        nodeType: 'ra3.xlplus',
        region: 'us-east-1',
        reservedNodeId: 'reserved-node-1',
        state: 'active',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-elasticache-clusters', 'aws-elasticache-reserved-nodes'],
          id: 'CLDBRN-AWS-TEST-ELASTICACHE-1',
          service: 'elasticache',
        }),
        createRule({
          discoveryDependencies: ['aws-emr-clusters', 'aws-emr-cluster-metrics'],
          id: 'CLDBRN-AWS-TEST-EMR-1',
          service: 'emr',
        }),
        createRule({
          discoveryDependencies: [
            'aws-redshift-clusters',
            'aws-redshift-cluster-metrics',
            'aws-redshift-reserved-nodes',
          ],
          id: 'CLDBRN-AWS-TEST-REDSHIFT-1',
          service: 'redshift',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'elasticache:cluster',
      'elasticache:reserved-instance',
      'elasticmapreduce:cluster',
      'redshift:cluster',
    ]);
    expect(mockedHydrateAwsElastiCacheClusters).toHaveBeenCalledWith([catalog.resources[15]]);
    expect(mockedHydrateAwsElastiCacheReservedNodes).toHaveBeenCalledWith([catalog.resources[16]]);
    expect(mockedHydrateAwsEmrClusters).toHaveBeenCalledWith([catalog.resources[17]]);
    expect(mockedHydrateAwsEmrClusterMetrics).toHaveBeenCalledWith([catalog.resources[17]]);
    expect(mockedHydrateAwsRedshiftClusters).toHaveBeenCalledWith([catalog.resources[18]]);
    expect(mockedHydrateAwsRedshiftClusterMetrics).toHaveBeenCalledWith([catalog.resources[18]]);
    expect(mockedHydrateAwsRedshiftReservedNodes).toHaveBeenCalledWith([catalog.resources[18]]);
    expect(result.resources.get('aws-elasticache-clusters')).toHaveLength(1);
    expect(result.resources.get('aws-emr-cluster-metrics')).toHaveLength(1);
    expect(result.resources.get('aws-redshift-reserved-nodes')).toHaveLength(1);
  });

  it('hydrates CloudWatch log groups when an active rule requires the log-group dataset', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[7]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsCloudWatchLogGroups.mockResolvedValue([
      {
        accountId: '123456789012',
        logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
        logGroupClass: 'STANDARD',
        logGroupName: '/aws/lambda/app',
        region: 'us-east-1',
        retentionInDays: 30,
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-cloudwatch-log-groups'],
          service: 'cloudwatch',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'logs:log-group',
    ]);
    expect(mockedHydrateAwsCloudWatchLogGroups).toHaveBeenCalledWith([catalog.resources[7]]);
    expect(result.resources.get('aws-cloudwatch-log-groups')).toEqual([
      {
        accountId: '123456789012',
        logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
        logGroupClass: 'STANDARD',
        logGroupName: '/aws/lambda/app',
        region: 'us-east-1',
        retentionInDays: 30,
      },
    ]);
  });

  it('hydrates CloudWatch log groups and log streams from the same log-group catalog resources', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[7]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsCloudWatchLogGroups.mockResolvedValue([
      {
        accountId: '123456789012',
        logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
        logGroupClass: 'STANDARD',
        logGroupName: '/aws/lambda/app',
        region: 'us-east-1',
        retentionInDays: 30,
      },
    ]);
    mockedHydrateAwsCloudWatchLogStreams.mockResolvedValue([
      {
        accountId: '123456789012',
        arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app:log-stream:2026/03/16/[$LATEST]abc',
        lastIngestionTime: 1_710_000_000_000,
        logGroupName: '/aws/lambda/app',
        logStreamName: '2026/03/16/[$LATEST]abc',
        region: 'us-east-1',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-cloudwatch-log-groups', 'aws-cloudwatch-log-streams'],
          service: 'cloudwatch',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'logs:log-group',
    ]);
    expect(mockedHydrateAwsCloudWatchLogGroups).toHaveBeenCalledWith([catalog.resources[7]]);
    expect(mockedHydrateAwsCloudWatchLogStreams).toHaveBeenCalledWith([catalog.resources[7]]);
    expect(result.resources.get('aws-cloudwatch-log-groups')).toEqual([
      {
        accountId: '123456789012',
        logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
        logGroupClass: 'STANDARD',
        logGroupName: '/aws/lambda/app',
        region: 'us-east-1',
        retentionInDays: 30,
      },
    ]);
    expect(result.resources.get('aws-cloudwatch-log-streams')).toEqual([
      {
        accountId: '123456789012',
        arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app:log-stream:2026/03/16/[$LATEST]abc',
        lastIngestionTime: 1_710_000_000_000,
        logGroupName: '/aws/lambda/app',
        logStreamName: '2026/03/16/[$LATEST]abc',
        region: 'us-east-1',
      },
    ]);
  });

  it('hydrates CloudWatch log metric-filter coverage from log-group catalog resources', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[7]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsCloudWatchLogMetricFilterCoverage.mockResolvedValue([
      {
        accountId: '123456789012',
        logGroupName: '/aws/lambda/app',
        metricFilterCount: 0,
        region: 'us-east-1',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-cloudwatch-log-metric-filter-coverage'],
          service: 'cloudwatch',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'logs:log-group',
    ]);
    expect(mockedHydrateAwsCloudWatchLogMetricFilterCoverage).toHaveBeenCalledWith([catalog.resources[7]]);
    expect(result.resources.get('aws-cloudwatch-log-metric-filter-coverage')).toEqual([
      {
        accountId: '123456789012',
        logGroupName: '/aws/lambda/app',
        metricFilterCount: 0,
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
    expect(mockedHydrateAwsS3BucketAnalyses).toHaveBeenCalledWith([catalog.resources[4]]);
    expect(mockedHydrateAwsEbsVolumes).not.toHaveBeenCalled();
    expect(mockedHydrateAwsEc2Instances).not.toHaveBeenCalled();
    expect(mockedHydrateAwsLambdaFunctions).not.toHaveBeenCalled();
  });

  it('hydrates reserved instances and ELB datasets when active rules require them', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[8], catalog.resources[9], catalog.resources[10]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsEc2ReservedInstances.mockResolvedValue([
      {
        accountId: '123456789012',
        endTime: '2026-03-01T00:00:00.000Z',
        instanceType: 'm6i.large',
        region: 'us-east-1',
        reservedInstancesId: 'abcd1234-ef56-7890-abcd-1234567890ab',
        state: 'active',
      },
    ]);
    mockedHydrateAwsEc2LoadBalancers.mockResolvedValue([
      {
        accountId: '123456789012',
        attachedTargetGroupArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123'],
        instanceCount: 0,
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
        loadBalancerName: 'alb',
        loadBalancerType: 'application',
        region: 'us-east-1',
      },
    ]);
    mockedHydrateAwsEc2TargetGroups.mockResolvedValue([
      {
        accountId: '123456789012',
        loadBalancerArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123'],
        region: 'us-east-1',
        registeredTargetCount: 0,
        targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-ec2-reserved-instances'],
        }),
        createRule({
          id: 'CLDBRN-AWS-TEST-2',
          discoveryDependencies: ['aws-ec2-load-balancers', 'aws-ec2-target-groups'],
          service: 'elb',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'ec2:reserved-instances',
      'elasticloadbalancing:loadbalancer',
      'elasticloadbalancing:loadbalancer/app',
      'elasticloadbalancing:loadbalancer/gwy',
      'elasticloadbalancing:loadbalancer/net',
      'elasticloadbalancing:targetgroup',
    ]);
    expect(mockedHydrateAwsEc2ReservedInstances).toHaveBeenCalledWith([catalog.resources[8]]);
    expect(mockedHydrateAwsEc2LoadBalancers).toHaveBeenCalledWith([catalog.resources[9]]);
    expect(mockedHydrateAwsEc2TargetGroups).toHaveBeenCalledWith([catalog.resources[10]]);
    expect(result.resources.get('aws-ec2-reserved-instances')).toEqual([
      {
        accountId: '123456789012',
        endTime: '2026-03-01T00:00:00.000Z',
        instanceType: 'm6i.large',
        region: 'us-east-1',
        reservedInstancesId: 'abcd1234-ef56-7890-abcd-1234567890ab',
        state: 'active',
      },
    ]);
    expect(result.resources.get('aws-ec2-load-balancers')).toEqual([
      {
        accountId: '123456789012',
        attachedTargetGroupArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123'],
        instanceCount: 0,
        loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
        loadBalancerName: 'alb',
        loadBalancerType: 'application',
        region: 'us-east-1',
      },
    ]);
    expect(result.resources.get('aws-ec2-target-groups')).toEqual([
      {
        accountId: '123456789012',
        loadBalancerArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123'],
        region: 'us-east-1',
        registeredTargetCount: 0,
        targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/alb/123',
      },
    ]);
  });

  it('hydrates RDS DB instances when an active rule requires the shared RDS dataset', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue(catalog);
    mockedHydrateAwsRdsInstances.mockResolvedValue([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'legacy-db',
        dbInstanceStatus: 'available',
        engine: 'mysql',
        engineVersion: '8.0.39',
        instanceClass: 'db.m6i.large',
        instanceCreateTime: '2025-01-01T00:00:00.000Z',
        multiAz: false,
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
    expect(mockedHydrateAwsRdsInstances).toHaveBeenCalledWith([catalog.resources[5]]);
    expect(result.resources.get('aws-rds-instances' as never)).toEqual([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'legacy-db',
        dbInstanceStatus: 'available',
        engine: 'mysql',
        engineVersion: '8.0.39',
        instanceClass: 'db.m6i.large',
        instanceCreateTime: '2025-01-01T00:00:00.000Z',
        multiAz: false,
        region: 'us-east-1',
      },
    ]);
  });

  it('hydrates RDS CPU summaries when an active rule requires low-utilization data', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[5]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsRdsInstanceCpuMetrics.mockResolvedValue([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast30Days: 8,
        dbInstanceIdentifier: 'legacy-db',
        region: 'us-east-1',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-rds-instance-cpu-metrics'],
          service: 'rds',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, ['rds:db']);
    expect(mockedHydrateAwsRdsInstanceCpuMetrics).toHaveBeenCalledWith([catalog.resources[5]]);
    expect(result.resources.get('aws-rds-instance-cpu-metrics')).toEqual([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast30Days: 8,
        dbInstanceIdentifier: 'legacy-db',
        region: 'us-east-1',
      },
    ]);
  });

  it('hydrates RDS reserved instances when an active rule requires reserved coverage data', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[5]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsRdsReservedInstances.mockResolvedValue([
      {
        accountId: '123456789012',
        instanceClass: 'db.m6i.large',
        instanceCount: 1,
        multiAz: false,
        productDescription: 'mysql',
        region: 'us-east-1',
        reservedDbInstanceId: 'ri-123',
        state: 'active',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-rds-reserved-instances'],
          service: 'rds',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, ['rds:db']);
    expect(mockedHydrateAwsRdsReservedInstances).toHaveBeenCalledWith([catalog.resources[5]]);
    expect(result.resources.get('aws-rds-reserved-instances')).toEqual([
      {
        accountId: '123456789012',
        instanceClass: 'db.m6i.large',
        instanceCount: 1,
        multiAz: false,
        productDescription: 'mysql',
        region: 'us-east-1',
        reservedDbInstanceId: 'ri-123',
        state: 'active',
      },
    ]);
  });

  it('hydrates EC2 low-utilization summaries when an active rule requires utilization data', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[1]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsEc2InstanceUtilization.mockResolvedValue([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast14Days: 4,
        averageDailyNetworkBytesLast14Days: 1024,
        instanceId: 'i-123',
        instanceType: 'c6i.large',
        lowUtilizationDays: 4,
        region: 'us-east-1',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-ec2-instance-utilization'],
          service: 'ec2',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'ec2:instance',
    ]);
    expect(mockedHydrateAwsEc2InstanceUtilization).toHaveBeenCalledWith([catalog.resources[1]]);
    expect(result.resources.get('aws-ec2-instance-utilization')).toEqual([
      {
        accountId: '123456789012',
        averageCpuUtilizationLast14Days: 4,
        averageDailyNetworkBytesLast14Days: 1024,
        instanceId: 'i-123',
        instanceType: 'c6i.large',
        lowUtilizationDays: 4,
        region: 'us-east-1',
      },
    ]);
  });

  it('hydrates RDS activity summaries when an active rule requires idle-instance data', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[5]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsRdsInstanceActivity.mockResolvedValue([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'legacy-db',
        instanceClass: 'db.m6i.large',
        maxDatabaseConnectionsLast7Days: 0,
        region: 'us-east-1',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-rds-instance-activity'],
          service: 'rds',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, ['rds:db']);
    expect(mockedHydrateAwsRdsInstanceActivity).toHaveBeenCalledWith([catalog.resources[5]]);
    expect(result.resources.get('aws-rds-instance-activity')).toEqual([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'legacy-db',
        instanceClass: 'db.m6i.large',
        maxDatabaseConnectionsLast7Days: 0,
        region: 'us-east-1',
      },
    ]);
  });

  it('hydrates EBS snapshots from snapshot catalog resources', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[19]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsEbsSnapshots.mockResolvedValue([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        snapshotId: 'snap-123',
        startTime: '2025-01-01T00:00:00.000Z',
        state: 'completed',
        volumeId: 'vol-123',
        volumeSizeGiB: 128,
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-ebs-snapshots'],
          service: 'ebs',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'ec2:snapshot',
    ]);
    expect(mockedHydrateAwsEbsSnapshots).toHaveBeenCalledWith([catalog.resources[19]]);
    expect(result.resources.get('aws-ebs-snapshots')).toEqual([
      {
        accountId: '123456789012',
        region: 'us-east-1',
        snapshotId: 'snap-123',
        startTime: '2025-01-01T00:00:00.000Z',
        state: 'completed',
        volumeId: 'vol-123',
        volumeSizeGiB: 128,
      },
    ]);
  });

  it('hydrates RDS snapshots from snapshot catalog resources', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[20]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsRdsSnapshots.mockResolvedValue([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'deleted-db',
        dbSnapshotIdentifier: 'snapshot-123',
        region: 'us-east-1',
        snapshotCreateTime: '2026-01-01T00:00:00.000Z',
        snapshotType: 'manual',
      },
    ]);

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-rds-snapshots'],
          service: 'rds',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(mockedBuildAwsDiscoveryCatalog).toHaveBeenCalledWith({ mode: 'region', region: 'us-east-1' }, [
      'rds:snapshot',
    ]);
    expect(mockedHydrateAwsRdsSnapshots).toHaveBeenCalledWith([catalog.resources[20]]);
    expect(result.resources.get('aws-rds-snapshots')).toEqual([
      {
        accountId: '123456789012',
        dbInstanceIdentifier: 'deleted-db',
        dbSnapshotIdentifier: 'snapshot-123',
        region: 'us-east-1',
        snapshotCreateTime: '2026-01-01T00:00:00.000Z',
        snapshotType: 'manual',
      },
    ]);
  });

  it('records a non-fatal diagnostic when one hydrator is access denied and continues loading other datasets', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue(catalog);
    mockedHydrateAwsEbsVolumes.mockResolvedValue([
      {
        accountId: '123456789012',
        iops: 3000,
        region: 'us-east-1',
        sizeGiB: 128,
        volumeId: 'vol-123',
        volumeType: 'gp3',
      },
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
      {
        accountId: '123456789012',
        iops: 3000,
        region: 'us-east-1',
        sizeGiB: 128,
        volumeId: 'vol-123',
        volumeType: 'gp3',
      },
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

  it('records a non-fatal diagnostic when ECR hydration is access denied', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[2]],
      searchRegion: 'us-east-1',
    });
    const accessDeniedCause = Object.assign(new Error('User is not authorized to perform: ecr:GetLifecyclePolicy'), {
      code: 'AccessDeniedException',
      name: 'AccessDeniedException',
      $metadata: {
        httpStatusCode: 403,
        requestId: 'req-ecr',
      },
    });
    mockedHydrateAwsEcrRepositories.mockRejectedValue(
      new Error(
        'Amazon ECR GetLifecyclePolicy failed in us-east-1 with AccessDeniedException: User is not authorized to perform: ecr:GetLifecyclePolicy Request ID: req-ecr.',
        {
          cause: accessDeniedCause,
        },
      ),
    );

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-ecr-repositories'],
          service: 'ecr',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(result.resources.get('aws-ecr-repositories')).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: 'AccessDeniedException',
        details:
          'Amazon ECR GetLifecyclePolicy failed in us-east-1 with AccessDeniedException: User is not authorized to perform: ecr:GetLifecyclePolicy Request ID: req-ecr.',
        message: 'Skipped ecr discovery in us-east-1 because access is denied by AWS permissions.',
        provider: 'aws',
        region: 'us-east-1',
        service: 'ecr',
        source: 'discovery',
        status: 'access_denied',
      },
    ]);
  });

  it('records a non-fatal diagnostic when EC2 utilization hydration is access denied', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[1]],
      searchRegion: 'us-east-1',
    });
    const accessDeniedCause = Object.assign(new Error('User is not authorized to perform: cloudwatch:GetMetricData'), {
      code: 'AccessDeniedException',
      name: 'AccessDeniedException',
      $metadata: {
        httpStatusCode: 403,
        requestId: 'req-ec2-metrics',
      },
    });
    mockedHydrateAwsEc2InstanceUtilization.mockRejectedValue(
      new Error(
        'Amazon CloudWatch GetMetricData failed in us-east-1 with AccessDeniedException: User is not authorized to perform: cloudwatch:GetMetricData Request ID: req-ec2-metrics.',
        {
          cause: accessDeniedCause,
        },
      ),
    );

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-ec2-instance-utilization'],
          service: 'ec2',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(result.resources.get('aws-ec2-instance-utilization')).toEqual([]);
    expect(result.diagnostics).toEqual([
      {
        code: 'AccessDeniedException',
        details:
          'Amazon CloudWatch GetMetricData failed in us-east-1 with AccessDeniedException: User is not authorized to perform: cloudwatch:GetMetricData Request ID: req-ec2-metrics.',
        message: 'Skipped ec2 discovery in us-east-1 because access is denied by AWS permissions.',
        provider: 'aws',
        region: 'us-east-1',
        service: 'ec2',
        source: 'discovery',
        status: 'access_denied',
      },
    ]);
  });

  it('records loader-supplied diagnostics without dropping the loaded dataset', async () => {
    mockedBuildAwsDiscoveryCatalog.mockResolvedValue({
      indexType: 'LOCAL',
      resources: [catalog.resources[18]],
      searchRegion: 'us-east-1',
    });
    mockedHydrateAwsRedshiftClusters.mockResolvedValue({
      diagnostics: [
        {
          code: 'AccessDeniedException',
          details: 'Access denied',
          message:
            'Skipped redshift schedule discovery in us-east-1 because access is denied by AWS permissions. Pause/resume findings may be incomplete.',
          provider: 'aws',
          region: 'us-east-1',
          service: 'redshift',
          source: 'discovery',
          status: 'access_denied',
        },
      ],
      resources: [
        {
          accountId: '123456789012',
          automatedSnapshotRetentionPeriod: 1,
          clusterCreateTime: '2025-01-01T00:00:00.000Z',
          clusterIdentifier: 'warehouse-prod',
          clusterStatus: 'available',
          hasPauseSchedule: false,
          hasResumeSchedule: false,
          hsmEnabled: false,
          nodeType: 'ra3.xlplus',
          numberOfNodes: 2,
          pauseResumeStateAvailable: false,
          region: 'us-east-1',
          vpcId: 'vpc-123',
        },
      ],
    });

    const result = await discoverAwsResources(
      [
        createRule({
          discoveryDependencies: ['aws-redshift-clusters'],
          service: 'redshift',
        }),
      ],
      { mode: 'region', region: 'us-east-1' },
    );

    expect(result.resources.get('aws-redshift-clusters')).toEqual([
      {
        accountId: '123456789012',
        automatedSnapshotRetentionPeriod: 1,
        clusterCreateTime: '2025-01-01T00:00:00.000Z',
        clusterIdentifier: 'warehouse-prod',
        clusterStatus: 'available',
        hasPauseSchedule: false,
        hasResumeSchedule: false,
        hsmEnabled: false,
        nodeType: 'ra3.xlplus',
        numberOfNodes: 2,
        pauseResumeStateAvailable: false,
        region: 'us-east-1',
        vpcId: 'vpc-123',
      },
    ]);
    expect(result.diagnostics).toEqual([
      {
        code: 'AccessDeniedException',
        details: 'Access denied',
        message:
          'Skipped redshift schedule discovery in us-east-1 because access is denied by AWS permissions. Pause/resume findings may be incomplete.',
        provider: 'aws',
        region: 'us-east-1',
        service: 'redshift',
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
