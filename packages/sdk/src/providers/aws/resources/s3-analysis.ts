import type { AwsS3BucketAnalysisFlags } from '@cloudburn/rules';
import { isRecord } from '@cloudburn/rules';

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
  isRecord(rule.NoncurrentVersionExpiration) ||
  isRecord(rule.Expiration);

const getTerraformTransitions = (rule: Record<string, unknown>): Record<string, unknown>[] => [
  ...toRecordArray(rule.transition),
  ...toRecordArray(rule.noncurrent_version_transition),
];

const getCloudFormationTransitions = (rule: Record<string, unknown>): Record<string, unknown>[] => [
  ...toRecordArray(rule.Transitions),
  ...toRecordArray(rule.NoncurrentVersionTransitions),
];

const getLiteralStorageClass = (value: unknown): string | null =>
  typeof value === 'string' && !value.includes('${') ? value.toUpperCase() : null;

const getTransitionStorageClasses = (rule: Record<string, unknown>): string[] =>
  [...getTerraformTransitions(rule), ...getCloudFormationTransitions(rule)]
    .map((transition) => transition.storage_class ?? transition.StorageClass)
    .map((storageClass) => getLiteralStorageClass(storageClass))
    .filter((storageClass): storageClass is string => storageClass !== null);

const hasTransitionAction = (rule: Record<string, unknown>): boolean =>
  getTerraformTransitions(rule).length > 0 || getCloudFormationTransitions(rule).length > 0;

const getAbortIncompleteMultipartUploadDays = (rule: Record<string, unknown>): number | null => {
  const terraformAbortRule = toRecordArray(rule.abort_incomplete_multipart_upload)[0];
  const cloudFormationAbortRule = isRecord(rule.AbortIncompleteMultipartUpload)
    ? rule.AbortIncompleteMultipartUpload
    : null;
  const candidateValue = terraformAbortRule?.days_after_initiation ?? cloudFormationAbortRule?.DaysAfterInitiation;

  return typeof candidateValue === 'number' ? candidateValue : null;
};

const hasUnclassifiedTransition = (rule: Record<string, unknown>): boolean =>
  [...getTerraformTransitions(rule), ...getCloudFormationTransitions(rule)].some(
    (transition) => getLiteralStorageClass(transition.storage_class ?? transition.StorageClass) === null,
  );

const isLifecycleRuleEnabled = (rule: Record<string, unknown>): boolean =>
  rule.enabled === true || isEnabledStatus(rule.status) || isEnabledStatus(rule.Status);

const hasCostFocusedLifecycleRule = (rule: Record<string, unknown>): boolean => {
  if (!isLifecycleRuleEnabled(rule)) {
    return false;
  }

  return ruleHasTerraformExpiration(rule) || ruleHasCloudFormationExpiration(rule) || hasTransitionAction(rule);
};

const hasAbortIncompleteMultipartUploadAfter7Days = (rule: Record<string, unknown>): boolean => {
  if (!isLifecycleRuleEnabled(rule)) {
    return false;
  }

  const daysAfterInitiation = getAbortIncompleteMultipartUploadDays(rule);

  return daysAfterInitiation !== null && daysAfterInitiation <= 7;
};

const hasEnabledIntelligentTieringConfiguration = (configuration: Record<string, unknown>): boolean => {
  const status = configuration.status ?? configuration.Status;

  return status === undefined || isEnabledStatus(status);
};

/**
 * Builds normalized S3 cost-optimization analysis flags from lifecycle rules
 * and intelligent-tiering configuration records.
 *
 * @param lifecycleRules - Source-native lifecycle rules normalized to plain records.
 * @param intelligentTieringConfigurations - Source-native tiering configs normalized to plain records.
 * @returns Shared S3 analysis flags used by both static and discovery datasets.
 */
export const buildS3BucketAnalysisFlags = (
  lifecycleRules: Record<string, unknown>[],
  intelligentTieringConfigurations: Record<string, unknown>[] = [],
): AwsS3BucketAnalysisFlags => {
  const enabledLifecycleRules = lifecycleRules.filter((rule) => isLifecycleRuleEnabled(rule));
  const transitionStorageClasses = enabledLifecycleRules.flatMap((rule) => getTransitionStorageClasses(rule));

  return {
    hasLifecycleSignal: lifecycleRules.length > 0,
    hasCostFocusedLifecycle: lifecycleRules.some((rule) => hasCostFocusedLifecycleRule(rule)),
    hasAbortIncompleteMultipartUploadAfter7Days: lifecycleRules.some((rule) =>
      hasAbortIncompleteMultipartUploadAfter7Days(rule),
    ),
    hasIntelligentTieringConfiguration: intelligentTieringConfigurations.some((configuration) =>
      hasEnabledIntelligentTieringConfiguration(configuration),
    ),
    hasIntelligentTieringTransition: transitionStorageClasses.includes('INTELLIGENT_TIERING'),
    hasAlternativeStorageClassTransition: transitionStorageClasses.some(
      (storageClass) => storageClass !== 'STANDARD' && storageClass !== 'INTELLIGENT_TIERING',
    ),
    hasUnclassifiedTransition: enabledLifecycleRules.some((rule) => hasUnclassifiedTransition(rule)),
  };
};
