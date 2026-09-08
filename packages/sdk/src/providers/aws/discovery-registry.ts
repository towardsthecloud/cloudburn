import {
  type AwsDiscoveredResource,
  type AwsDiscoveryCatalog,
  type AwsKmsKeyChurnReview,
  awsRules,
  createFindingMatch,
  createLiveEvaluationCoverage,
  type DiscoveryDatasetKey,
  type DiscoveryDatasetMap,
  type FindingMatch,
  getAwsCostOptimizationHubIdleResourceId,
  getAwsCostOptimizationHubIdleResourceType,
  getAwsCostOptimizationHubReservationResourceId,
  getAwsCostOptimizationHubReservationResourceType,
  getAwsCostOptimizationHubRightsizingResourceType,
  getAwsCostOptimizationHubUpgradeResourceId,
  getAwsCostOptimizationHubUpgradeResourceType,
  gravitonResourceTypes,
  type LiveEvaluationCoverage,
  LiveResourceBag,
  type Rule,
} from '@cloudburn/rules';
import type { EvaluatedResource, ScanDiagnostic } from '../../types.js';
import {
  hydrateAwsCloudFrontDistributionRequestActivity,
  hydrateAwsCloudFrontDistributions,
} from './resources/cloudfront.js';
import { hydrateAwsCloudTrailTrails } from './resources/cloudtrail.js';
import {
  hydrateAwsCloudWatchLogGroupRecentStreamActivity,
  hydrateAwsCloudWatchLogGroups,
  hydrateAwsCloudWatchLogStreams,
} from './resources/cloudwatch-logs.js';
import { hydrateAwsConfigRecordingFrequencyReviews } from './resources/config.js';
import { hydrateAwsCostUsage } from './resources/cost-explorer.js';
import { hydrateAwsCostAnomalyMonitors, hydrateAwsCostGuardrailBudgets } from './resources/cost-guardrails.js';
import {
  hydrateAwsCostOptimizationHubGravitonRecommendations,
  hydrateAwsCostOptimizationHubIdleRecommendations,
  hydrateAwsCostOptimizationHubReservationRecommendations,
  hydrateAwsCostOptimizationHubRightsizingRecommendations,
  hydrateAwsCostOptimizationHubSavingsPlansRecommendations,
  hydrateAwsCostOptimizationHubUpgradeRecommendations,
} from './resources/cost-optimization-hub.js';
import {
  hydrateAwsDynamoDbAutoscaling,
  hydrateAwsDynamoDbTables,
  hydrateAwsDynamoDbTableUtilization,
} from './resources/dynamodb.js';
import { hydrateAwsEbsSnapshots, hydrateAwsEbsVolumes } from './resources/ebs.js';
import { hydrateAwsEc2Instances } from './resources/ec2.js';
import { hydrateAwsEc2ElasticIps } from './resources/ec2-elastic-ips.js';
import { hydrateAwsEc2NatGatewayActivity } from './resources/ec2-nat-gateways.js';
import { hydrateAwsEc2ReservedInstances } from './resources/ec2-reserved-instances.js';
import { hydrateAwsEc2TransitGatewayVpcAttachmentActivity } from './resources/ec2-transit-gateway-vpc-attachments.js';
import { hydrateAwsEc2InstanceUtilization } from './resources/ec2-utilization.js';
import { hydrateAwsEcrRepositories } from './resources/ecr.js';
import { hydrateAwsEcsClusters, hydrateAwsEcsContainerInstances, hydrateAwsEcsServices } from './resources/ecs.js';
import { hydrateAwsEcsAutoscaling } from './resources/ecs-autoscaling.js';
import { hydrateAwsEcsClusterMetrics } from './resources/ecs-cluster-metrics.js';
import { hydrateAwsEksNodegroups } from './resources/eks.js';
import {
  hydrateAwsElastiCacheClusterActivity,
  hydrateAwsElastiCacheClusters,
  hydrateAwsElastiCacheReservedNodes,
} from './resources/elasticache.js';
import {
  hydrateAwsEc2LoadBalancerRequestActivity,
  hydrateAwsEc2LoadBalancers,
  hydrateAwsEc2TargetGroups,
} from './resources/elbv2.js';
import { hydrateAwsEmrClusterMetrics, hydrateAwsEmrClusters } from './resources/emr.js';
import { hydrateAwsKmsKeyChurnReviews, hydrateAwsKmsKeyUsage } from './resources/kms.js';
import {
  hydrateAwsLambdaFunctionMetrics,
  hydrateAwsLambdaFunctions,
  hydrateAwsLambdaMemoryRecommendations,
} from './resources/lambda.js';
import { hydrateAwsRdsInstances, hydrateAwsRdsReservedInstances, hydrateAwsRdsSnapshots } from './resources/rds.js';
import { hydrateAwsRdsInstanceActivity, hydrateAwsRdsInstanceCpuMetrics } from './resources/rds-activity.js';
import {
  hydrateAwsRedshiftClusterMetrics,
  hydrateAwsRedshiftClusters,
  hydrateAwsRedshiftReservedNodes,
} from './resources/redshift.js';
import {
  hydrateAwsRoute53HealthChecks,
  hydrateAwsRoute53Records,
  hydrateAwsRoute53Zones,
} from './resources/route53.js';
import { hydrateAwsS3BucketAnalyses } from './resources/s3.js';
import { hydrateAwsSageMakerEndpointActivity, hydrateAwsSageMakerNotebookInstances } from './resources/sagemaker.js';
import { hydrateAwsSageMakerSavingsPlansCoverage } from './resources/savings-plans-coverage.js';
import { hydrateAwsSecretsManagerSecrets } from './resources/secretsmanager.js';
import { hydrateAwsUntaggedResources } from './resources/tagging.js';
import { hydrateAwsEc2VpcEndpointActivity } from './resources/vpc-endpoints.js';

/**
 * Non-fatal discovery dataset result that keeps loaded resources while also
 * surfacing service-specific diagnostics for partially available data.
 */
export type AwsDiscoveryDatasetLoadResult<K extends DiscoveryDatasetKey = DiscoveryDatasetKey> = {
  diagnostics?: ScanDiagnostic[];
  resources: DiscoveryDatasetMap[K];
  /** Whether incomplete evidence prevents dependent rules from reaching a pass/fail decision. */
  unavailable?: boolean;
};

/**
 * Shared per-run loader context available to AWS discovery dataset hydrators.
 *
 * Hydrators can use this to reuse already-loading base datasets instead of
 * rehydrating the same resources multiple times in one discover run.
 */
/** Resolves discovery datasets already loading within the current run. */
export type AwsDiscoveryDatasetResolver = {
  loadDataset: <K extends DiscoveryDatasetKey>(datasetKey: K) => Promise<DiscoveryDatasetMap[K]>;
  listResourcesByFilter: (
    filterString: string,
    options?: { requiredViewProperties?: string[]; scope?: 'target' | 'account' },
  ) => Promise<AwsDiscoveredResource[]>;
};

/** Resolves the caller account ID through the current discovery run's cache. */
export type AwsAccountIdResolver = {
  resolveAccountId: () => Promise<string>;
};

/** Shared per-run capabilities available to AWS discovery dataset hydrators. */
export type AwsDiscoveryDatasetLoadContext = AwsDiscoveryDatasetResolver &
  AwsAccountIdResolver & {
    region?: string;
    /** Selected resource Regions; undefined means an all-region discovery target. */
    regions?: string[];
  };

/** Observation interval used by a dataset's loader, independently of cache freshness. */
export type AwsDiscoveryObservationPolicy =
  | { kind: 'current' }
  | { kind: 'window'; lookbackMs: number; alignmentMs: number }
  | { kind: 'calendar-months'; months: number };

/** Declarative definition for one rule-facing AWS discovery dataset. */
export type AwsDiscoveryDatasetDefinition<K extends DiscoveryDatasetKey = DiscoveryDatasetKey> = {
  datasetKey: K;
  /** Required datasets resolved before this loader runs. */
  dependencies: DiscoveryDatasetKey[];
  /** Filtered catalog evidence resolved and fingerprinted before dataset cache lookup. */
  catalogQueries?: Array<{
    filterString: string;
    requiredViewProperties?: string[];
    scope?: 'target' | 'account';
  }>;
  /** Increment when the normalized evidence shape changes. */
  schemaVersion: string;
  /** Increment when collection or normalization behavior changes. */
  loaderVersion: string;
  /** Initial TTLs are tunable freshness proposals, not measured source guarantees. */
  freshness: { ttlMs: number; observation: AwsDiscoveryObservationPolicy };
  /** Dataset completeness when rule coverage also depends on unrelated policy or evidence. */
  getEvidenceCoverage?: (resources: LiveResourceBag) => LiveEvaluationCoverage;
  toEvaluationResources?: (resources: DiscoveryDatasetMap[K]) => EvaluationResourceProjection[];
  resourceTypes: string[];
  service:
    | 'cloudfront'
    | 'cloudtrail'
    | 'cloudwatch'
    | 'config'
    | 'costguardrails'
    | 'costexplorer'
    | 'costoptimizationhub'
    | 'dynamodb'
    | 'ebs'
    | 'ec2'
    | 'ecs'
    | 'ecr'
    | 'eks'
    | 'elasticache'
    | 'elb'
    | 'emr'
    | 'lambda'
    | 'kms'
    | 'rds'
    | 'redshift'
    | 'route53'
    | 's3'
    | 'sagemaker'
    | 'secretsmanager'
    | 'tagging';
  load: (
    resources: AwsDiscoveredResource[],
    context: AwsDiscoveryDatasetLoadContext,
  ) => Promise<DiscoveryDatasetMap[K] | AwsDiscoveryDatasetLoadResult<K>>;
};

type EvaluationResourceProjection = FindingMatch &
  Partial<Pick<EvaluatedResource, 'arn' | 'createdAt' | 'data' | 'lastActivityAt' | 'name' | 'resourceType' | 'tags'>>;

const loadBalancerResourceTypes = {
  application: 'elasticloadbalancing:loadbalancer/app',
  classic: 'elasticloadbalancing:loadbalancer',
  gateway: 'elasticloadbalancing:loadbalancer/gwy',
  network: 'elasticloadbalancing:loadbalancer/net',
} as const;

const mapEvaluationResources = <T extends { accountId: string; region?: string }>(
  resources: T[],
  getResourceId: (resource: T) => string,
  getDetails?: (resource: T) => Omit<EvaluationResourceProjection, keyof FindingMatch>,
): EvaluationResourceProjection[] =>
  resources.map((resource) => {
    const match = createFindingMatch(getResourceId(resource), resource.region, resource.accountId);
    if (!getDetails) {
      return match;
    }
    const details = Object.fromEntries(
      Object.entries(getDetails(resource)).filter(([, value]) => value !== undefined),
    ) as Omit<EvaluationResourceProjection, keyof FindingMatch>;
    return {
      ...match,
      ...details,
    };
  });

const toKmsKeyChurnEvaluationData = ({ keys: _keys, ...review }: AwsKmsKeyChurnReview) => review;

type AwsRuleEvaluationOverride = {
  datasetKey: DiscoveryDatasetKey;
  resourceSetId?: string;
  toEvaluationResources?: (resources: LiveResourceBag) => EvaluationResourceProjection[];
};

const costGuardrailBudgetEvaluationOverride = {
  datasetKey: 'aws-cost-guardrail-budgets',
  resourceSetId: 'aws-cost-guardrail-budgets:budgets',
  toEvaluationResources: (resources) =>
    resources
      .get('aws-cost-guardrail-budgets')
      .flatMap((summary) =>
        (summary.budgets ?? []).map((budget) =>
          createFindingMatch(`budget/${budget.budgetName}`, undefined, summary.accountId),
        ),
      ),
} satisfies AwsRuleEvaluationOverride;

const awsRuleEvaluationOverrides: Record<string, AwsRuleEvaluationOverride> = {
  'CLDBRN-AWS-CLOUDWATCH-2': {
    datasetKey: 'aws-cloudwatch-log-group-recent-stream-activity',
  },
  'CLDBRN-AWS-COSTGUARDRAILS-3': costGuardrailBudgetEvaluationOverride,
  'CLDBRN-AWS-COSTGUARDRAILS-4': costGuardrailBudgetEvaluationOverride,
  'CLDBRN-AWS-ELB-5': {
    datasetKey: 'aws-ec2-load-balancers',
  },
  'CLDBRN-AWS-LAMBDA-4': {
    datasetKey: 'aws-lambda-functions',
    toEvaluationResources: (resources) =>
      mapEvaluationResources(
        resources
          .get('aws-lambda-functions')
          .filter((fn): fn is typeof fn & { functionArn: string } => fn.functionArn !== undefined),
        (fn) => fn.functionArn,
        (fn) => ({
          arn: fn.functionArn,
          name: fn.functionName,
        }),
      ),
  },
  'CLDBRN-AWS-ROUTE53-1': {
    datasetKey: 'aws-route53-records',
  },
};

const awsDiscoveryDatasetRegistry: {
  [K in DiscoveryDatasetKey]: AwsDiscoveryDatasetDefinition<K>;
} = {
  'aws-cloudtrail-trails': {
    datasetKey: 'aws-cloudtrail-trails',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['cloudtrail:trail'],
    service: 'cloudtrail',
    load: hydrateAwsCloudTrailTrails,
    toEvaluationResources: (trails) => mapEvaluationResources(trails, (trail) => trail.trailArn),
  },
  'aws-cloudfront-distributions': {
    datasetKey: 'aws-cloudfront-distributions',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['cloudfront:distribution'],
    service: 'cloudfront',
    load: hydrateAwsCloudFrontDistributions,
    toEvaluationResources: (distributions) =>
      mapEvaluationResources(distributions, (distribution) => distribution.distributionArn),
  },
  'aws-cloudfront-distribution-request-activity': {
    datasetKey: 'aws-cloudfront-distribution-request-activity',
    dependencies: ['aws-cloudfront-distributions'],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: {
      ttlMs: 300_000,
      observation: { kind: 'window', lookbackMs: 30 * 86_400_000, alignmentMs: 86_400_000 },
    },
    resourceTypes: ['cloudfront:distribution'],
    service: 'cloudfront',
    load: hydrateAwsCloudFrontDistributionRequestActivity,
    toEvaluationResources: (distributions) =>
      mapEvaluationResources(distributions, (distribution) => distribution.distributionArn),
  },
  'aws-cloudwatch-log-groups': {
    datasetKey: 'aws-cloudwatch-log-groups',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['logs:log-group'],
    service: 'cloudwatch',
    load: hydrateAwsCloudWatchLogGroups,
    toEvaluationResources: (logGroups) =>
      mapEvaluationResources(
        logGroups,
        (logGroup) => logGroup.logGroupName,
        (logGroup) => ({
          arn: logGroup.logGroupArn,
          name: logGroup.logGroupName,
        }),
      ),
  },
  'aws-cloudwatch-log-group-recent-stream-activity': {
    datasetKey: 'aws-cloudwatch-log-group-recent-stream-activity',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 300_000, observation: { kind: 'current' } },
    resourceTypes: ['logs:log-group'],
    service: 'cloudwatch',
    load: hydrateAwsCloudWatchLogGroupRecentStreamActivity,
    toEvaluationResources: (activity) =>
      mapEvaluationResources(
        activity.filter(
          (logGroup): logGroup is typeof logGroup & { logGroupArn: string } => logGroup.logGroupArn !== undefined,
        ),
        (logGroup) => logGroup.logGroupArn,
        (logGroup) => ({
          arn: logGroup.logGroupArn,
          lastActivityAt: logGroup.lastActivityAt,
          name: logGroup.logGroupName,
        }),
      ),
  },
  'aws-cloudwatch-log-streams': {
    datasetKey: 'aws-cloudwatch-log-streams',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['logs:log-group'],
    service: 'cloudwatch',
    load: hydrateAwsCloudWatchLogStreams,
  },
  'aws-config-recording-frequency-reviews': {
    datasetKey: 'aws-config-recording-frequency-reviews',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: {
      ttlMs: 300_000,
      observation: { kind: 'window', lookbackMs: 14 * 86_400_000, alignmentMs: 86_400_000 },
    },
    resourceTypes: [],
    service: 'config',
    load: hydrateAwsConfigRecordingFrequencyReviews,
    toEvaluationResources: (reviews) =>
      mapEvaluationResources(
        reviews,
        (review) => `${review.recorderArn}#${review.resourceType}`,
        (review) => ({
          arn: review.recorderArn,
          data: review,
          name: `${review.recorderName}: ${review.resourceType}`,
          resourceType: 'config:configuration-recorder',
        }),
      ),
  },
  'aws-cost-usage': {
    datasetKey: 'aws-cost-usage',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 21_600_000, observation: { kind: 'calendar-months', months: 2 } },
    resourceTypes: [],
    service: 'costexplorer',
    load: hydrateAwsCostUsage,
    toEvaluationResources: (services) => mapEvaluationResources(services, (service) => `cost/${service.serviceSlug}`),
  },
  'aws-cost-anomaly-monitors': {
    datasetKey: 'aws-cost-anomaly-monitors',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: [],
    service: 'costguardrails',
    load: hydrateAwsCostAnomalyMonitors,
    toEvaluationResources: (summaries) => mapEvaluationResources(summaries, (summary) => summary.accountId),
  },
  'aws-cost-guardrail-budgets': {
    datasetKey: 'aws-cost-guardrail-budgets',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: [],
    service: 'costguardrails',
    load: hydrateAwsCostGuardrailBudgets,
    toEvaluationResources: (summaries) => mapEvaluationResources(summaries, (summary) => summary.accountId),
  },
  'aws-dynamodb-autoscaling': {
    datasetKey: 'aws-dynamodb-autoscaling',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['dynamodb:table'],
    service: 'dynamodb',
    load: hydrateAwsDynamoDbAutoscaling,
  },
  'aws-dynamodb-table-utilization': {
    datasetKey: 'aws-dynamodb-table-utilization',
    dependencies: ['aws-dynamodb-tables'],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: {
      ttlMs: 300_000,
      observation: { kind: 'window', lookbackMs: 90 * 86_400_000, alignmentMs: 86_400_000 },
    },
    resourceTypes: ['dynamodb:table'],
    service: 'dynamodb',
    load: hydrateAwsDynamoDbTableUtilization,
    toEvaluationResources: (tables) => mapEvaluationResources(tables, (table) => table.tableArn),
  },
  'aws-dynamodb-tables': {
    datasetKey: 'aws-dynamodb-tables',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['dynamodb:table'],
    service: 'dynamodb',
    load: hydrateAwsDynamoDbTables,
    toEvaluationResources: (tables) => mapEvaluationResources(tables, (table) => table.tableArn),
  },
  'aws-ebs-snapshots': {
    datasetKey: 'aws-ebs-snapshots',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['ec2:snapshot'],
    service: 'ebs',
    load: hydrateAwsEbsSnapshots,
    toEvaluationResources: (snapshots) =>
      mapEvaluationResources(
        snapshots,
        (snapshot) => snapshot.snapshotId,
        (snapshot) => ({
          createdAt: snapshot.startTime,
        }),
      ),
  },
  'aws-ebs-volumes': {
    datasetKey: 'aws-ebs-volumes',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['ec2:volume'],
    service: 'ebs',
    load: hydrateAwsEbsVolumes,
    toEvaluationResources: (volumes) =>
      mapEvaluationResources(
        volumes,
        (volume) => volume.volumeId,
        (volume) => ({
          createdAt: volume.createTime,
        }),
      ),
  },
  'aws-elasticache-clusters': {
    datasetKey: 'aws-elasticache-clusters',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['elasticache:cluster'],
    service: 'elasticache',
    load: hydrateAwsElastiCacheClusters,
    toEvaluationResources: (clusters) => mapEvaluationResources(clusters, (cluster) => cluster.cacheClusterId),
  },
  'aws-elasticache-cluster-activity': {
    datasetKey: 'aws-elasticache-cluster-activity',
    dependencies: ['aws-elasticache-clusters'],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: {
      ttlMs: 300_000,
      observation: { kind: 'window', lookbackMs: 14 * 86_400_000, alignmentMs: 86_400_000 },
    },
    resourceTypes: ['elasticache:cluster'],
    service: 'elasticache',
    load: hydrateAwsElastiCacheClusterActivity,
  },
  'aws-elasticache-reserved-nodes': {
    datasetKey: 'aws-elasticache-reserved-nodes',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['elasticache:reserved-instance'],
    service: 'elasticache',
    load: hydrateAwsElastiCacheReservedNodes,
  },
  'aws-ecs-autoscaling': {
    datasetKey: 'aws-ecs-autoscaling',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['ecs:service'],
    service: 'ecs',
    load: hydrateAwsEcsAutoscaling,
  },
  'aws-ecs-cluster-metrics': {
    datasetKey: 'aws-ecs-cluster-metrics',
    dependencies: ['aws-ecs-clusters'],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: {
      ttlMs: 300_000,
      observation: { kind: 'window', lookbackMs: 14 * 86_400_000, alignmentMs: 86_400_000 },
    },
    resourceTypes: ['ecs:cluster'],
    service: 'ecs',
    load: hydrateAwsEcsClusterMetrics,
  },
  'aws-ecs-clusters': {
    datasetKey: 'aws-ecs-clusters',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['ecs:cluster'],
    service: 'ecs',
    load: hydrateAwsEcsClusters,
    toEvaluationResources: (clusters) => mapEvaluationResources(clusters, (cluster) => cluster.clusterArn),
  },
  'aws-ecs-container-instances': {
    datasetKey: 'aws-ecs-container-instances',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['ecs:container-instance'],
    service: 'ecs',
    load: hydrateAwsEcsContainerInstances,
    toEvaluationResources: (instances) =>
      mapEvaluationResources(instances, (instance) => instance.containerInstanceArn),
  },
  'aws-ecs-services': {
    datasetKey: 'aws-ecs-services',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['ecs:service'],
    service: 'ecs',
    load: hydrateAwsEcsServices,
    toEvaluationResources: (services) => mapEvaluationResources(services, (service) => service.serviceArn),
  },
  'aws-ecr-repositories': {
    datasetKey: 'aws-ecr-repositories',
    dependencies: [],
    schemaVersion: '1',
    // Version 2 recognizes age-based tagged retention caps (`sinceImagePulled`, `sinceImageTransitioned`).
    loaderVersion: '2',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['ecr:repository'],
    service: 'ecr',
    load: hydrateAwsEcrRepositories,
    toEvaluationResources: (repositories) =>
      mapEvaluationResources(repositories, (repository) => repository.repositoryName),
  },
  'aws-ec2-elastic-ips': {
    datasetKey: 'aws-ec2-elastic-ips',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['ec2:elastic-ip'],
    service: 'ec2',
    load: hydrateAwsEc2ElasticIps,
    toEvaluationResources: (addresses) => mapEvaluationResources(addresses, (address) => address.allocationId),
  },
  'aws-ec2-instances': {
    datasetKey: 'aws-ec2-instances',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['ec2:instance'],
    service: 'ec2',
    load: hydrateAwsEc2Instances,
    toEvaluationResources: (instances) =>
      mapEvaluationResources(
        instances,
        (instance) => instance.instanceId,
        (instance) => ({
          createdAt: instance.launchTime,
        }),
      ),
  },
  'aws-ec2-instance-utilization': {
    datasetKey: 'aws-ec2-instance-utilization',
    dependencies: ['aws-ec2-instances'],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: {
      ttlMs: 300_000,
      observation: { kind: 'window', lookbackMs: 14 * 86_400_000, alignmentMs: 86_400_000 },
    },
    resourceTypes: ['ec2:instance'],
    service: 'ec2',
    load: hydrateAwsEc2InstanceUtilization,
    toEvaluationResources: (instances) => mapEvaluationResources(instances, (instance) => instance.instanceId),
  },
  'aws-ec2-nat-gateway-activity': {
    datasetKey: 'aws-ec2-nat-gateway-activity',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 300_000, observation: { kind: 'window', lookbackMs: 7 * 86_400_000, alignmentMs: 86_400_000 } },
    resourceTypes: ['ec2:natgateway'],
    service: 'ec2',
    load: hydrateAwsEc2NatGatewayActivity,
    toEvaluationResources: (gateways) => mapEvaluationResources(gateways, (gateway) => gateway.natGatewayId),
  },
  'aws-ec2-transit-gateway-vpc-attachment-activity': {
    datasetKey: 'aws-ec2-transit-gateway-vpc-attachment-activity',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: {
      ttlMs: 300_000,
      observation: { kind: 'window', lookbackMs: 30 * 86_400_000, alignmentMs: 86_400_000 },
    },
    resourceTypes: ['ec2:transit-gateway-attachment'],
    service: 'ec2',
    load: hydrateAwsEc2TransitGatewayVpcAttachmentActivity,
    toEvaluationResources: (attachments) =>
      mapEvaluationResources(
        attachments,
        (attachment) => attachment.transitGatewayAttachmentId,
        (attachment) => ({
          data: {
            bytesInLast30Days: attachment.bytesInLast30Days,
            bytesOutLast30Days: attachment.bytesOutLast30Days,
            estimatedMonthlyAttachmentCostUsd: attachment.estimatedMonthlyAttachmentCostUsd,
            hourlyAttachmentCostUsd: attachment.hourlyAttachmentCostUsd,
            lookbackDays: attachment.lookbackDays,
            state: attachment.state,
            transitGatewayId: attachment.transitGatewayId,
            vpcId: attachment.vpcId,
          },
        }),
      ),
  },
  'aws-ec2-load-balancers': {
    datasetKey: 'aws-ec2-load-balancers',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: [
      'elasticloadbalancing:loadbalancer',
      'elasticloadbalancing:loadbalancer/app',
      'elasticloadbalancing:loadbalancer/gwy',
      'elasticloadbalancing:loadbalancer/net',
    ],
    service: 'elb',
    load: hydrateAwsEc2LoadBalancers,
    toEvaluationResources: (loadBalancers) =>
      mapEvaluationResources(
        loadBalancers,
        (loadBalancer) => loadBalancer.loadBalancerArn,
        (loadBalancer) => ({
          arn: loadBalancer.loadBalancerArn,
          name: loadBalancer.loadBalancerName,
          resourceType: loadBalancerResourceTypes[loadBalancer.loadBalancerType],
        }),
      ),
  },
  'aws-ec2-load-balancer-request-activity': {
    datasetKey: 'aws-ec2-load-balancer-request-activity',
    dependencies: ['aws-ec2-load-balancers'],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: {
      ttlMs: 300_000,
      observation: { kind: 'window', lookbackMs: 14 * 86_400_000, alignmentMs: 86_400_000 },
    },
    resourceTypes: [
      'elasticloadbalancing:loadbalancer',
      'elasticloadbalancing:loadbalancer/app',
      'elasticloadbalancing:loadbalancer/gwy',
      'elasticloadbalancing:loadbalancer/net',
    ],
    service: 'elb',
    load: hydrateAwsEc2LoadBalancerRequestActivity,
    getEvidenceCoverage: (resources) => {
      const key = (value: { accountId: string; region: string; loadBalancerArn: string }): string =>
        JSON.stringify([value.accountId, value.region, value.loadBalancerArn]);
      const activityByIdentity = new Map(
        resources.get('aws-ec2-load-balancer-request-activity').map((activity) => [key(activity), activity]),
      );
      return createLiveEvaluationCoverage(
        resources.get('aws-ec2-load-balancers'),
        (loadBalancer) => {
          const activity = activityByIdentity.get(key(loadBalancer));
          return (
            (activity?.requestActivityStatus === undefined || activity.requestActivityStatus === 'complete') &&
            Number.isFinite(activity?.averageRequestsPerDayLast14Days)
          );
        },
        (loadBalancer) => createFindingMatch(loadBalancer.loadBalancerArn, loadBalancer.region, loadBalancer.accountId),
      );
    },
    toEvaluationResources: (loadBalancers) =>
      mapEvaluationResources(loadBalancers, (loadBalancer) => loadBalancer.loadBalancerArn),
  },
  'aws-ec2-reserved-instances': {
    datasetKey: 'aws-ec2-reserved-instances',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['ec2:reserved-instances'],
    service: 'ec2',
    load: hydrateAwsEc2ReservedInstances,
    toEvaluationResources: (instances) => mapEvaluationResources(instances, (instance) => instance.reservedInstancesId),
  },
  'aws-ec2-target-groups': {
    datasetKey: 'aws-ec2-target-groups',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['elasticloadbalancing:targetgroup'],
    service: 'elb',
    load: hydrateAwsEc2TargetGroups,
  },
  'aws-ec2-vpc-endpoint-activity': {
    datasetKey: 'aws-ec2-vpc-endpoint-activity',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: {
      ttlMs: 300_000,
      observation: { kind: 'window', lookbackMs: 30 * 86_400_000, alignmentMs: 86_400_000 },
    },
    resourceTypes: ['ec2:vpc-endpoint'],
    service: 'ec2',
    load: hydrateAwsEc2VpcEndpointActivity,
    toEvaluationResources: (endpoints) => mapEvaluationResources(endpoints, (endpoint) => endpoint.vpcEndpointId),
  },
  'aws-eks-nodegroups': {
    datasetKey: 'aws-eks-nodegroups',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['eks:cluster'],
    service: 'eks',
    load: hydrateAwsEksNodegroups,
    toEvaluationResources: (nodegroups) =>
      mapEvaluationResources(
        nodegroups,
        (nodegroup) => nodegroup.nodegroupArn,
        (nodegroup) => ({
          arn: nodegroup.nodegroupArn,
          name: nodegroup.nodegroupName,
          resourceType: 'eks:nodegroup',
        }),
      ),
  },
  'aws-emr-clusters': {
    datasetKey: 'aws-emr-clusters',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['elasticmapreduce:cluster'],
    service: 'emr',
    load: hydrateAwsEmrClusters,
    toEvaluationResources: (clusters) => mapEvaluationResources(clusters, (cluster) => cluster.clusterId),
  },
  'aws-emr-cluster-metrics': {
    datasetKey: 'aws-emr-cluster-metrics',
    dependencies: ['aws-emr-clusters'],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 300_000, observation: { kind: 'window', lookbackMs: 30 * 60_000, alignmentMs: 60_000 } },
    resourceTypes: ['elasticmapreduce:cluster'],
    service: 'emr',
    load: hydrateAwsEmrClusterMetrics,
  },
  'aws-lambda-functions': {
    datasetKey: 'aws-lambda-functions',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['lambda:function'],
    service: 'lambda',
    load: hydrateAwsLambdaFunctions,
    toEvaluationResources: (functions) => mapEvaluationResources(functions, (fn) => fn.functionName),
  },
  'aws-lambda-function-metrics': {
    datasetKey: 'aws-lambda-function-metrics',
    dependencies: ['aws-lambda-functions'],
    // Version 2 adds the required `assessment` and retains analyzed and unavailable functions.
    schemaVersion: '2',
    loaderVersion: '2',
    freshness: { ttlMs: 300_000, observation: { kind: 'window', lookbackMs: 7 * 86_400_000, alignmentMs: 60_000 } },
    resourceTypes: ['lambda:function'],
    service: 'lambda',
    load: hydrateAwsLambdaFunctionMetrics,
  },
  'aws-lambda-memory-recommendations': {
    datasetKey: 'aws-lambda-memory-recommendations',
    // The memory rule reports coverage over the function inventory, so evidence assessment needs both datasets.
    dependencies: ['aws-lambda-functions'],
    // Version 2 adds the required `assessment` and retains analyzed and unavailable functions.
    schemaVersion: '2',
    loaderVersion: '2',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['lambda:function'],
    service: 'lambda',
    load: hydrateAwsLambdaMemoryRecommendations,
    toEvaluationResources: (recommendations) =>
      mapEvaluationResources(recommendations, (recommendation) => recommendation.functionArn),
  },
  'aws-kms-key-churn-reviews': {
    datasetKey: 'aws-kms-key-churn-reviews',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'calendar-months', months: 1 } },
    resourceTypes: ['kms:key'],
    service: 'kms',
    load: hydrateAwsKmsKeyChurnReviews,
    toEvaluationResources: (reviews) =>
      mapEvaluationResources(
        reviews,
        (review) => review.reviewId,
        (review) => ({ data: toKmsKeyChurnEvaluationData(review) }),
      ),
  },
  'aws-kms-key-usage': {
    datasetKey: 'aws-kms-key-usage',
    dependencies: ['aws-kms-key-churn-reviews'],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'calendar-months', months: 1 } },
    resourceTypes: ['kms:key'],
    service: 'kms',
    load: hydrateAwsKmsKeyUsage,
    toEvaluationResources: (keys) =>
      mapEvaluationResources(
        keys,
        (key) => key.keyArn,
        (key) => ({
          arn: key.keyArn,
          createdAt: key.creationDate,
          data: key,
          resourceType: 'kms:key',
        }),
      ),
  },
  'aws-rds-instance-activity': {
    datasetKey: 'aws-rds-instance-activity',
    dependencies: ['aws-rds-instances'],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 300_000, observation: { kind: 'window', lookbackMs: 7 * 86_400_000, alignmentMs: 86_400_000 } },
    resourceTypes: ['rds:db'],
    service: 'rds',
    load: hydrateAwsRdsInstanceActivity,
    toEvaluationResources: (instances) =>
      mapEvaluationResources(instances, (instance) => instance.dbInstanceIdentifier),
  },
  'aws-rds-instance-cpu-metrics': {
    datasetKey: 'aws-rds-instance-cpu-metrics',
    dependencies: ['aws-rds-instances'],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: {
      ttlMs: 300_000,
      observation: { kind: 'window', lookbackMs: 30 * 86_400_000, alignmentMs: 86_400_000 },
    },
    resourceTypes: ['rds:db'],
    service: 'rds',
    load: hydrateAwsRdsInstanceCpuMetrics,
  },
  'aws-rds-instances': {
    datasetKey: 'aws-rds-instances',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['rds:db'],
    service: 'rds',
    load: hydrateAwsRdsInstances,
    toEvaluationResources: (instances) =>
      mapEvaluationResources(
        instances,
        (instance) => instance.dbInstanceIdentifier,
        (instance) => ({
          createdAt: instance.instanceCreateTime,
        }),
      ),
  },
  'aws-rds-reserved-instances': {
    datasetKey: 'aws-rds-reserved-instances',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    // Resource Explorer does not surface RDS reserved instances, so DB
    // resources seed the regions we need to query with DescribeReservedDBInstances.
    resourceTypes: ['rds:db'],
    service: 'rds',
    load: hydrateAwsRdsReservedInstances,
  },
  'aws-rds-snapshots': {
    datasetKey: 'aws-rds-snapshots',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['rds:snapshot'],
    service: 'rds',
    load: hydrateAwsRdsSnapshots,
    toEvaluationResources: (snapshots) =>
      mapEvaluationResources(
        snapshots,
        (snapshot) => snapshot.dbSnapshotIdentifier,
        (snapshot) => ({
          createdAt: snapshot.snapshotCreateTime,
        }),
      ),
  },
  'aws-redshift-clusters': {
    datasetKey: 'aws-redshift-clusters',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['redshift:cluster'],
    service: 'redshift',
    load: hydrateAwsRedshiftClusters,
    toEvaluationResources: (clusters) => mapEvaluationResources(clusters, (cluster) => cluster.clusterIdentifier),
  },
  'aws-redshift-cluster-metrics': {
    datasetKey: 'aws-redshift-cluster-metrics',
    dependencies: ['aws-redshift-clusters'],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: {
      ttlMs: 300_000,
      observation: { kind: 'window', lookbackMs: 14 * 86_400_000, alignmentMs: 86_400_000 },
    },
    resourceTypes: ['redshift:cluster'],
    service: 'redshift',
    load: hydrateAwsRedshiftClusterMetrics,
  },
  'aws-redshift-reserved-nodes': {
    datasetKey: 'aws-redshift-reserved-nodes',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    // Resource Explorer does not surface Redshift reserved nodes, so cluster
    // resources seed the regions we need to query with DescribeReservedNodes.
    resourceTypes: ['redshift:cluster'],
    service: 'redshift',
    load: hydrateAwsRedshiftReservedNodes,
  },
  'aws-route53-health-checks': {
    datasetKey: 'aws-route53-health-checks',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['route53:healthcheck'],
    service: 'route53',
    load: hydrateAwsRoute53HealthChecks,
    toEvaluationResources: (healthChecks) =>
      mapEvaluationResources(healthChecks, (healthCheck) => healthCheck.healthCheckArn),
  },
  'aws-route53-records': {
    datasetKey: 'aws-route53-records',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    // Hosted zones seed record-set enumeration because Route 53 record sets are scoped to a zone.
    resourceTypes: ['route53:hostedzone'],
    service: 'route53',
    load: hydrateAwsRoute53Records,
    toEvaluationResources: (records) =>
      mapEvaluationResources(
        records,
        (record) => record.recordId,
        (record) => ({
          name: record.recordName,
          resourceType: 'route53:record',
        }),
      ),
  },
  'aws-route53-zones': {
    datasetKey: 'aws-route53-zones',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['route53:hostedzone'],
    service: 'route53',
    load: hydrateAwsRoute53Zones,
  },
  'aws-s3-bucket-analyses': {
    datasetKey: 'aws-s3-bucket-analyses',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['s3:bucket'],
    service: 's3',
    load: hydrateAwsS3BucketAnalyses,
    toEvaluationResources: (buckets) => mapEvaluationResources(buckets, (bucket) => bucket.bucketName),
  },
  'aws-sagemaker-endpoint-activity': {
    datasetKey: 'aws-sagemaker-endpoint-activity',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: {
      ttlMs: 300_000,
      observation: { kind: 'window', lookbackMs: 14 * 86_400_000, alignmentMs: 86_400_000 },
    },
    resourceTypes: ['sagemaker:endpoint'],
    service: 'sagemaker',
    load: hydrateAwsSageMakerEndpointActivity,
    toEvaluationResources: (endpoints) =>
      mapEvaluationResources(
        endpoints,
        (endpoint) => endpoint.endpointName,
        (endpoint) => ({
          arn: endpoint.endpointArn,
          createdAt: endpoint.creationTime,
          name: endpoint.endpointName,
        }),
      ),
  },
  'aws-sagemaker-notebook-instances': {
    datasetKey: 'aws-sagemaker-notebook-instances',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['sagemaker:notebook-instance'],
    service: 'sagemaker',
    load: hydrateAwsSageMakerNotebookInstances,
    toEvaluationResources: (instances) =>
      mapEvaluationResources(
        instances,
        (instance) => instance.notebookInstanceName,
        (instance) => ({
          name: instance.notebookInstanceName,
        }),
      ),
  },
  'aws-cost-optimization-hub-savings-plans-recommendations': {
    datasetKey: 'aws-cost-optimization-hub-savings-plans-recommendations',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 21_600_000, observation: { kind: 'current' } },
    resourceTypes: [],
    service: 'costoptimizationhub',
    load: hydrateAwsCostOptimizationHubSavingsPlansRecommendations,
    toEvaluationResources: (recommendations) =>
      mapEvaluationResources(
        recommendations,
        (recommendation) => recommendation.recommendationId,
        (recommendation) => ({
          data: recommendation,
          resourceType: 'costoptimizationhub:savings-plans-recommendation',
        }),
      ),
  },
  'aws-cost-optimization-hub-reservation-recommendations': {
    datasetKey: 'aws-cost-optimization-hub-reservation-recommendations',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 21_600_000, observation: { kind: 'current' } },
    resourceTypes: [],
    service: 'costoptimizationhub',
    load: hydrateAwsCostOptimizationHubReservationRecommendations,
    toEvaluationResources: (recommendations) =>
      mapEvaluationResources(
        recommendations.map((recommendation) => ({
          ...recommendation,
          region: recommendation.region ?? recommendation.configuration.reservedInstancesRegion,
        })),
        getAwsCostOptimizationHubReservationResourceId,
        (recommendation) => ({
          ...(recommendation.resourceArn ? { arn: recommendation.resourceArn } : {}),
          data: recommendation,
          resourceType: getAwsCostOptimizationHubReservationResourceType(recommendation),
        }),
      ),
  },
  'aws-cost-optimization-hub-rightsizing-recommendations': {
    datasetKey: 'aws-cost-optimization-hub-rightsizing-recommendations',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 21_600_000, observation: { kind: 'current' } },
    resourceTypes: [],
    service: 'costoptimizationhub',
    load: hydrateAwsCostOptimizationHubRightsizingRecommendations,
    toEvaluationResources: (recommendations) =>
      mapEvaluationResources(
        recommendations,
        (recommendation) => recommendation.resourceId,
        (recommendation) => ({
          ...(recommendation.resourceArn ? { arn: recommendation.resourceArn } : {}),
          data: recommendation,
          resourceType: getAwsCostOptimizationHubRightsizingResourceType(recommendation),
          actionType: recommendation.actionType,
        }),
      ),
  },
  'aws-cost-optimization-hub-idle-recommendations': {
    datasetKey: 'aws-cost-optimization-hub-idle-recommendations',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 21_600_000, observation: { kind: 'current' } },
    resourceTypes: [],
    service: 'costoptimizationhub',
    load: hydrateAwsCostOptimizationHubIdleRecommendations,
    toEvaluationResources: (recommendations) =>
      mapEvaluationResources(recommendations, getAwsCostOptimizationHubIdleResourceId, (recommendation) => ({
        data: recommendation,
        actionType: recommendation.actionType,
        ...(recommendation.resourceArn ? { arn: recommendation.resourceArn } : {}),
        resourceType: getAwsCostOptimizationHubIdleResourceType(recommendation),
      })),
  },
  'aws-cost-optimization-hub-upgrade-recommendations': {
    datasetKey: 'aws-cost-optimization-hub-upgrade-recommendations',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 21_600_000, observation: { kind: 'current' } },
    resourceTypes: [],
    service: 'costoptimizationhub',
    load: hydrateAwsCostOptimizationHubUpgradeRecommendations,
    toEvaluationResources: (recommendations) =>
      mapEvaluationResources(recommendations, getAwsCostOptimizationHubUpgradeResourceId, (recommendation) => ({
        ...(recommendation.resourceArn ? { arn: recommendation.resourceArn } : {}),
        data: recommendation,
        resourceType: getAwsCostOptimizationHubUpgradeResourceType(recommendation),
      })),
  },
  'aws-cost-optimization-hub-graviton-recommendations': {
    datasetKey: 'aws-cost-optimization-hub-graviton-recommendations',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 21_600_000, observation: { kind: 'current' } },
    resourceTypes: [],
    service: 'costoptimizationhub',
    load: hydrateAwsCostOptimizationHubGravitonRecommendations,
    toEvaluationResources: (recommendations) =>
      mapEvaluationResources(
        recommendations,
        (item) => item.resourceId ?? item.resourceArn ?? item.recommendationId,
        (item) => ({
          arn: item.resourceArn,
          data: item,
          resourceType: gravitonResourceTypes[item.currentResourceType],
        }),
      ),
  },
  'aws-sagemaker-savings-plans-coverage': {
    datasetKey: 'aws-sagemaker-savings-plans-coverage',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: {
      ttlMs: 21_600_000,
      observation: { kind: 'window', lookbackMs: 30 * 86_400_000, alignmentMs: 86_400_000 },
    },
    resourceTypes: [],
    service: 'sagemaker',
    load: hydrateAwsSageMakerSavingsPlansCoverage,
    toEvaluationResources: (coverage) =>
      mapEvaluationResources(
        coverage,
        (record) => record.accountId,
        (record) => ({
          data: record,
          resourceType: 'sagemaker:savings-plans-coverage',
        }),
      ),
  },
  'aws-resource-explorer-untagged-resources': {
    datasetKey: 'aws-resource-explorer-untagged-resources',
    dependencies: [],
    catalogQueries: [
      { filterString: 'resourcetype.supports:tags tag:none', requiredViewProperties: ['tags'], scope: 'account' },
    ],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: [],
    service: 'tagging',
    load: hydrateAwsUntaggedResources,
    toEvaluationResources: (resources) =>
      mapEvaluationResources(
        resources,
        (resource) => resource.arn,
        (resource) => ({ arn: resource.arn, resourceType: resource.resourceType }),
      ),
  },
  'aws-secretsmanager-secrets': {
    datasetKey: 'aws-secretsmanager-secrets',
    dependencies: [],
    schemaVersion: '1',
    loaderVersion: '1',
    freshness: { ttlMs: 600_000, observation: { kind: 'current' } },
    resourceTypes: ['secretsmanager:secret'],
    service: 'secretsmanager',
    load: hydrateAwsSecretsManagerSecrets,
    toEvaluationResources: (secrets) =>
      mapEvaluationResources(
        secrets,
        (secret) => secret.secretArn,
        (secret) => ({
          arn: secret.secretArn,
          lastActivityAt: secret.lastAccessedDate,
          name: secret.secretName,
        }),
      ),
  },
};

/**
 * Resolves the exact inclusive start and exclusive end used by an observation policy.
 *
 * @param policy - Loader observation alignment and lookback semantics.
 * @param timestampMs - Stable observation timestamp used by the discovery run.
 * @returns The actual observed interval, or undefined for a current-state snapshot.
 */
export const resolveAwsDiscoveryObservationWindow = (
  policy: AwsDiscoveryObservationPolicy,
  timestampMs: number,
): { startTime: string; endTime: string } | undefined => {
  if (policy.kind === 'current') return undefined;
  if (policy.kind === 'window') {
    const endMs = Math.floor(timestampMs / policy.alignmentMs) * policy.alignmentMs;
    return { startTime: new Date(endMs - policy.lookbackMs).toISOString(), endTime: new Date(endMs).toISOString() };
  }
  const end = new Date(timestampMs);
  const month = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
  return {
    startTime: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - policy.months, 1)).toISOString(),
    endTime: new Date(month).toISOString(),
  };
};

/**
 * Validates dataset dependencies before discovery starts loading evidence.
 *
 * @param definitions - Dataset keys and their required dependencies.
 * @returns Nothing when every dependency exists and the graph is acyclic.
 * @throws When a definition requires an unknown dataset or contains a cycle.
 */
export const validateAwsDiscoveryDatasetDependencies = (
  definitions: readonly { datasetKey: string; dependencies: readonly string[] }[],
): void => {
  const keys = new Set(definitions.map((definition) => definition.datasetKey));
  for (const definition of definitions) {
    for (const dependency of definition.dependencies) {
      if (!keys.has(dependency)) {
        throw new Error(
          `Unknown AWS discovery dataset dependency "${dependency}" required by "${definition.datasetKey}"`,
        );
      }
    }
  }
  const graph = new Map(definitions.map((definition) => [definition.datasetKey, definition.dependencies]));
  const visited = new Set<string>();
  const visit = (key: string, path: string[]): void => {
    if (path.includes(key)) {
      throw new Error(
        `AWS discovery dataset dependency cycle: ${[...path.slice(path.indexOf(key)), key].join(' -> ')}`,
      );
    }
    if (visited.has(key)) return;
    for (const dependency of graph.get(key) ?? []) visit(dependency, [...path, key]);
    visited.add(key);
  };
  for (const key of keys) visit(key, []);
};

/**
 * Returns the dataset loader definition for a stable discovery dataset key.
 *
 * @param datasetKey - Rule-facing live discovery dataset key.
 * @returns The matching dataset definition, or `undefined` when it is unknown.
 */
export const getAwsDiscoveryDatasetDefinition = (datasetKey: string): AwsDiscoveryDatasetDefinition | undefined => {
  if (!Object.hasOwn(awsDiscoveryDatasetRegistry, datasetKey)) {
    return undefined;
  }

  return awsDiscoveryDatasetRegistry[
    datasetKey as DiscoveryDatasetKey
  ] as AwsDiscoveryDatasetDefinition<DiscoveryDatasetKey>;
};

/**
 * Expands requested datasets into a deduplicated dependency-first loading plan.
 *
 * @param datasetKeys - Dataset keys requested by active rules.
 * @returns Required base and requested datasets in dependency order.
 * @throws When a requested dataset is unknown.
 */
export const resolveAwsDiscoveryDatasetDependencies = (datasetKeys: readonly string[]): DiscoveryDatasetKey[] => {
  const resolved = new Set<DiscoveryDatasetKey>();
  const visit = (key: string): void => {
    const definition = getAwsDiscoveryDatasetDefinition(key);
    if (!definition) throw new Error(`Unknown AWS discovery dataset "${key}"`);
    if (resolved.has(definition.datasetKey)) return;
    for (const dependency of definition.dependencies) visit(dependency);
    resolved.add(definition.datasetKey);
  };
  for (const key of datasetKeys) visit(key);
  return [...resolved];
};

validateAwsDiscoveryDatasetDependencies(Object.values(awsDiscoveryDatasetRegistry));

/**
 * Retains resource-level evidence coverage independently of the current rule selection.
 *
 * @param datasetKey - Dataset whose normalized evidence is being cached.
 * @param values - Loaded dataset and its declarative dependencies.
 * @param catalog - Resource catalog used for the load.
 * @returns Assessed and unknown identities across all applicable built-in evidence contracts.
 */
export const assessAwsDiscoveryDatasetEvidence = (
  datasetKey: DiscoveryDatasetKey,
  values: Partial<DiscoveryDatasetMap>,
  catalog: AwsDiscoveryCatalog,
): LiveEvaluationCoverage => {
  const dependencies = new Set(resolveAwsDiscoveryDatasetDependencies([datasetKey]));
  const resources = new LiveResourceBag(values);
  const definition = getAwsDiscoveryDatasetDefinition(datasetKey);
  if (definition?.getEvidenceCoverage) return definition.getEvidenceCoverage(resources);
  const coverageRules = awsRules.filter(
    (rule) =>
      rule.getLiveEvaluationCoverage &&
      rule.discoveryDependencies?.includes(datasetKey) &&
      rule.discoveryDependencies.every((key) => dependencies.has(key)),
  );
  if (coverageRules.length === 0) {
    const assessed = definition?.toEvaluationResources?.(resources.get(datasetKey)) ?? [];
    const scopeKey = (
      accountId: string | undefined,
      region: string | undefined,
      resourceType: string,
      id: string,
    ): string => JSON.stringify([accountId, region, resourceType, id]);
    const assessedIdentities = new Set(
      assessed.flatMap((match) =>
        [match.resourceId, ...(match.arn ? [match.arn] : [])].map((id) =>
          scopeKey(match.accountId, match.region, match.resourceType ?? '*', id),
        ),
      ),
    );
    const unknown = catalog.resources
      .filter((candidate) => {
        if (!definition?.resourceTypes.includes(candidate.resourceType)) return false;
        // A projection may expose the full ARN or its resource identifier. Keep
        // account/region/type scope when comparing names shared by many resources.
        const resource = candidate.arn.split(':').slice(5).join(':').replace(/:\*$/u, '');
        const identifiers = [candidate.arn, resource];
        const typeSeparator = resource.search(/[/:]/u);
        if (typeSeparator >= 0) identifiers.push(resource.slice(typeSeparator + 1));
        return !identifiers.some((id) =>
          [candidate.resourceType, '*'].some((resourceType) =>
            assessedIdentities.has(scopeKey(candidate.accountId, candidate.region, resourceType, id)),
          ),
        );
      })
      .map((candidate) => ({
        ...createFindingMatch(candidate.arn, candidate.region, candidate.accountId),
        resourceType: candidate.resourceType,
      }));
    return { assessed, unknown };
  }
  const assessed = new Map<string, FindingMatch>();
  const unknown = new Map<string, FindingMatch>();
  const identity = (match: FindingMatch): string =>
    JSON.stringify([match.accountId, match.region, match.resourceType, match.resourceId]);
  for (const rule of coverageRules) {
    const coverage = rule.getLiveEvaluationCoverage?.({ catalog, resources });
    for (const match of coverage?.assessed ?? []) assessed.set(identity(match), match);
    for (const match of coverage?.unknown ?? []) unknown.set(identity(match), match);
  }
  for (const key of unknown.keys()) assessed.delete(key);
  return { assessed: [...assessed.values()], unknown: [...unknown.values()] };
};

/**
 * Returns normalized resource identities for one discovery dataset.
 *
 * @param datasetKey - Dataset selected by the rule as its evaluated resource set.
 * @param resources - Loaded live resource bag for the current scan.
 * @returns Every resource identity represented by the selected dataset.
 */
const getAwsEvaluationResources = (
  datasetKey: DiscoveryDatasetKey,
  resources: LiveResourceBag,
): EvaluationResourceProjection[] => {
  const definition = awsDiscoveryDatasetRegistry[datasetKey];
  const toEvaluationResources = definition.toEvaluationResources as
    | ((dataset: DiscoveryDatasetMap[typeof datasetKey]) => EvaluationResourceProjection[])
    | undefined;
  if (!toEvaluationResources) {
    throw new Error(`Discovery dataset ${datasetKey} does not expose evaluation resource identities.`);
  }
  return toEvaluationResources(resources.get(datasetKey));
};

/** Resolves the SDK-owned evaluated resource projection for one discovery rule. */
export const getAwsRuleEvaluationResourceSet = (
  rule: Pick<Rule, 'discoveryDependencies' | 'id'>,
  resources: LiveResourceBag,
): { id: string; resources: EvaluatedResource[] } => {
  const override = awsRuleEvaluationOverrides[rule.id];
  const datasetKey = override?.datasetKey ?? rule.discoveryDependencies?.[0];
  if (!datasetKey) {
    throw new Error(`Discovery rule ${rule.id} does not declare an evaluation dataset.`);
  }

  const definition = awsDiscoveryDatasetRegistry[datasetKey];
  const resourceType = definition.resourceTypes[0] ?? definition.service;
  const resourcesForRule = override?.toEvaluationResources
    ? override.toEvaluationResources(resources)
    : getAwsEvaluationResources(datasetKey, resources);

  return {
    id: override?.resourceSetId ?? datasetKey,
    resources: resourcesForRule.map((resource) => ({
      ...resource,
      region: resource.region ?? 'global',
      resourceType: resource.resourceType ?? resourceType,
    })),
  };
};
