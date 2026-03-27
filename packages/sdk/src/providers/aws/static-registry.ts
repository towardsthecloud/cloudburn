import type {
  AwsStaticApiGatewayStage,
  AwsStaticCloudFrontDistribution,
  AwsStaticCloudWatchLogGroup,
  AwsStaticDynamoDbAutoscaling,
  AwsStaticDynamoDbTable,
  AwsStaticEbsVolume,
  AwsStaticEc2ElasticIp,
  AwsStaticEc2Instance,
  AwsStaticEc2VpcEndpoint,
  AwsStaticEcrRepository,
  AwsStaticEksNodegroup,
  AwsStaticEmrCluster,
  AwsStaticLambdaFunction,
  AwsStaticRdsInstance,
  AwsStaticRoute53HealthCheck,
  AwsStaticRoute53Record,
  AwsStaticS3BucketAnalysis,
  IaCResource,
  SourceLocation,
  StaticDatasetKey,
  StaticDatasetMap,
} from '@cloudburn/rules';
import { isRecord } from '@cloudburn/rules';
import type { IaCSourceKind } from '../../parsers/index.js';
import { buildS3BucketAnalysisFlags } from './resources/s3-analysis.js';

type AwsStaticDatasetDefinition<K extends StaticDatasetKey = StaticDatasetKey> = {
  datasetKey: K;
  sourceKinds: IaCSourceKind[];
  resourceTypes: string[];
  load: (resources: IaCResource[]) => StaticDatasetMap[K];
};

const TERRAFORM_EBS_VOLUME_TYPE = 'aws_ebs_volume';
const CLOUDFORMATION_EBS_VOLUME_TYPE = 'AWS::EC2::Volume';
const TERRAFORM_API_GATEWAY_STAGE_TYPE = 'aws_api_gateway_stage';
const CLOUDFORMATION_API_GATEWAY_STAGE_TYPE = 'AWS::ApiGateway::Stage';
const TERRAFORM_CLOUDFRONT_DISTRIBUTION_TYPE = 'aws_cloudfront_distribution';
const CLOUDFORMATION_CLOUDFRONT_DISTRIBUTION_TYPE = 'AWS::CloudFront::Distribution';
const TERRAFORM_CLOUDWATCH_LOG_GROUP_TYPE = 'aws_cloudwatch_log_group';
const CLOUDFORMATION_CLOUDWATCH_LOG_GROUP_TYPE = 'AWS::Logs::LogGroup';
const TERRAFORM_DYNAMODB_TABLE_TYPE = 'aws_dynamodb_table';
const CLOUDFORMATION_DYNAMODB_TABLE_TYPE = 'AWS::DynamoDB::Table';
const TERRAFORM_APPAUTOSCALING_TARGET_TYPE = 'aws_appautoscaling_target';
const CLOUDFORMATION_SCALABLE_TARGET_TYPE = 'AWS::ApplicationAutoScaling::ScalableTarget';
const TERRAFORM_ECR_REPOSITORY_TYPE = 'aws_ecr_repository';
const TERRAFORM_ECR_LIFECYCLE_POLICY_TYPE = 'aws_ecr_lifecycle_policy';
const CLOUDFORMATION_ECR_REPOSITORY_TYPE = 'AWS::ECR::Repository';
const TERRAFORM_EIP_TYPE = 'aws_eip';
const TERRAFORM_EIP_ASSOCIATION_TYPE = 'aws_eip_association';
const CLOUDFORMATION_EIP_TYPE = 'AWS::EC2::EIP';
const CLOUDFORMATION_EIP_ASSOCIATION_TYPE = 'AWS::EC2::EIPAssociation';
const TERRAFORM_INSTANCE_TYPE = 'aws_instance';
const CLOUDFORMATION_INSTANCE_TYPE = 'AWS::EC2::Instance';
const TERRAFORM_EKS_NODE_GROUP_TYPE = 'aws_eks_node_group';
const CLOUDFORMATION_EKS_NODEGROUP_TYPE = 'AWS::EKS::Nodegroup';
const TERRAFORM_EMR_CLUSTER_TYPE = 'aws_emr_cluster';
const CLOUDFORMATION_EMR_CLUSTER_TYPE = 'AWS::EMR::Cluster';
const TERRAFORM_RDS_INSTANCE_TYPE = 'aws_db_instance';
const CLOUDFORMATION_RDS_INSTANCE_TYPE = 'AWS::RDS::DBInstance';
const TERRAFORM_ROUTE53_RECORD_TYPE = 'aws_route53_record';
const TERRAFORM_ROUTE53_HEALTH_CHECK_TYPE = 'aws_route53_health_check';
const CLOUDFORMATION_ROUTE53_RECORD_SET_TYPE = 'AWS::Route53::RecordSet';
const CLOUDFORMATION_ROUTE53_RECORD_SET_GROUP_TYPE = 'AWS::Route53::RecordSetGroup';
const CLOUDFORMATION_ROUTE53_HEALTH_CHECK_TYPE = 'AWS::Route53::HealthCheck';
const TERRAFORM_LAMBDA_TYPE = 'aws_lambda_function';
const CLOUDFORMATION_LAMBDA_TYPE = 'AWS::Lambda::Function';
const TERRAFORM_VPC_ENDPOINT_TYPE = 'aws_vpc_endpoint';
const CLOUDFORMATION_VPC_ENDPOINT_TYPE = 'AWS::EC2::VPCEndpoint';
const TERRAFORM_BUCKET_TYPE = 'aws_s3_bucket';
const TERRAFORM_LIFECYCLE_TYPE = 'aws_s3_bucket_lifecycle_configuration';
const TERRAFORM_INTELLIGENT_TIERING_TYPE = 'aws_s3_bucket_intelligent_tiering_configuration';
const CLOUDFORMATION_BUCKET_TYPE = 'AWS::S3::Bucket';
const DIRECT_BUCKET_REFERENCE_PATTERN = /^\$?\{?aws_s3_bucket\.([A-Za-z0-9_-]+)\.(?:id|bucket)\}?$/u;
const DIRECT_ECR_REPOSITORY_REFERENCE_PATTERN = /^\$?\{?aws_ecr_repository\.([A-Za-z0-9_-]+)\.(?:id|name)\}?$/u;
const DIRECT_EIP_REFERENCE_PATTERN = /^\$?\{?aws_eip\.([A-Za-z0-9_-]+)\.(?:id|allocation_id)\}?$/u;
const DIRECT_ROUTE53_HEALTH_CHECK_REFERENCE_PATTERN =
  /^\$?\{?aws_route53_health_check\.([A-Za-z0-9_-]+)\.(?:id|health_check_id)\}?$/u;
const DYNAMODB_TABLE_RESOURCE_ID_PATTERN = /^table\/([^/]+)$/u;

const isCloudFormationResource = (resource: IaCResource): boolean => resource.type.startsWith('AWS::');

const toStaticResourceId = (resource: IaCResource): string =>
  isCloudFormationResource(resource) ? resource.name : `${resource.type}.${resource.name}`;

const pickLocation = (resource: IaCResource, attributePaths: string[]): SourceLocation | undefined =>
  attributePaths
    .map((attributePath) => resource.attributeLocations?.[attributePath])
    .find((location): location is SourceLocation => Boolean(location)) ?? resource.location;

const getLiteralString = (value: unknown): string | null =>
  typeof value === 'string' && !value.includes('${') ? value.toLowerCase() : null;

const getLiteralNumber = (value: unknown): number | null => (typeof value === 'number' ? value : null);

const getLiteralNumberish = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string' || value.includes('${')) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const getLiteralExactString = (value: unknown): string | null =>
  typeof value === 'string' && !value.includes('${') ? value : null;

const getLiteralExactStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && !entry.includes('${'))) {
    return null;
  }

  return [...value];
};

const getLiteralUpperString = (value: unknown): string | null => {
  const literal = getLiteralExactString(value);

  return literal ? literal.toUpperCase() : null;
};

const getLiteralBoolean = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

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

const getCloudFormationLogicalIdReference = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.Ref === 'string') {
    return value.Ref;
  }

  const getAtt = value['Fn::GetAtt'];

  if (typeof getAtt === 'string') {
    const [logicalId] = getAtt.split('.', 1);
    return logicalId ?? null;
  }

  if (Array.isArray(getAtt) && getAtt.length > 0 && typeof getAtt[0] === 'string') {
    return getAtt[0];
  }

  return null;
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

const getTerraformEcrRepositoryReferenceKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const match = DIRECT_ECR_REPOSITORY_REFERENCE_PATTERN.exec(value);
  const resourceName = match?.[1];

  if (resourceName) {
    return `${TERRAFORM_ECR_REPOSITORY_TYPE}.${resourceName}`;
  }

  return value.toLowerCase();
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
): Record<string, unknown>[] =>
  intelligentTieringConfigurations.flatMap((resource) => {
    const targetKey = getTerraformBucketReferenceKey(resource.attributes.bucket);

    if (targetKey === null || !identityKeys.has(targetKey)) {
      return [];
    }

    return [{ status: resource.attributes.status }];
  });

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

  return {
    resourceId: toStaticResourceId(bucket),
    location: bucket.location,
    ...buildS3BucketAnalysisFlags(
      lifecycleRules,
      hasEnabledTerraformIntelligentTieringConfiguration(intelligentTieringConfigurations, identityKeys),
    ),
  };
};

const createCloudFormationS3BucketAnalysis = (bucket: IaCResource): AwsStaticS3BucketAnalysis => {
  const properties = isRecord(bucket.attributes.Properties) ? bucket.attributes.Properties : undefined;
  const lifecycleConfiguration = isRecord(properties?.LifecycleConfiguration)
    ? properties.LifecycleConfiguration
    : undefined;
  const lifecycleRules = toRecordArray(lifecycleConfiguration?.Rules);
  const intelligentTieringConfigurations = toRecordArray(properties?.IntelligentTieringConfigurations);

  return {
    resourceId: toStaticResourceId(bucket),
    location: bucket.location,
    ...buildS3BucketAnalysisFlags(lifecycleRules, intelligentTieringConfigurations),
  };
};

const createTerraformEcrRepository = (
  repository: IaCResource,
  lifecyclePolicies: IaCResource[],
): AwsStaticEcrRepository => {
  const repositoryName = getTerraformEcrRepositoryReferenceKey(repository.attributes.name);
  const identityKeys = new Set<string>([toStaticResourceId(repository)]);

  if (repositoryName) {
    identityKeys.add(repositoryName);
  }

  return {
    hasLifecyclePolicy: lifecyclePolicies.some((lifecyclePolicy) => {
      const targetKey = getTerraformEcrRepositoryReferenceKey(lifecyclePolicy.attributes.repository);
      return targetKey !== null && identityKeys.has(targetKey);
    }),
    location: repository.location,
    resourceId: toStaticResourceId(repository),
  };
};

const createCloudFormationEcrRepository = (repository: IaCResource): AwsStaticEcrRepository => {
  const properties = isRecord(repository.attributes.Properties) ? repository.attributes.Properties : undefined;

  return {
    hasLifecyclePolicy: isRecord(properties?.LifecyclePolicy),
    location: repository.location,
    resourceId: toStaticResourceId(repository),
  };
};

const getTerraformDynamoDbTableName = (resource: IaCResource): string | null =>
  getLiteralExactString(resource.attributes.name);

const getCloudFormationDynamoDbTableName = (resource: IaCResource): string | null => {
  const properties = isRecord(resource.attributes.Properties) ? resource.attributes.Properties : undefined;
  return getLiteralExactString(properties?.TableName) ?? resource.name;
};

const getLiteralDynamoDbTableNameFromResourceId = (value: unknown): string | null => {
  const resourceId = getLiteralExactString(value);
  const tableName = resourceId ? DYNAMODB_TABLE_RESOURCE_ID_PATTERN.exec(resourceId)?.[1] : undefined;

  return tableName ?? null;
};

const getTerraformElasticIpReferenceKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const match = DIRECT_EIP_REFERENCE_PATTERN.exec(value);
  const resourceName = match?.[1];

  return resourceName ? `${TERRAFORM_EIP_TYPE}.${resourceName}` : null;
};

const getCloudFormationElasticIpReferenceKey = (value: unknown): string | null =>
  getCloudFormationLogicalIdReference(value);

const getStaticDynamoDbBillingMode = (value: unknown): 'PAY_PER_REQUEST' | 'PROVISIONED' | null => {
  const billingMode = getLiteralUpperString(value);

  return billingMode === 'PAY_PER_REQUEST' || billingMode === 'PROVISIONED' ? billingMode : null;
};

const getTerraformRoute53HealthCheckReferenceKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const match = DIRECT_ROUTE53_HEALTH_CHECK_REFERENCE_PATTERN.exec(value);
  const resourceName = match?.[1];

  return resourceName ? `${TERRAFORM_ROUTE53_HEALTH_CHECK_TYPE}.${resourceName}` : null;
};

const createStaticRoute53Record = (
  resourceId: string,
  location: SourceLocation | undefined,
  ttlValue: unknown,
  isAlias: boolean,
  healthCheckReference: unknown,
): AwsStaticRoute53Record => ({
  isAlias,
  location,
  referencedHealthCheckResourceId:
    getTerraformRoute53HealthCheckReferenceKey(healthCheckReference) ??
    getCloudFormationLogicalIdReference(healthCheckReference),
  resourceId,
  ttl: ttlValue === undefined ? undefined : getLiteralNumberish(ttlValue),
});

const getTerraformEmrInstanceTypes = (resource: IaCResource): string[] => {
  const instanceTypes: string[] = [];

  for (const attributeName of ['master_instance_group', 'core_instance_group', 'task_instance_group']) {
    for (const group of toRecordArray(resource.attributes[attributeName])) {
      const instanceType = getLiteralExactString(group.instance_type);

      if (instanceType) {
        instanceTypes.push(instanceType);
      }
    }
  }

  return instanceTypes;
};

const getCloudFormationEmrInstanceTypes = (resource: IaCResource): string[] => {
  const properties = isRecord(resource.attributes.Properties) ? resource.attributes.Properties : undefined;
  const instancesConfig = isRecord(properties?.JobFlowInstancesConfig) ? properties.JobFlowInstancesConfig : undefined;
  const instanceTypes: string[] = [];

  for (const attributeName of ['MasterInstanceGroup', 'CoreInstanceGroup', 'TaskInstanceGroup']) {
    const instanceGroup = isRecord(instancesConfig?.[attributeName]) ? instancesConfig[attributeName] : undefined;
    const instanceType = getLiteralExactString(instanceGroup?.InstanceType);

    if (instanceType) {
      instanceTypes.push(instanceType);
    }
  }

  return instanceTypes;
};

const loadStaticApiGatewayStages = (resources: IaCResource[]): AwsStaticApiGatewayStage[] =>
  resources.map((resource) => {
    const rawValue =
      resource.type === TERRAFORM_API_GATEWAY_STAGE_TYPE
        ? resource.attributes.cache_cluster_enabled
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.CacheClusterEnabled
          : undefined;

    return {
      cacheClusterEnabled: rawValue === undefined ? false : getLiteralBoolean(rawValue),
      location: pickLocation(resource, ['cache_cluster_enabled', 'Properties.CacheClusterEnabled']),
      resourceId: toStaticResourceId(resource),
    };
  });

const loadStaticCloudFrontDistributions = (resources: IaCResource[]): AwsStaticCloudFrontDistribution[] =>
  resources.map((resource) => {
    const rawValue =
      resource.type === TERRAFORM_CLOUDFRONT_DISTRIBUTION_TYPE
        ? resource.attributes.price_class
        : isRecord(resource.attributes.Properties) && isRecord(resource.attributes.Properties.DistributionConfig)
          ? resource.attributes.Properties.DistributionConfig.PriceClass
          : undefined;

    return {
      location: pickLocation(resource, ['price_class', 'Properties.DistributionConfig.PriceClass']),
      priceClass: rawValue === undefined ? 'PriceClass_All' : getLiteralExactString(rawValue),
      resourceId: toStaticResourceId(resource),
    };
  });

const loadStaticCloudWatchLogGroups = (resources: IaCResource[]): AwsStaticCloudWatchLogGroup[] =>
  resources.map((resource) => {
    const retentionValue =
      resource.type === TERRAFORM_CLOUDWATCH_LOG_GROUP_TYPE
        ? resource.attributes.retention_in_days
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.RetentionInDays
          : undefined;
    const classValue =
      resource.type === TERRAFORM_CLOUDWATCH_LOG_GROUP_TYPE
        ? resource.attributes.log_group_class
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.LogGroupClass
          : undefined;

    return {
      location: pickLocation(resource, [
        'retention_in_days',
        'log_group_class',
        'Properties.RetentionInDays',
        'Properties.LogGroupClass',
      ]),
      logGroupClass: classValue === undefined ? undefined : getLiteralUpperString(classValue),
      resourceId: toStaticResourceId(resource),
      retentionInDays: retentionValue === undefined ? undefined : getLiteralNumber(retentionValue),
    };
  });

const loadStaticDynamoDbTables = (resources: IaCResource[]): AwsStaticDynamoDbTable[] =>
  resources.flatMap((resource) => {
    if (resource.type === TERRAFORM_DYNAMODB_TABLE_TYPE) {
      return [
        {
          billingMode: getStaticDynamoDbBillingMode(resource.attributes.billing_mode) ?? 'PROVISIONED',
          location: pickLocation(resource, ['name', 'billing_mode']),
          resourceId: toStaticResourceId(resource),
          tableName: getTerraformDynamoDbTableName(resource),
        },
      ];
    }

    if (resource.type === CLOUDFORMATION_DYNAMODB_TABLE_TYPE) {
      const properties = isRecord(resource.attributes.Properties) ? resource.attributes.Properties : undefined;

      return [
        {
          billingMode: getStaticDynamoDbBillingMode(properties?.BillingMode) ?? 'PROVISIONED',
          location: pickLocation(resource, ['Properties.TableName', 'Properties.BillingMode']),
          resourceId: toStaticResourceId(resource),
          tableName: getCloudFormationDynamoDbTableName(resource),
        },
      ];
    }

    return [];
  });

const loadStaticDynamoDbAutoscaling = (resources: IaCResource[]): AwsStaticDynamoDbAutoscaling[] => {
  const autoscalingByTable = new Map<string, AwsStaticDynamoDbAutoscaling>();

  for (const resource of resources) {
    const properties = isRecord(resource.attributes.Properties) ? resource.attributes.Properties : undefined;
    const tableName =
      resource.type === TERRAFORM_APPAUTOSCALING_TARGET_TYPE
        ? getLiteralDynamoDbTableNameFromResourceId(resource.attributes.resource_id)
        : resource.type === CLOUDFORMATION_SCALABLE_TARGET_TYPE
          ? getLiteralDynamoDbTableNameFromResourceId(properties?.ResourceId)
          : null;
    const scalableDimension =
      resource.type === TERRAFORM_APPAUTOSCALING_TARGET_TYPE
        ? getLiteralExactString(resource.attributes.scalable_dimension)
        : resource.type === CLOUDFORMATION_SCALABLE_TARGET_TYPE
          ? getLiteralExactString(properties?.ScalableDimension)
          : null;

    if (tableName === null || scalableDimension === null) {
      continue;
    }

    const entry = autoscalingByTable.get(tableName) ?? {
      tableName,
      hasReadTarget: false,
      hasWriteTarget: false,
    };

    if (scalableDimension === 'dynamodb:table:ReadCapacityUnits') {
      entry.hasReadTarget = true;
    }

    if (scalableDimension === 'dynamodb:table:WriteCapacityUnits') {
      entry.hasWriteTarget = true;
    }

    autoscalingByTable.set(tableName, entry);
  }

  return [...autoscalingByTable.values()];
};

const loadStaticEbsVolumes = (resources: IaCResource[]): AwsStaticEbsVolume[] =>
  resources.map((resource) => ({
    iops: getLiteralNumber(
      resource.type === TERRAFORM_EBS_VOLUME_TYPE
        ? resource.attributes.iops
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.Iops
          : undefined,
    ),
    sizeGiB: getLiteralNumber(
      resource.type === TERRAFORM_EBS_VOLUME_TYPE
        ? resource.attributes.size
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.Size
          : undefined,
    ),
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

const loadStaticEcrRepositories = (resources: IaCResource[]): AwsStaticEcrRepository[] => {
  const lifecyclePolicies = resources.filter((resource) => resource.type === TERRAFORM_ECR_LIFECYCLE_POLICY_TYPE);

  return resources.flatMap((resource) => {
    if (resource.type === TERRAFORM_ECR_REPOSITORY_TYPE) {
      return [createTerraformEcrRepository(resource, lifecyclePolicies)];
    }

    if (resource.type === CLOUDFORMATION_ECR_REPOSITORY_TYPE) {
      return [createCloudFormationEcrRepository(resource)];
    }

    return [];
  });
};

const loadStaticEc2ElasticIps = (resources: IaCResource[]): AwsStaticEc2ElasticIp[] => {
  const elasticIps = resources.filter(
    (resource) => resource.type === TERRAFORM_EIP_TYPE || resource.type === CLOUDFORMATION_EIP_TYPE,
  );
  const associatedResourceIds = new Set<string>();

  for (const resource of resources) {
    if (resource.type === TERRAFORM_EIP_TYPE) {
      if (resource.attributes.instance !== undefined || resource.attributes.network_interface !== undefined) {
        associatedResourceIds.add(toStaticResourceId(resource));
      }

      continue;
    }

    if (resource.type === CLOUDFORMATION_EIP_TYPE) {
      const properties = isRecord(resource.attributes.Properties) ? resource.attributes.Properties : undefined;

      if (properties?.InstanceId !== undefined) {
        associatedResourceIds.add(toStaticResourceId(resource));
      }

      continue;
    }

    if (resource.type === TERRAFORM_EIP_ASSOCIATION_TYPE) {
      const referenceKey = getTerraformElasticIpReferenceKey(resource.attributes.allocation_id);

      if (referenceKey !== null) {
        associatedResourceIds.add(referenceKey);
      }

      continue;
    }

    if (resource.type === CLOUDFORMATION_EIP_ASSOCIATION_TYPE) {
      const properties = isRecord(resource.attributes.Properties) ? resource.attributes.Properties : undefined;
      const referenceKey = getCloudFormationElasticIpReferenceKey(properties?.AllocationId);

      if (referenceKey !== null) {
        associatedResourceIds.add(referenceKey);
      }
    }
  }

  return elasticIps.map((resource) => ({
    isAssociated: associatedResourceIds.has(toStaticResourceId(resource)),
    location: pickLocation(
      resource,
      resource.type === TERRAFORM_EIP_TYPE ? ['instance', 'network_interface'] : ['Properties.InstanceId'],
    ),
    resourceId: toStaticResourceId(resource),
  }));
};

const loadStaticEksNodegroups = (resources: IaCResource[]): AwsStaticEksNodegroup[] =>
  resources.map((resource) => ({
    amiType: getLiteralExactString(
      resource.type === TERRAFORM_EKS_NODE_GROUP_TYPE
        ? resource.attributes.ami_type
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.AmiType
          : undefined,
    ),
    instanceTypes:
      getLiteralExactStringArray(
        resource.type === TERRAFORM_EKS_NODE_GROUP_TYPE
          ? resource.attributes.instance_types
          : isRecord(resource.attributes.Properties)
            ? resource.attributes.Properties.InstanceTypes
            : undefined,
      ) ?? [],
    location: pickLocation(resource, ['ami_type', 'instance_types', 'Properties.AmiType', 'Properties.InstanceTypes']),
    resourceId: toStaticResourceId(resource),
  }));

const loadStaticEmrClusters = (resources: IaCResource[]): AwsStaticEmrCluster[] =>
  resources.map((resource) => ({
    instanceTypes:
      resource.type === TERRAFORM_EMR_CLUSTER_TYPE
        ? getTerraformEmrInstanceTypes(resource)
        : getCloudFormationEmrInstanceTypes(resource),
    location: pickLocation(resource, [
      'master_instance_group',
      'core_instance_group',
      'task_instance_group',
      'Properties.JobFlowInstancesConfig.MasterInstanceGroup.InstanceType',
      'Properties.JobFlowInstancesConfig.CoreInstanceGroup.InstanceType',
      'Properties.JobFlowInstancesConfig.TaskInstanceGroup.InstanceType',
    ]),
    resourceId: toStaticResourceId(resource),
  }));

const loadStaticRoute53Records = (resources: IaCResource[]): AwsStaticRoute53Record[] =>
  resources.flatMap((resource) => {
    if (resource.type === TERRAFORM_ROUTE53_RECORD_TYPE) {
      const aliasRecords = toRecordArray(resource.attributes.alias);

      return [
        createStaticRoute53Record(
          toStaticResourceId(resource),
          pickLocation(resource, ['ttl', 'alias', 'health_check_id']),
          resource.attributes.ttl,
          aliasRecords.length > 0,
          resource.attributes.health_check_id,
        ),
      ];
    }

    if (resource.type === CLOUDFORMATION_ROUTE53_RECORD_SET_TYPE) {
      const properties = isRecord(resource.attributes.Properties) ? resource.attributes.Properties : undefined;

      return [
        createStaticRoute53Record(
          toStaticResourceId(resource),
          pickLocation(resource, ['Properties.TTL', 'Properties.AliasTarget', 'Properties.HealthCheckId']),
          properties?.TTL,
          isRecord(properties?.AliasTarget),
          properties?.HealthCheckId,
        ),
      ];
    }

    if (resource.type === CLOUDFORMATION_ROUTE53_RECORD_SET_GROUP_TYPE) {
      const properties = isRecord(resource.attributes.Properties) ? resource.attributes.Properties : undefined;

      return toRecordArray(properties?.RecordSets).map((recordSet, index) =>
        createStaticRoute53Record(
          `${toStaticResourceId(resource)}#${index + 1}`,
          pickLocation(resource, ['Properties.RecordSets']),
          recordSet.TTL,
          isRecord(recordSet.AliasTarget),
          recordSet.HealthCheckId,
        ),
      );
    }

    return [];
  });

const loadStaticRoute53HealthChecks = (resources: IaCResource[]): AwsStaticRoute53HealthCheck[] =>
  resources.map((resource) => ({
    location: resource.location,
    resourceId: toStaticResourceId(resource),
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

const loadStaticRdsInstances = (resources: IaCResource[]): AwsStaticRdsInstance[] =>
  resources.map((resource) => ({
    engine: getLiteralString(
      resource.type === TERRAFORM_RDS_INSTANCE_TYPE
        ? resource.attributes.engine
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.Engine
          : undefined,
    ),
    engineVersion: getLiteralString(
      resource.type === TERRAFORM_RDS_INSTANCE_TYPE
        ? resource.attributes.engine_version
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.EngineVersion
          : undefined,
    ),
    resourceId: toStaticResourceId(resource),
    instanceClass: getLiteralString(
      resource.type === TERRAFORM_RDS_INSTANCE_TYPE
        ? resource.attributes.instance_class
        : isRecord(resource.attributes.Properties)
          ? resource.attributes.Properties.DBInstanceClass
          : undefined,
    ),
    location: pickLocation(resource, ['instance_class', 'Properties.DBInstanceClass']),
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
  'aws-apigateway-stages': {
    datasetKey: 'aws-apigateway-stages',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_API_GATEWAY_STAGE_TYPE, CLOUDFORMATION_API_GATEWAY_STAGE_TYPE],
    load: loadStaticApiGatewayStages,
  },
  'aws-cloudfront-distributions': {
    datasetKey: 'aws-cloudfront-distributions',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_CLOUDFRONT_DISTRIBUTION_TYPE, CLOUDFORMATION_CLOUDFRONT_DISTRIBUTION_TYPE],
    load: loadStaticCloudFrontDistributions,
  },
  'aws-cloudwatch-log-groups': {
    datasetKey: 'aws-cloudwatch-log-groups',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_CLOUDWATCH_LOG_GROUP_TYPE, CLOUDFORMATION_CLOUDWATCH_LOG_GROUP_TYPE],
    load: loadStaticCloudWatchLogGroups,
  },
  'aws-dynamodb-autoscaling': {
    datasetKey: 'aws-dynamodb-autoscaling',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_APPAUTOSCALING_TARGET_TYPE, CLOUDFORMATION_SCALABLE_TARGET_TYPE],
    load: loadStaticDynamoDbAutoscaling,
  },
  'aws-dynamodb-tables': {
    datasetKey: 'aws-dynamodb-tables',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_DYNAMODB_TABLE_TYPE, CLOUDFORMATION_DYNAMODB_TABLE_TYPE],
    load: loadStaticDynamoDbTables,
  },
  'aws-ebs-volumes': {
    datasetKey: 'aws-ebs-volumes',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_EBS_VOLUME_TYPE, CLOUDFORMATION_EBS_VOLUME_TYPE],
    load: loadStaticEbsVolumes,
  },
  'aws-ecr-repositories': {
    datasetKey: 'aws-ecr-repositories',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [
      TERRAFORM_ECR_REPOSITORY_TYPE,
      TERRAFORM_ECR_LIFECYCLE_POLICY_TYPE,
      CLOUDFORMATION_ECR_REPOSITORY_TYPE,
    ],
    load: loadStaticEcrRepositories,
  },
  'aws-ec2-elastic-ips': {
    datasetKey: 'aws-ec2-elastic-ips',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [
      TERRAFORM_EIP_TYPE,
      TERRAFORM_EIP_ASSOCIATION_TYPE,
      CLOUDFORMATION_EIP_TYPE,
      CLOUDFORMATION_EIP_ASSOCIATION_TYPE,
    ],
    load: loadStaticEc2ElasticIps,
  },
  'aws-ec2-instances': {
    datasetKey: 'aws-ec2-instances',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_INSTANCE_TYPE, CLOUDFORMATION_INSTANCE_TYPE],
    load: loadStaticEc2Instances,
  },
  'aws-eks-nodegroups': {
    datasetKey: 'aws-eks-nodegroups',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_EKS_NODE_GROUP_TYPE, CLOUDFORMATION_EKS_NODEGROUP_TYPE],
    load: loadStaticEksNodegroups,
  },
  'aws-emr-clusters': {
    datasetKey: 'aws-emr-clusters',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_EMR_CLUSTER_TYPE, CLOUDFORMATION_EMR_CLUSTER_TYPE],
    load: loadStaticEmrClusters,
  },
  'aws-lambda-functions': {
    datasetKey: 'aws-lambda-functions',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_LAMBDA_TYPE, CLOUDFORMATION_LAMBDA_TYPE],
    load: loadStaticLambdaFunctions,
  },
  'aws-rds-instances': {
    datasetKey: 'aws-rds-instances',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_RDS_INSTANCE_TYPE, CLOUDFORMATION_RDS_INSTANCE_TYPE],
    load: loadStaticRdsInstances,
  },
  'aws-route53-health-checks': {
    datasetKey: 'aws-route53-health-checks',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [TERRAFORM_ROUTE53_HEALTH_CHECK_TYPE, CLOUDFORMATION_ROUTE53_HEALTH_CHECK_TYPE],
    load: loadStaticRoute53HealthChecks,
  },
  'aws-route53-records': {
    datasetKey: 'aws-route53-records',
    sourceKinds: ['terraform', 'cloudformation'],
    resourceTypes: [
      TERRAFORM_ROUTE53_RECORD_TYPE,
      CLOUDFORMATION_ROUTE53_RECORD_SET_TYPE,
      CLOUDFORMATION_ROUTE53_RECORD_SET_GROUP_TYPE,
    ],
    load: loadStaticRoute53Records,
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
