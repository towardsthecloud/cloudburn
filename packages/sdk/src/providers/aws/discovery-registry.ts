import type { AwsDiscoveredResource, DiscoveryDatasetKey, DiscoveryDatasetMap } from '@cloudburn/rules';
import { hydrateAwsEbsVolumes } from './resources/ebs.js';
import { hydrateAwsEc2Instances } from './resources/ec2.js';
import { hydrateAwsEc2ElasticIps } from './resources/ec2-elastic-ips.js';
import { hydrateAwsEc2InstanceUtilization } from './resources/ec2-utilization.js';
import { hydrateAwsEcrRepositories } from './resources/ecr.js';
import { hydrateAwsLambdaFunctions } from './resources/lambda.js';
import { hydrateAwsRdsInstances } from './resources/rds.js';
import { hydrateAwsRdsInstanceActivity } from './resources/rds-activity.js';
import { hydrateAwsS3BucketAnalyses } from './resources/s3.js';
import { hydrateAwsEc2VpcEndpointActivity } from './resources/vpc-endpoints.js';

/** Declarative definition for one rule-facing AWS discovery dataset. */
export type AwsDiscoveryDatasetDefinition<K extends DiscoveryDatasetKey = DiscoveryDatasetKey> = {
  datasetKey: K;
  resourceTypes: string[];
  service: 'ebs' | 'ecr' | 'ec2' | 'lambda' | 'rds' | 's3';
  load: (resources: AwsDiscoveredResource[]) => Promise<DiscoveryDatasetMap[K]>;
};

const awsDiscoveryDatasetRegistry: {
  [K in DiscoveryDatasetKey]: AwsDiscoveryDatasetDefinition<K>;
} = {
  'aws-ebs-volumes': {
    datasetKey: 'aws-ebs-volumes',
    resourceTypes: ['ec2:volume'],
    service: 'ebs',
    load: hydrateAwsEbsVolumes,
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
  'aws-ec2-vpc-endpoint-activity': {
    datasetKey: 'aws-ec2-vpc-endpoint-activity',
    resourceTypes: ['ec2:vpc-endpoint'],
    service: 'ec2',
    load: hydrateAwsEc2VpcEndpointActivity,
  },
  'aws-lambda-functions': {
    datasetKey: 'aws-lambda-functions',
    resourceTypes: ['lambda:function'],
    service: 'lambda',
    load: hydrateAwsLambdaFunctions,
  },
  'aws-rds-instance-activity': {
    datasetKey: 'aws-rds-instance-activity',
    resourceTypes: ['rds:db'],
    service: 'rds',
    load: hydrateAwsRdsInstanceActivity,
  },
  'aws-rds-instances': {
    datasetKey: 'aws-rds-instances',
    resourceTypes: ['rds:db'],
    service: 'rds',
    load: hydrateAwsRdsInstances,
  },
  'aws-s3-bucket-analyses': {
    datasetKey: 'aws-s3-bucket-analyses',
    resourceTypes: ['s3:bucket'],
    service: 's3',
    load: hydrateAwsS3BucketAnalyses,
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
