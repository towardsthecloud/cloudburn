import { isRecord } from '../../shared/helpers.js';
import type { IaCResource } from '../../shared/metadata.js';

const TERRAFORM_BUCKET_TYPE = 'aws_s3_bucket';
const TERRAFORM_LIFECYCLE_TYPE = 'aws_s3_bucket_lifecycle_configuration';
const TERRAFORM_INTELLIGENT_TIERING_TYPE = 'aws_s3_bucket_intelligent_tiering_configuration';
const CLOUDFORMATION_BUCKET_TYPE = 'AWS::S3::Bucket';
const DIRECT_BUCKET_REFERENCE_PATTERN = /^\$?\{?aws_s3_bucket\.([A-Za-z0-9_-]+)\.(?:id|bucket)\}?$/u;

/**
 * Aggregated S3 bucket policy signals derived from static IaC resources.
 *
 * `bucketResourceId` is the stable identifier used in findings, while the
 * boolean flags let S3 rules express policy checks without re-parsing raw IaC.
 */
export type S3BucketAnalysis = {
  bucket: IaCResource;
  bucketResourceId: string;
  hasLifecycleSignal: boolean;
  hasCostFocusedLifecycle: boolean;
  hasIntelligentTieringConfiguration: boolean;
  hasIntelligentTieringTransition: boolean;
  hasAlternativeStorageClassTransition: boolean;
  hasUnclassifiedTransition: boolean;
};

const getLiteralString = (value: unknown): string | null =>
  typeof value === 'string' && !value.includes('${') ? value : null;

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

const isEnabledStatus = (value: unknown): boolean => typeof value === 'string' && value.toLowerCase() === 'enabled';

const toRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => isRecord(entry)) : [];

const hasNonEmptyRecordArray = (value: unknown): boolean => toRecordArray(value).length > 0;

const hasScalarValue = (value: unknown): boolean => value !== undefined && value !== null;

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

const getTerraformTransitionStorageClasses = (rule: Record<string, unknown>): string[] =>
  getTerraformTransitions(rule)
    .map((transition) => getLiteralString(transition.storage_class))
    .filter((storageClass): storageClass is string => Boolean(storageClass))
    .map((storageClass) => storageClass.toUpperCase());

const getCloudFormationTransitionStorageClasses = (rule: Record<string, unknown>): string[] =>
  getCloudFormationTransitions(rule)
    .map((transition) => getLiteralString(transition.StorageClass))
    .filter((storageClass): storageClass is string => Boolean(storageClass))
    .map((storageClass) => storageClass.toUpperCase());

const getTransitionStorageClasses = (rule: Record<string, unknown>): string[] => [
  ...getTerraformTransitionStorageClasses(rule),
  ...getCloudFormationTransitionStorageClasses(rule),
];

const hasTransitionAction = (rule: Record<string, unknown>): boolean =>
  getTerraformTransitions(rule).length > 0 || getCloudFormationTransitions(rule).length > 0;

const hasUnclassifiedTransition = (rule: Record<string, unknown>): boolean =>
  [...getTerraformTransitions(rule), ...getCloudFormationTransitions(rule)].some((transition) => {
    const terraformStorageClass = transition.storage_class;
    const cloudFormationStorageClass = transition.StorageClass;

    return getLiteralString(terraformStorageClass ?? cloudFormationStorageClass) === null;
  });

const isLifecycleRuleEnabled = (rule: Record<string, unknown>): boolean =>
  rule.enabled === true || isEnabledStatus(rule.status) || isEnabledStatus(rule.Status);

const hasCostFocusedLifecycleRule = (rule: Record<string, unknown>): boolean => {
  if (!isLifecycleRuleEnabled(rule)) {
    return false;
  }

  return ruleHasTerraformExpiration(rule) || ruleHasCloudFormationExpiration(rule) || hasTransitionAction(rule);
};

const getTerraformInlineLifecycleRules = (bucket: IaCResource): Record<string, unknown>[] =>
  toRecordArray(bucket.attributes.lifecycle_rule);

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

const createTerraformBucketAnalysis = (
  bucket: IaCResource,
  lifecycleConfigurations: IaCResource[],
  intelligentTieringConfigurations: IaCResource[],
): S3BucketAnalysis | null => {
  const literalBucketName = getLiteralString(bucket.attributes.bucket);
  const identityKeys = new Set<string>([`${TERRAFORM_BUCKET_TYPE}.${bucket.name}`]);

  if (literalBucketName) {
    identityKeys.add(literalBucketName);
  }

  const lifecycleRules = [
    ...getTerraformInlineLifecycleRules(bucket),
    ...getTerraformLifecycleRules(lifecycleConfigurations, identityKeys),
  ];
  const transitionStorageClasses = lifecycleRules
    .filter((rule) => isLifecycleRuleEnabled(rule))
    .flatMap((rule) => getTransitionStorageClasses(rule));
  const hasUnclassifiedLifecycleTransition = lifecycleRules
    .filter((rule) => isLifecycleRuleEnabled(rule))
    .some((rule) => hasUnclassifiedTransition(rule));

  return {
    bucket,
    bucketResourceId: `${bucket.type}.${bucket.name}`,
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
    hasUnclassifiedTransition: hasUnclassifiedLifecycleTransition,
  };
};

const createCloudFormationBucketAnalysis = (bucket: IaCResource): S3BucketAnalysis => {
  const properties = isRecord(bucket.attributes.Properties) ? bucket.attributes.Properties : undefined;
  const lifecycleConfiguration = isRecord(properties?.LifecycleConfiguration)
    ? properties.LifecycleConfiguration
    : undefined;
  const lifecycleRules = toRecordArray(lifecycleConfiguration?.Rules);
  const transitionStorageClasses = lifecycleRules
    .filter((rule) => isLifecycleRuleEnabled(rule))
    .flatMap((rule) => getTransitionStorageClasses(rule));
  const hasUnclassifiedLifecycleTransition = lifecycleRules
    .filter((rule) => isLifecycleRuleEnabled(rule))
    .some((rule) => hasUnclassifiedTransition(rule));

  return {
    bucket,
    bucketResourceId: bucket.name,
    hasLifecycleSignal: lifecycleRules.length > 0,
    hasCostFocusedLifecycle: lifecycleRules.some((rule) => hasCostFocusedLifecycleRule(rule)),
    hasIntelligentTieringConfiguration: hasEnabledCloudFormationIntelligentTieringConfiguration(bucket),
    hasIntelligentTieringTransition: transitionStorageClasses.includes('INTELLIGENT_TIERING'),
    hasAlternativeStorageClassTransition: transitionStorageClasses.some(
      (storageClass) => storageClass !== 'STANDARD' && storageClass !== 'INTELLIGENT_TIERING',
    ),
    hasUnclassifiedTransition: hasUnclassifiedLifecycleTransition,
  };
};

/**
 * Builds normalized S3 bucket analyses from Terraform and CloudFormation IaC resources.
 *
 * Buckets with unresolved Terraform identities are skipped to avoid false
 * positives when bucket names are still computed.
 *
 * @param iacResources - Mixed static IaC resources from Terraform and CloudFormation.
 * @returns One analysis record per safely-resolved bucket resource.
 */
export const analyzeS3Buckets = (iacResources: IaCResource[]): S3BucketAnalysis[] => {
  const lifecycleConfigurations = iacResources.filter(
    (resource) => resource.provider === 'aws' && resource.type === TERRAFORM_LIFECYCLE_TYPE,
  );
  const intelligentTieringConfigurations = iacResources.filter(
    (resource) => resource.provider === 'aws' && resource.type === TERRAFORM_INTELLIGENT_TIERING_TYPE,
  );

  return iacResources.flatMap((resource) => {
    if (resource.provider !== 'aws') {
      return [];
    }

    if (resource.type === TERRAFORM_BUCKET_TYPE) {
      const analysis = createTerraformBucketAnalysis(
        resource,
        lifecycleConfigurations,
        intelligentTieringConfigurations,
      );

      return analysis ? [analysis] : [];
    }

    if (resource.type === CLOUDFORMATION_BUCKET_TYPE) {
      return [createCloudFormationBucketAnalysis(resource)];
    }

    return [];
  });
};
