import type {
  AwsStaticEbsVolume,
  AwsStaticEc2Instance,
  AwsStaticEc2VpcEndpoint,
  AwsStaticLambdaFunction,
  AwsStaticS3BucketAnalysis,
  IaCResource,
  SourceLocation,
  StaticDatasetKey,
  StaticDatasetMap,
} from '@cloudburn/rules';
import { isRecord } from '@cloudburn/rules';
import type { IaCSourceKind } from '../../parsers/index.js';

type AwsStaticDatasetDefinition<K extends StaticDatasetKey = StaticDatasetKey> = {
  datasetKey: K;
  sourceKinds: IaCSourceKind[];
  resourceTypes: string[];
  load: (resources: IaCResource[]) => StaticDatasetMap[K];
};

const TERRAFORM_EBS_VOLUME_TYPE = 'aws_ebs_volume';
const CLOUDFORMATION_EBS_VOLUME_TYPE = 'AWS::EC2::Volume';
const TERRAFORM_INSTANCE_TYPE = 'aws_instance';
const CLOUDFORMATION_INSTANCE_TYPE = 'AWS::EC2::Instance';
const TERRAFORM_LAMBDA_TYPE = 'aws_lambda_function';
const CLOUDFORMATION_LAMBDA_TYPE = 'AWS::Lambda::Function';
const TERRAFORM_VPC_ENDPOINT_TYPE = 'aws_vpc_endpoint';
const CLOUDFORMATION_VPC_ENDPOINT_TYPE = 'AWS::EC2::VPCEndpoint';
const TERRAFORM_BUCKET_TYPE = 'aws_s3_bucket';
const TERRAFORM_LIFECYCLE_TYPE = 'aws_s3_bucket_lifecycle_configuration';
const TERRAFORM_INTELLIGENT_TIERING_TYPE = 'aws_s3_bucket_intelligent_tiering_configuration';
const CLOUDFORMATION_BUCKET_TYPE = 'AWS::S3::Bucket';
const DIRECT_BUCKET_REFERENCE_PATTERN = /^\$?\{?aws_s3_bucket\.([A-Za-z0-9_-]+)\.(?:id|bucket)\}?$/u;

const isCloudFormationResource = (resource: IaCResource): boolean => resource.type.startsWith('AWS::');

const toStaticResourceId = (resource: IaCResource): string =>
  isCloudFormationResource(resource) ? resource.name : `${resource.type}.${resource.name}`;

const pickLocation = (resource: IaCResource, attributePaths: string[]): SourceLocation | undefined =>
  attributePaths
    .map((attributePath) => resource.attributeLocations?.[attributePath])
    .find((location): location is SourceLocation => Boolean(location)) ?? resource.location;

const getLiteralString = (value: unknown): string | null =>
  typeof value === 'string' && !value.includes('${') ? value.toLowerCase() : null;

const getLiteralStringArray = (value: unknown): string[] | null => {
  if (value === undefined) {
    return ['x86_64'];
  }

  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    return null;
  }

  return value.map((entry) => entry.toLowerCase());
};

const toRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => isRecord(entry)) : [];

const hasNonEmptyRecordArray = (value: unknown): boolean => toRecordArray(value).length > 0;

const hasScalarValue = (value: unknown): boolean => value !== undefined && value !== null;

const isEnabledStatus = (value: unknown): boolean => typeof value === 'string' && value.toLowerCase() === 'enabled';

const ruleHasTerraformExpiration = (rule: Record<string, unknown>): boolean =>
  hasNonEmptyRecordArray(rule.expiration) || hasNonEmptyRecordArray(rule.noncurrent_version_expiration);

const ruleHasCloudFormationExpiration = (rule: Record<string, unknown>): boolean =>
  hasScalarValue(rule.ExpirationInDays) ||
  hasScalarValue(rule.ExpirationDate) ||
  hasScalarValue(rule.ExpiredObjectDeleteMarker) ||
  isRecord(rule.NoncurrentVersionExpiration);

const getTerraformTransitions = (rule: Record<string, unknown>): Record<string, unknown>[] => [
  ...toRecordArray(rule.transition),
  ...toRecordArray(rule.noncurrent_version_transition),
];

const getCloudFormationTransitions = (rule: Record<string, unknown>): Record<string, unknown>[] => [
  ...toRecordArray(rule.Transitions),
  ...toRecordArray(rule.NoncurrentVersionTransitions),
];

const getTransitionStorageClasses = (rule: Record<string, unknown>): string[] =>
  [...getTerraformTransitions(rule), ...getCloudFormationTransitions(rule)]
    .map((transition) => getLiteralString(transition.storage_class ?? transition.StorageClass))
    .filter((storageClass): storageClass is string => Boolean(storageClass))
    .map((storageClass) => storageClass.toUpperCase());

const hasTransitionAction = (rule: Record<string, unknown>): boolean =>
  getTerraformTransitions(rule).length > 0 || getCloudFormationTransitions(rule).length > 0;

const hasUnclassifiedTransition = (rule: Record<string, unknown>): boolean =>
  [...getTerraformTransitions(rule), ...getCloudFormationTransitions(rule)].some(
    (transition) => getLiteralString(transition.storage_class ?? transition.StorageClass) === null,
  );

const isLifecycleRuleEnabled = (rule: Record<string, unknown>): boolean =>
  rule.enabled === true || isEnabledStatus(rule.status) || isEnabledStatus(rule.Status);

const hasCostFocusedLifecycleRule = (rule: Record<string, unknown>): boolean => {
  if (!isLifecycleRuleEnabled(rule)) {
    return false;
  }

  return ruleHasTerraformExpiration(rule) || ruleHasCloudFormationExpiration(rule) || hasTransitionAction(rule);
};

const getTerraformBucketReferenceKey = (value: unknown): string | null => {
  const literal = getLiteralString(value);

  if (literal) {
    return literal;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const match = DIRECT_BUCKET_REFERENCE_PATTERN.exec(value);
  const resourceName = match?.[1];

  return resourceName ? `${TERRAFORM_BUCKET_TYPE}.${resourceName}` : null;
};

const getTerraformLifecycleRules = (
  lifecycleConfigurations: IaCResource[],
  identityKeys: Set<string>,
): Record<string, unknown>[] =>
  lifecycleConfigurations.flatMap((resource) => {
    const targetKey = getTerraformBucketReferenceKey(resource.attributes.bucket);

    if (!targetKey || !identityKeys.has(targetKey)) {
      return [];
    }

    return toRecordArray(resource.attributes.rule);
  });

const hasEnabledTerraformIntelligentTieringConfiguration = (
  intelligentTieringConfigurations: IaCResource[],
  identityKeys: Set<string>,
): boolean =>
  intelligentTieringConfigurations.some((resource) => {
    const targetKey = getTerraformBucketReferenceKey(resource.attributes.bucket);
    const status = resource.attributes.status;

    return targetKey !== null && identityKeys.has(targetKey) && (status === undefined || isEnabledStatus(status));
  });

const hasEnabledCloudFormationIntelligentTieringConfiguration = (bucket: IaCResource): boolean => {
  const properties = isRecord(bucket.attributes.Properties) ? bucket.attributes.Properties : undefined;
  const configurations = toRecordArray(properties?.IntelligentTieringConfigurations);

  return configurations.some((configuration) => {
    const status = configuration.Status;

    return status === undefined || isEnabledStatus(status);
  });
};

const createTerraformS3BucketAnalysis = (
  bucket: IaCResource,
  lifecycleConfigurations: IaCResource[],
  intelligentTieringConfigurations: IaCResource[],
): AwsStaticS3BucketAnalysis | null => {
  const literalBucketName = getLiteralString(bucket.attributes.bucket);
  const identityKeys = new Set<string>([toStaticResourceId(bucket)]);

  if (literalBucketName) {
    identityKeys.add(literalBucketName);
  }

  const lifecycleRules = [
    ...toRecordArray(bucket.attributes.lifecycle_rule),
    ...getTerraformLifecycleRules(lifecycleConfigurations, identityKeys),
  ];
  const transitionStorageClasses = lifecycleRules
    .filter((rule) => isLifecycleRuleEnabled(rule))
    .flatMap((rule) => getTransitionStorageClasses(rule));

  return {
    resourceId: toStaticResourceId(bucket),
    location: bucket.location,
    hasLifecycleSignal: lifecycleRules.length > 0,
    hasCostFocusedLifecycle: lifecycleRules.some((rule) => hasCostFocusedLifecycleRule(rule)),
    hasIntelligentTieringConfiguration: hasEnabledTerraformIntelligentTieringConfiguration(
      intelligentTieringConfigurations,
      identityKeys,
    ),
    hasIntelligentTieringTransition: transitionStorageClasses.includes('INTELLIGENT_TIERING'),
    hasAlternativeStorageClassTransition: transitionStorageClasses.some(
      (storageClass) => storageClass !== 'STANDARD' && storageClass !== 'INTELLIGENT_TIERING',
    ),
    hasUnclassifiedTransition: lifecycleRules
      .filter((rule) => isLifecycleRuleEnabled(rule))
      .some((rule) => hasUnclassifiedTransition(rule)),
  };
};

const createCloudFormationS3BucketAnalysis = (bucket: IaCResource): AwsStaticS3BucketAnalysis => {
  const properties = isRecord(bucket.attributes.Properties) ? bucket.attributes.Properties : undefined;
  const lifecycleConfiguration = isRecord(properties?.LifecycleConfiguration)
    ? properties.LifecycleConfiguration
    : undefined;
  const lifecycleRules = toRecordArray(lifecycleConfiguration?.Rules);
  const transitionStorageClasses = lifecycleRules
    .filter((rule) => isLifecycleRuleEnabled(rule))
    .flatMap((rule) => getTransitionStorageClasses(rule));

  return {
    resourceId: toStaticResourceId(bucket),
    location: bucket.location,
    hasLifecycleSignal: lifecycleRules.length > 0,
    hasCostFocusedLifecycle: lifecycleRules.some((rule) => hasCostFocusedLifecycleRule(rule)),
    hasIntelligentTieringConfiguration: hasEnabledCloudFormationIntelligentTieringConfiguration(bucket),
    hasIntelligentTieringTransition: transitionStorageClasses.includes('INTELLIGENT_TIERING'),
    hasAlternativeStorageClassTransition: transitionStorageClasses.some(
      (storageClass) => storageClass !== 'STANDARD' && storageClass !== 'INTELLIGENT_TIERING',
    ),
    hasUnclassifiedTransition: lifecycleRules
      .filter((rule) => isLifecycleRuleEnabled(rule))
      .some((rule) => hasUnclassifiedTransition(rule)),
  };
};

const loadStaticEbsVolumes = (resources: IaCResource[]): AwsStaticEbsVolume[] =>
  resources.map((resource) => ({
    resourceId: toStaticResourceId(resource),
    volumeType: getLiteralString(
      resource.type === TERRAFORM_EBS_VOLUME_TYPE
        ? resource.attributes.type
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.VolumeType
          : undefined,
    ),
    location: pickLocation(resource, ['type', 'Properties.VolumeType']),
  }));

const loadStaticEc2Instances = (resources: IaCResource[]): AwsStaticEc2Instance[] =>
  resources.map((resource) => ({
    resourceId: toStaticResourceId(resource),
    instanceType: getLiteralString(
      resource.type === TERRAFORM_INSTANCE_TYPE
        ? resource.attributes.instance_type
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.InstanceType
          : undefined,
    ),
    location: pickLocation(resource, ['instance_type', 'Properties.InstanceType']),
  }));

const loadStaticLambdaFunctions = (resources: IaCResource[]): AwsStaticLambdaFunction[] =>
  resources.map((resource) => ({
    resourceId: toStaticResourceId(resource),
    architectures: getLiteralStringArray(
      resource.type === TERRAFORM_LAMBDA_TYPE
        ? resource.attributes.architectures
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.Architectures
          : undefined,
    ),
    location: pickLocation(resource, ['architectures', 'Properties.Architectures']),
  }));

const loadStaticEc2VpcEndpoints = (resources: IaCResource[]): AwsStaticEc2VpcEndpoint[] =>
  resources.map((resource) => ({
    resourceId: toStaticResourceId(resource),
    serviceName: getLiteralString(
      resource.type === TERRAFORM_VPC_ENDPOINT_TYPE
        ? resource.attributes.service_name
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.ServiceName
          : undefined,
    ),
    vpcEndpointType: getLiteralString(
      resource.type === TERRAFORM_VPC_ENDPOINT_TYPE
        ? resource.attributes.vpc_endpoint_type
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.VpcEndpointType
          : undefined,
    ),
    location: pickLocation(resource, [
      'vpc_endpoint_type',
      'service_name',
      'Properties.VpcEndpointType',
      'Properties.ServiceName',
    ]),
  }));

const loadStaticS3BucketAnalyses = (resources: IaCResource[]): AwsStaticS3BucketAnalysis[] => {
  const lifecycleConfigurations = resources.filter((resource) => resource.type === TERRAFORM_LIFECYCLE_TYPE);
  const intelligentTieringConfigurations = resources.filter(
    (resource) => resource.type === TERRAFORM_INTELLIGENT_TIERING_TYPE,
  );

  return resources.flatMap((resource) => {
    if (resource.type === TERRAFORM_BUCKET_TYPE) {
      const analysis = createTerraformS3BucketAnalysis(
        resource,
        lifecycleConfigurations,
        intelligentTieringConfigurations,
      );

      return analysis ? [analysis] : [];
    }

    if (resource.type === CLOUDFORMATION_BUCKET_TYPE) {
      return [createCloudFormationS3BucketAnalysis(resource)];
    }

    return [];
  });
};

const awsStaticDatasetRegistry: Record<StaticDatasetKey, AwsStaticDatasetDefinition> = {
  'aws-ebs-volumes': {
    datasetKey: 'aws-ebs-volumes',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_EBS_VOLUME_TYPE, CLOUDFORMATION_EBS_VOLUME_TYPE],
    load: loadStaticEbsVolumes,
  },
  'aws-ec2-instances': {
    datasetKey: 'aws-ec2-instances',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_INSTANCE_TYPE, CLOUDFORMATION_INSTANCE_TYPE],
    load: loadStaticEc2Instances,
  },
  'aws-lambda-functions': {
    datasetKey: 'aws-lambda-functions',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_LAMBDA_TYPE, CLOUDFORMATION_LAMBDA_TYPE],
    load: loadStaticLambdaFunctions,
  },
  'aws-ec2-vpc-endpoints': {
    datasetKey: 'aws-ec2-vpc-endpoints',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_VPC_ENDPOINT_TYPE, CLOUDFORMATION_VPC_ENDPOINT_TYPE],
    load: loadStaticEc2VpcEndpoints,
  },
  'aws-s3-bucket-analyses': {
    datasetKey: 'aws-s3-bucket-analyses',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [
      TERRAFORM_BUCKET_TYPE,
      TERRAFORM_LIFECYCLE_TYPE,
      TERRAFORM_INTELLIGENT_TIERING_TYPE,
      CLOUDFORMATION_BUCKET_TYPE,
    ],
    load: loadStaticS3BucketAnalyses,
  },
};

/**
 * Returns the dataset loader definition for a stable static dataset key.
 *
 * @param datasetKey - Rule-facing static dataset key.
 * @returns The matching dataset definition, or `undefined` when it is unknown.
 */
export const getAwsStaticDatasetDefinition = (datasetKey: string): AwsStaticDatasetDefinition | undefined => {
  if (!Object.hasOwn(awsStaticDatasetRegistry, datasetKey)) {
    return undefined;
  }

  return awsStaticDatasetRegistry[datasetKey as StaticDatasetKey];
};
