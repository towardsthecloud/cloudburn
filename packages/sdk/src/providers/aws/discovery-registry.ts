import type { AwsDiscoveredResource, DiscoveryDatasetKey, DiscoveryDatasetMap } from '@cloudburn/rules';
import type { ScanDiagnostic } from '../../types.js';
import { hydrateAwsApiGatewayStages } from './resources/apigateway.js';
import { hydrateAwsCloudFrontDistributions } from './resources/cloudfront.js';
import { hydrateAwsCloudTrailTrails } from './resources/cloudtrail.js';
import { hydrateAwsCloudWatchLogGroups, hydrateAwsCloudWatchLogStreams } from './resources/cloudwatch-logs.js';
import { hydrateAwsCostUsage } from './resources/cost-explorer.js';
import { hydrateAwsDynamoDbAutoscaling, hydrateAwsDynamoDbTables } from './resources/dynamodb.js';
import { hydrateAwsEbsSnapshots, hydrateAwsEbsVolumes } from './resources/ebs.js';
import { hydrateAwsEc2Instances } from './resources/ec2.js';
import { hydrateAwsEc2ElasticIps } from './resources/ec2-elastic-ips.js';
import { hydrateAwsEc2ReservedInstances } from './resources/ec2-reserved-instances.js';
import { hydrateAwsEc2InstanceUtilization } from './resources/ec2-utilization.js';
import { hydrateAwsEcrRepositories } from './resources/ecr.js';
import { hydrateAwsEcsClusters, hydrateAwsEcsContainerInstances, hydrateAwsEcsServices } from './resources/ecs.js';
import { hydrateAwsEcsAutoscaling } from './resources/ecs-autoscaling.js';
import { hydrateAwsEcsClusterMetrics } from './resources/ecs-cluster-metrics.js';
import { hydrateAwsEksNodegroups } from './resources/eks.js';
import { hydrateAwsElastiCacheClusters, hydrateAwsElastiCacheReservedNodes } from './resources/elasticache.js';
import { hydrateAwsEc2LoadBalancers, hydrateAwsEc2TargetGroups } from './resources/elbv2.js';
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
import { hydrateAwsSecretsManagerSecrets } from './resources/secretsmanager.js';
import { hydrateAwsEc2VpcEndpointActivity } from './resources/vpc-endpoints.js';

/**
 * Non-fatal discovery dataset result that keeps loaded resources while also
 * surfacing service-specific diagnostics for partially available data.
 */
export type AwsDiscoveryDatasetLoadResult<K extends DiscoveryDatasetKey = DiscoveryDatasetKey> = {
  diagnostics?: ScanDiagnostic[];
  resources: DiscoveryDatasetMap[K];
};

/** Declarative definition for one rule-facing AWS discovery dataset. */
export type AwsDiscoveryDatasetDefinition<K extends DiscoveryDatasetKey = DiscoveryDatasetKey> = {
  datasetKey: K;
  resourceTypes: string[];
  service:
    | 'apigateway'
    | 'cloudfront'
    | 'cloudtrail'
    | 'cloudwatch'
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
    | 'secretsmanager';
  load: (resources: AwsDiscoveredResource[]) => Promise<DiscoveryDatasetMap[K] | AwsDiscoveryDatasetLoadResult<K>>;
};

const awsDiscoveryDatasetRegistry: {
  [K in DiscoveryDatasetKey]: AwsDiscoveryDatasetDefinition<K>;
} = {
  'aws-apigateway-stages': {
    datasetKey: 'aws-apigateway-stages',
    resourceTypes: ['apigateway:restapis/stages'],
    service: 'apigateway',
    load: hydrateAwsApiGatewayStages,
  },
  'aws-cloudtrail-trails': {
    datasetKey: 'aws-cloudtrail-trails',
    resourceTypes: ['cloudtrail:trail'],
    service: 'cloudtrail',
    load: hydrateAwsCloudTrailTrails,
  },
  'aws-cloudfront-distributions': {
    datasetKey: 'aws-cloudfront-distributions',
    resourceTypes: ['cloudfront:distribution'],
    service: 'cloudfront',
    load: hydrateAwsCloudFrontDistributions,
  },
  'aws-cloudwatch-log-groups': {
    datasetKey: 'aws-cloudwatch-log-groups',
    resourceTypes: ['logs:log-group'],
    service: 'cloudwatch',
    load: hydrateAwsCloudWatchLogGroups,
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
  },
  'aws-dynamodb-autoscaling': {
    datasetKey: 'aws-dynamodb-autoscaling',
    resourceTypes: ['dynamodb:table'],
    service: 'dynamodb',
    load: hydrateAwsDynamoDbAutoscaling,
  },
  'aws-dynamodb-tables': {
    datasetKey: 'aws-dynamodb-tables',
    resourceTypes: ['dynamodb:table'],
    service: 'dynamodb',
    load: hydrateAwsDynamoDbTables,
  },
  'aws-ebs-snapshots': {
    datasetKey: 'aws-ebs-snapshots',
    resourceTypes: ['ec2:snapshot'],
    service: 'ebs',
    load: hydrateAwsEbsSnapshots,
  },
  'aws-ebs-volumes': {
    datasetKey: 'aws-ebs-volumes',
    resourceTypes: ['ec2:volume'],
    service: 'ebs',
    load: hydrateAwsEbsVolumes,
  },
  'aws-elasticache-clusters': {
    datasetKey: 'aws-elasticache-clusters',
    resourceTypes: ['elasticache:cluster'],
    service: 'elasticache',
    load: hydrateAwsElastiCacheClusters,
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
  },
  'aws-ecs-container-instances': {
    datasetKey: 'aws-ecs-container-instances',
    resourceTypes: ['ecs:container-instance'],
    service: 'ecs',
    load: hydrateAwsEcsContainerInstances,
  },
  'aws-ecs-services': {
    datasetKey: 'aws-ecs-services',
    resourceTypes: ['ecs:service'],
    service: 'ecs',
    load: hydrateAwsEcsServices,
  },
  'aws-ecr-repositories': {
    datasetKey: 'aws-ecr-repositories',
    resourceTypes: ['ecr:repository'],
    service: 'ecr',
    load: hydrateAwsEcrRepositories,
  },
  'aws-ec2-elastic-ips': {
    datasetKey: 'aws-ec2-elastic-ips',
    resourceTypes: ['ec2:elastic-ip'],
    service: 'ec2',
    load: hydrateAwsEc2ElasticIps,
  },
  'aws-ec2-instances': {
    datasetKey: 'aws-ec2-instances',
    resourceTypes: ['ec2:instance'],
    service: 'ec2',
    load: hydrateAwsEc2Instances,
  },
  'aws-ec2-instance-utilization': {
    datasetKey: 'aws-ec2-instance-utilization',
    resourceTypes: ['ec2:instance'],
    service: 'ec2',
    load: hydrateAwsEc2InstanceUtilization,
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
  },
  'aws-ec2-reserved-instances': {
    datasetKey: 'aws-ec2-reserved-instances',
    resourceTypes: ['ec2:reserved-instances'],
    service: 'ec2',
    load: hydrateAwsEc2ReservedInstances,
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
  },
  'aws-eks-nodegroups': {
    datasetKey: 'aws-eks-nodegroups',
    resourceTypes: ['eks:cluster'],
    service: 'eks',
    load: hydrateAwsEksNodegroups,
  },
  'aws-emr-clusters': {
    datasetKey: 'aws-emr-clusters',
    resourceTypes: ['elasticmapreduce:cluster'],
    service: 'emr',
    load: hydrateAwsEmrClusters,
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
  },
  'aws-redshift-clusters': {
    datasetKey: 'aws-redshift-clusters',
    resourceTypes: ['redshift:cluster'],
    service: 'redshift',
    load: hydrateAwsRedshiftClusters,
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
  },
  'aws-route53-records': {
    datasetKey: 'aws-route53-records',
    // Hosted zones seed record-set enumeration because Route 53 record sets are scoped to a zone.
    resourceTypes: ['route53:hostedzone'],
    service: 'route53',
    load: hydrateAwsRoute53Records,
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
  },
  'aws-secretsmanager-secrets': {
    datasetKey: 'aws-secretsmanager-secrets',
    resourceTypes: ['secretsmanager:secret'],
    service: 'secretsmanager',
    load: hydrateAwsSecretsManagerSecrets,
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

  return awsDiscoveryDatasetRegistry[datasetKey as DiscoveryDatasetKey];
};
