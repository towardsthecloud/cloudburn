import { createFindingMatch } from '../../shared/helpers.js';
import type {
  AwsS3BucketAnalysis,
  AwsS3BucketAnalysisFlags,
  AwsStaticS3BucketAnalysis,
} from '../../shared/metadata.js';

/** Returns whether an S3 bucket should be flagged for missing lifecycle management. */
export const hasMissingLifecycleConfiguration = (bucket: AwsS3BucketAnalysisFlags): boolean =>
  !bucket.hasCostFocusedLifecycle;

/** Returns whether an S3 bucket should be flagged for missing multipart-abort cleanup. */
export const hasMissingIncompleteMultipartUploadAbort = (bucket: AwsS3BucketAnalysisFlags): boolean =>
  !bucket.hasAbortIncompleteMultipartUploadAfter7Days;

/** Returns whether an S3 bucket should be flagged for missing storage-class optimization. */
export const hasMissingStorageClassOptimization = (bucket: AwsS3BucketAnalysisFlags): boolean =>
  bucket.hasLifecycleSignal &&
  !bucket.hasUnclassifiedTransition &&
  !bucket.hasIntelligentTieringConfiguration &&
  !bucket.hasIntelligentTieringTransition &&
  !bucket.hasAlternativeStorageClassTransition;

/** Returns whether a versioned S3 bucket should be flagged for missing noncurrent-version cleanup. */
export const hasMissingNoncurrentVersionCleanup = (
  bucket: Pick<AwsStaticS3BucketAnalysis, 'versioningEnabled' | 'hasNoncurrentVersionCleanup'>,
): boolean => bucket.versioningEnabled === true && bucket.hasNoncurrentVersionCleanup !== true;

/** Creates a live finding target for a discovered S3 bucket analysis. */
export const createLiveS3BucketFindingMatch = (bucket: AwsS3BucketAnalysis) =>
  createFindingMatch(bucket.bucketName, bucket.region, bucket.accountId);

/** Creates a static finding target for an IaC S3 bucket analysis. */
export const createStaticS3BucketFindingMatch = (bucket: AwsStaticS3BucketAnalysis) =>
  createFindingMatch(bucket.resourceId, undefined, undefined, bucket.location);
