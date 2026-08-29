import {
  type AwsDiscoveredResource,
  createFindingMatch,
  type DiscoveryDatasetKey,
  type DiscoveryDatasetMap,
  type FindingMatch,
  type LiveResourceBag,
} from '@cloudburn/rules';
import type { ScanDiagnostic } from '../../types.js';
import { hydrateAwsApiGatewayStages } from './resources/apigateway.js';
import {
  hydrateAwsCloudFrontDistributionRequestActivity,
  hydrateAwsCloudFrontDistributions,
} from './resources/cloudfront.js';
import { hydrateAwsCloudTrailTrails } from './resources/cloudtrail.js';
import {
  hydrateAwsCloudWatchLogGroupRecentStreamActivity,
  hydrateAwsCloudWatchLogGroups,
  hydrateAwsCloudWatchLogMetricFilterCoverage,
  hydrateAwsCloudWatchLogStreams,
} from './resources/cloudwatch-logs.js';
import { hydrateAwsCostUsage } from './resources/cost-explorer.js';
import { hydrateAwsCostAnomalyMonitors, hydrateAwsCostGuardrailBudgets } from './resources/cost-guardrails.js';
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
import { hydrateAwsLambdaFunctionMetrics, hydrateAwsLambdaFunctions } from './resources/lambda.js';
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
export type AwsDiscoveryDatasetLoadContext = AwsDiscoveryDatasetResolver & AwsAccountIdResolver;

/** Declarative definition for one rule-facing AWS discovery dataset. */
export type AwsDiscoveryDatasetDefinition<K extends DiscoveryDatasetKey = DiscoveryDatasetKey> = {
  datasetKey: K;
  toEvaluationResources?: (resources: DiscoveryDatasetMap[K]) => FindingMatch[];
  resourceTypes: string[];
  service:
    | 'apigateway'
    | 'cloudfront'
    | 'cloudtrail'
    | 'cloudwatch'
    | 'costguardrails'
    | 'costexplorer'
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

const mapEvaluationResources = <T extends { accountId: string; region?: string }>(
  resources: T[],
  getResourceId: (resource: T) => string,
): FindingMatch[] =>
  resources.map((resource) =>
    createFindingMatch(
      getResourceId(resource),
      resource.region && resource.region !== 'global' ? resource.region : undefined,
      resource.accountId,
    ),
  );

const awsDiscoveryDatasetRegistry: {
  [K in DiscoveryDatasetKey]: AwsDiscoveryDatasetDefinition<K>;
} = {
  'aws-apigateway-stages': {
    datasetKey: 'aws-apigateway-stages',
    resourceTypes: ['apigateway:restapis/stages'],
    service: 'apigateway',
    load: hydrateAwsApiGatewayStages,
    toEvaluationResources: (stages) => mapEvaluationResources(stages, (stage) => stage.stageArn),
  },
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
    toEvaluationResources: (logGroups) => mapEvaluationResources(logGroups, (logGroup) => logGroup.logGroupName),
  },
  'aws-cloudwatch-log-group-recent-stream-activity': {
    datasetKey: 'aws-cloudwatch-log-group-recent-stream-activity',
    resourceTypes: ['logs:log-group'],
    service: 'cloudwatch',
    load: hydrateAwsCloudWatchLogGroupRecentStreamActivity,
  },
  'aws-cloudwatch-log-metric-filter-coverage': {
    datasetKey: 'aws-cloudwatch-log-metric-filter-coverage',
    resourceTypes: ['logs:log-group'],
    service: 'cloudwatch',
    load: hydrateAwsCloudWatchLogMetricFilterCoverage,
  },
  'aws-cloudwatch-log-streams': {
    datasetKey: 'aws-cloudwatch-log-streams',
    resourceTypes: ['logs:log-group'],
    service: 'cloudwatch',
    load: hydrateAwsCloudWatchLogStreams,
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
    toEvaluationResources: (snapshots) => mapEvaluationResources(snapshots, (snapshot) => snapshot.snapshotId),
  },
  'aws-ebs-volumes': {
    datasetKey: 'aws-ebs-volumes',
    resourceTypes: ['ec2:volume'],
    service: 'ebs',
    load: hydrateAwsEbsVolumes,
    toEvaluationResources: (volumes) => mapEvaluationResources(volumes, (volume) => volume.volumeId),
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
    toEvaluationResources: (instances) => mapEvaluationResources(instances, (instance) => instance.instanceId),
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
      mapEvaluationResources(loadBalancers, (loadBalancer) => loadBalancer.loadBalancerArn),
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
    toEvaluationResources: (nodegroups) => mapEvaluationResources(nodegroups, (nodegroup) => nodegroup.nodegroupArn),
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
      mapEvaluationResources(instances, (instance) => instance.dbInstanceIdentifier),
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
      mapEvaluationResources(snapshots, (snapshot) => snapshot.dbSnapshotIdentifier),
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
    toEvaluationResources: (records) => mapEvaluationResources(records, (record) => record.recordId),
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
    toEvaluationResources: (endpoints) => mapEvaluationResources(endpoints, (endpoint) => endpoint.endpointName),
  },
  'aws-sagemaker-notebook-instances': {
    datasetKey: 'aws-sagemaker-notebook-instances',
    resourceTypes: ['sagemaker:notebook-instance'],
    service: 'sagemaker',
    load: hydrateAwsSageMakerNotebookInstances,
    toEvaluationResources: (instances) =>
      mapEvaluationResources(instances, (instance) => instance.notebookInstanceName),
  },
  'aws-resource-explorer-untagged-resources': {
    datasetKey: 'aws-resource-explorer-untagged-resources',
    resourceTypes: [],
    service: 'tagging',
    load: hydrateAwsUntaggedResources,
    toEvaluationResources: (resources) => mapEvaluationResources(resources, (resource) => resource.arn),
  },
  'aws-secretsmanager-secrets': {
    datasetKey: 'aws-secretsmanager-secrets',
    resourceTypes: ['secretsmanager:secret'],
    service: 'secretsmanager',
    load: hydrateAwsSecretsManagerSecrets,
    toEvaluationResources: (secrets) => mapEvaluationResources(secrets, (secret) => secret.secretArn),
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
 * Returns normalized resource identities for a rule's primary evaluation dataset.
 *
 * @param datasetKey - Dataset selected by the rule as its evaluated resource set.
 * @param resources - Loaded live resource bag for the current scan.
 * @returns Every resource identity represented by the selected dataset.
 */
export const getAwsEvaluationResources = (
  datasetKey: DiscoveryDatasetKey,
  resources: LiveResourceBag,
): FindingMatch[] => {
  const definition = awsDiscoveryDatasetRegistry[datasetKey];
  const toEvaluationResources = definition.toEvaluationResources as
    | ((dataset: DiscoveryDatasetMap[typeof datasetKey]) => FindingMatch[])
    | undefined;
  if (!toEvaluationResources) {
    throw new Error(`Discovery dataset ${datasetKey} does not expose evaluation resource identities.`);
  }
  return toEvaluationResources(resources.get(datasetKey));
};
