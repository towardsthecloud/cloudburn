import type { AwsDiscoveredResource, DiscoveryDatasetKey, DiscoveryDatasetMap } from '@cloudburn/rules';
import { hydrateAwsEbsVolumes } from './resources/ebs.js';
import { hydrateAwsEc2Instances } from './resources/ec2.js';
import { hydrateAwsLambdaFunctions } from './resources/lambda.js';
import { hydrateAwsS3BucketAnalyses } from './resources/s3.js';

/** Declarative definition for one rule-facing AWS discovery dataset. */
export type AwsDiscoveryDatasetDefinition<K extends DiscoveryDatasetKey = DiscoveryDatasetKey> = {
  datasetKey: K;
  resourceTypes: string[];
  load: (resources: AwsDiscoveredResource[]) => Promise<DiscoveryDatasetMap[K]>;
};

const awsDiscoveryDatasetRegistry: {
  [K in DiscoveryDatasetKey]: AwsDiscoveryDatasetDefinition<K>;
} = {
  'aws-ebs-volumes': {
    datasetKey: 'aws-ebs-volumes',
    resourceTypes: ['ec2:volume'],
    load: hydrateAwsEbsVolumes,
  },
  'aws-ec2-instances': {
    datasetKey: 'aws-ec2-instances',
    resourceTypes: ['ec2:instance'],
    load: hydrateAwsEc2Instances,
  },
  'aws-lambda-functions': {
    datasetKey: 'aws-lambda-functions',
    resourceTypes: ['lambda:function'],
    load: hydrateAwsLambdaFunctions,
  },
  'aws-s3-bucket-analyses': {
    datasetKey: 'aws-s3-bucket-analyses',
    resourceTypes: ['s3:bucket'],
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
