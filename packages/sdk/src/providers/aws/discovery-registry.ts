import {
  type AwsDiscoveredResource,
  type AwsKmsKeyChurnReview,
  createFindingMatch,
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
  type LiveResourceBag,
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

/** Declarative definition for one rule-facing AWS discovery dataset. */
export type AwsDiscoveryDatasetDefinition<K extends DiscoveryDatasetKey = DiscoveryDatasetKey> = {
  datasetKey: K;
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
    resourceTypes: ['cloudtrail:trail'],
    service: 'cloudtrail',
    load: hydrateAwsCloudTrailTrails,
    toEvaluationResources: (trails) => mapEvaluationResources(trails, (trail) => trail.trailArn),
  },
  'aws-cloudfront-distributions': {
    datasetKey: 'aws-cloudfront-distributions',
    resourceTypes: ['cloudfront:distribution'],
    service: 'cloudfront',
    load: hydrateAwsCloudFrontDistributions,
    toEvaluationResources: (distributions) =>
      mapEvaluationResources(distributions, (distribution) => distribution.distributionArn),
  },
  'aws-cloudfront-distribution-request-activity': {
    datasetKey: 'aws-cloudfront-distribution-request-activity',
    resourceTypes: ['cloudfront:distribution'],
    service: 'cloudfront',
    load: hydrateAwsCloudFrontDistributionRequestActivity,
    toEvaluationResources: (distributions) =>
      mapEvaluationResources(distributions, (distribution) => distribution.distributionArn),
  },
  'aws-cloudwatch-log-groups': {
    datasetKey: 'aws-cloudwatch-log-groups',
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
    resourceTypes: ['logs:log-group'],
    service: 'cloudwatch',
    load: hydrateAwsCloudWatchLogStreams,
  },
  'aws-config-recording-frequency-reviews': {
    datasetKey: 'aws-config-recording-frequency-reviews',
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
    resourceTypes: [],
    service: 'costexplorer',
    load: hydrateAwsCostUsage,
    toEvaluationResources: (services) => mapEvaluationResources(services, (service) => `cost/${service.serviceSlug}`),
  },
  'aws-cost-anomaly-monitors': {
    datasetKey: 'aws-cost-anomaly-monitors',
    resourceTypes: [],
    service: 'costguardrails',
    load: hydrateAwsCostAnomalyMonitors,
    toEvaluationResources: (summaries) => mapEvaluationResources(summaries, (summary) => summary.accountId),
  },
  'aws-cost-guardrail-budgets': {
    datasetKey: 'aws-cost-guardrail-budgets',
    resourceTypes: [],
    service: 'costguardrails',
    load: hydrateAwsCostGuardrailBudgets,
    toEvaluationResources: (summaries) => mapEvaluationResources(summaries, (summary) => summary.accountId),
  },
  'aws-dynamodb-autoscaling': {
    datasetKey: 'aws-dynamodb-autoscaling',
    resourceTypes: ['dynamodb:table'],
    service: 'dynamodb',
    load: hydrateAwsDynamoDbAutoscaling,
  },
  'aws-dynamodb-table-utilization': {
    datasetKey: 'aws-dynamodb-table-utilization',
    resourceTypes: ['dynamodb:table'],
    service: 'dynamodb',
    load: hydrateAwsDynamoDbTableUtilization,
    toEvaluationResources: (tables) => mapEvaluationResources(tables, (table) => table.tableArn),
  },
  'aws-dynamodb-tables': {
    datasetKey: 'aws-dynamodb-tables',
    resourceTypes: ['dynamodb:table'],
    service: 'dynamodb',
    load: hydrateAwsDynamoDbTables,
    toEvaluationResources: (tables) => mapEvaluationResources(tables, (table) => table.tableArn),
  },
  'aws-ebs-snapshots': {
    datasetKey: 'aws-ebs-snapshots',
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
    resourceTypes: ['elasticache:cluster'],
    service: 'elasticache',
    load: hydrateAwsElastiCacheClusters,
    toEvaluationResources: (clusters) => mapEvaluationResources(clusters, (cluster) => cluster.cacheClusterId),
  },
  'aws-elasticache-cluster-activity': {
    datasetKey: 'aws-elasticache-cluster-activity',
    resourceTypes: ['elasticache:cluster'],
    service: 'elasticache',
    load: hydrateAwsElastiCacheClusterActivity,
  },
  'aws-elasticache-reserved-nodes': {
    datasetKey: 'aws-elasticache-reserved-nodes',
    resourceTypes: ['elasticache:reserved-instance'],
    service: 'elasticache',
    load: hydrateAwsElastiCacheReservedNodes,
  },
  'aws-ecs-autoscaling': {
    datasetKey: 'aws-ecs-autoscaling',
    resourceTypes: ['ecs:service'],
    service: 'ecs',
    load: hydrateAwsEcsAutoscaling,
  },
  'aws-ecs-cluster-metrics': {
    datasetKey: 'aws-ecs-cluster-metrics',
    resourceTypes: ['ecs:cluster'],
    service: 'ecs',
    load: hydrateAwsEcsClusterMetrics,
  },
  'aws-ecs-clusters': {
    datasetKey: 'aws-ecs-clusters',
    resourceTypes: ['ecs:cluster'],
    service: 'ecs',
    load: hydrateAwsEcsClusters,
    toEvaluationResources: (clusters) => mapEvaluationResources(clusters, (cluster) => cluster.clusterArn),
  },
  'aws-ecs-container-instances': {
    datasetKey: 'aws-ecs-container-instances',
    resourceTypes: ['ecs:container-instance'],
    service: 'ecs',
    load: hydrateAwsEcsContainerInstances,
    toEvaluationResources: (instances) =>
      mapEvaluationResources(instances, (instance) => instance.containerInstanceArn),
  },
  'aws-ecs-services': {
    datasetKey: 'aws-ecs-services',
    resourceTypes: ['ecs:service'],
    service: 'ecs',
    load: hydrateAwsEcsServices,
    toEvaluationResources: (services) => mapEvaluationResources(services, (service) => service.serviceArn),
  },
  'aws-ecr-repositories': {
    datasetKey: 'aws-ecr-repositories',
    resourceTypes: ['ecr:repository'],
    service: 'ecr',
    load: hydrateAwsEcrRepositories,
    toEvaluationResources: (repositories) =>
      mapEvaluationResources(repositories, (repository) => repository.repositoryName),
  },
  'aws-ec2-elastic-ips': {
    datasetKey: 'aws-ec2-elastic-ips',
    resourceTypes: ['ec2:elastic-ip'],
    service: 'ec2',
    load: hydrateAwsEc2ElasticIps,
    toEvaluationResources: (addresses) => mapEvaluationResources(addresses, (address) => address.allocationId),
  },
  'aws-ec2-instances': {
    datasetKey: 'aws-ec2-instances',
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
    resourceTypes: ['ec2:instance'],
    service: 'ec2',
    load: hydrateAwsEc2InstanceUtilization,
    toEvaluationResources: (instances) => mapEvaluationResources(instances, (instance) => instance.instanceId),
  },
  'aws-ec2-nat-gateway-activity': {
    datasetKey: 'aws-ec2-nat-gateway-activity',
    resourceTypes: ['ec2:natgateway'],
    service: 'ec2',
    load: hydrateAwsEc2NatGatewayActivity,
    toEvaluationResources: (gateways) => mapEvaluationResources(gateways, (gateway) => gateway.natGatewayId),
  },
  'aws-ec2-transit-gateway-vpc-attachment-activity': {
    datasetKey: 'aws-ec2-transit-gateway-vpc-attachment-activity',
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
    resourceTypes: [
      'elasticloadbalancing:loadbalancer',
      'elasticloadbalancing:loadbalancer/app',
      'elasticloadbalancing:loadbalancer/gwy',
      'elasticloadbalancing:loadbalancer/net',
    ],
    service: 'elb',
    load: hydrateAwsEc2LoadBalancerRequestActivity,
    toEvaluationResources: (loadBalancers) =>
      mapEvaluationResources(loadBalancers, (loadBalancer) => loadBalancer.loadBalancerArn),
  },
  'aws-ec2-reserved-instances': {
    datasetKey: 'aws-ec2-reserved-instances',
    resourceTypes: ['ec2:reserved-instances'],
    service: 'ec2',
    load: hydrateAwsEc2ReservedInstances,
    toEvaluationResources: (instances) => mapEvaluationResources(instances, (instance) => instance.reservedInstancesId),
  },
  'aws-ec2-target-groups': {
    datasetKey: 'aws-ec2-target-groups',
    resourceTypes: ['elasticloadbalancing:targetgroup'],
    service: 'elb',
    load: hydrateAwsEc2TargetGroups,
  },
  'aws-ec2-vpc-endpoint-activity': {
    datasetKey: 'aws-ec2-vpc-endpoint-activity',
    resourceTypes: ['ec2:vpc-endpoint'],
    service: 'ec2',
    load: hydrateAwsEc2VpcEndpointActivity,
    toEvaluationResources: (endpoints) => mapEvaluationResources(endpoints, (endpoint) => endpoint.vpcEndpointId),
  },
  'aws-eks-nodegroups': {
    datasetKey: 'aws-eks-nodegroups',
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
    resourceTypes: ['elasticmapreduce:cluster'],
    service: 'emr',
    load: hydrateAwsEmrClusters,
    toEvaluationResources: (clusters) => mapEvaluationResources(clusters, (cluster) => cluster.clusterId),
  },
  'aws-emr-cluster-metrics': {
    datasetKey: 'aws-emr-cluster-metrics',
    resourceTypes: ['elasticmapreduce:cluster'],
    service: 'emr',
    load: hydrateAwsEmrClusterMetrics,
  },
  'aws-lambda-functions': {
    datasetKey: 'aws-lambda-functions',
    resourceTypes: ['lambda:function'],
    service: 'lambda',
    load: hydrateAwsLambdaFunctions,
    toEvaluationResources: (functions) => mapEvaluationResources(functions, (fn) => fn.functionName),
  },
  'aws-lambda-function-metrics': {
    datasetKey: 'aws-lambda-function-metrics',
    resourceTypes: ['lambda:function'],
    service: 'lambda',
    load: hydrateAwsLambdaFunctionMetrics,
  },
  'aws-lambda-memory-recommendations': {
    datasetKey: 'aws-lambda-memory-recommendations',
    resourceTypes: ['lambda:function'],
    service: 'lambda',
    load: hydrateAwsLambdaMemoryRecommendations,
    toEvaluationResources: (recommendations) =>
      mapEvaluationResources(recommendations, (recommendation) => recommendation.functionArn),
  },
  'aws-kms-key-churn-reviews': {
    datasetKey: 'aws-kms-key-churn-reviews',
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
    resourceTypes: ['rds:db'],
    service: 'rds',
    load: hydrateAwsRdsInstanceActivity,
    toEvaluationResources: (instances) =>
      mapEvaluationResources(instances, (instance) => instance.dbInstanceIdentifier),
  },
  'aws-rds-instance-cpu-metrics': {
    datasetKey: 'aws-rds-instance-cpu-metrics',
    resourceTypes: ['rds:db'],
    service: 'rds',
    load: hydrateAwsRdsInstanceCpuMetrics,
  },
  'aws-rds-instances': {
    datasetKey: 'aws-rds-instances',
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
    // Resource Explorer does not surface RDS reserved instances, so DB
    // resources seed the regions we need to query with DescribeReservedDBInstances.
    resourceTypes: ['rds:db'],
    service: 'rds',
    load: hydrateAwsRdsReservedInstances,
  },
  'aws-rds-snapshots': {
    datasetKey: 'aws-rds-snapshots',
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
    resourceTypes: ['redshift:cluster'],
    service: 'redshift',
    load: hydrateAwsRedshiftClusters,
    toEvaluationResources: (clusters) => mapEvaluationResources(clusters, (cluster) => cluster.clusterIdentifier),
  },
  'aws-redshift-cluster-metrics': {
    datasetKey: 'aws-redshift-cluster-metrics',
    resourceTypes: ['redshift:cluster'],
    service: 'redshift',
    load: hydrateAwsRedshiftClusterMetrics,
  },
  'aws-redshift-reserved-nodes': {
    datasetKey: 'aws-redshift-reserved-nodes',
    // Resource Explorer does not surface Redshift reserved nodes, so cluster
    // resources seed the regions we need to query with DescribeReservedNodes.
    resourceTypes: ['redshift:cluster'],
    service: 'redshift',
    load: hydrateAwsRedshiftReservedNodes,
  },
  'aws-route53-health-checks': {
    datasetKey: 'aws-route53-health-checks',
    resourceTypes: ['route53:healthcheck'],
    service: 'route53',
    load: hydrateAwsRoute53HealthChecks,
    toEvaluationResources: (healthChecks) =>
      mapEvaluationResources(healthChecks, (healthCheck) => healthCheck.healthCheckArn),
  },
  'aws-route53-records': {
    datasetKey: 'aws-route53-records',
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
    resourceTypes: ['route53:hostedzone'],
    service: 'route53',
    load: hydrateAwsRoute53Zones,
  },
  'aws-s3-bucket-analyses': {
    datasetKey: 'aws-s3-bucket-analyses',
    resourceTypes: ['s3:bucket'],
    service: 's3',
    load: hydrateAwsS3BucketAnalyses,
    toEvaluationResources: (buckets) => mapEvaluationResources(buckets, (bucket) => bucket.bucketName),
  },
  'aws-sagemaker-endpoint-activity': {
    datasetKey: 'aws-sagemaker-endpoint-activity',
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
  'aws-sagemaker-savings-plans-coverage': {
    datasetKey: 'aws-sagemaker-savings-plans-coverage',
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
