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

/**
 * Returns whether an S3 bucket should be flagged for an Intelligent-Tiering recommendation.
 *
 * Buckets with any lifecycle signal stay with `CLDBRN-AWS-S3-2`, which reviews the storage-class
 * choice of lifecycle-managed buckets. This keeps the two storage-class rules disjoint.
 *
 * An Intelligent-Tiering configuration is treated as adoption intent, not as proof of tiering. AWS
 * only uses that configuration to move objects already stored in the Intelligent-Tiering storage
 * class into the Archive Access tiers, and objects enter the storage class through their upload
 * storage class or a lifecycle transition. Neither signal is visible per object in the bucket-level
 * datasets, so a bucket that declares an archive-tier configuration while still storing Standard
 * objects stays unflagged. Skipping keeps the rule quiet for owners who did adopt the storage class
 * directly, at the cost of that gap.
 */
export const shouldRecommendIntelligentTiering = (bucket: AwsS3BucketAnalysisFlags): boolean =>
  !bucket.hasLifecycleSignal && !bucket.hasIntelligentTieringConfiguration;

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
