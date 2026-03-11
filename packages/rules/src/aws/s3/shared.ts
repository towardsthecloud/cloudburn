import { createFindingMatch } from '../../shared/helpers.js';
import type {
  AwsS3BucketAnalysis,
  AwsS3BucketAnalysisFlags,
  AwsStaticS3BucketAnalysis,
} from '../../shared/metadata.js';

/** Returns whether an S3 bucket should be flagged for missing lifecycle management. */
export const hasMissingLifecycleConfiguration = (bucket: AwsS3BucketAnalysisFlags): boolean =>
  !bucket.hasCostFocusedLifecycle;

/** Returns whether an S3 bucket should be flagged for missing storage-class optimization. */
export const hasMissingStorageClassOptimization = (bucket: AwsS3BucketAnalysisFlags): boolean =>
  bucket.hasLifecycleSignal &&
  !bucket.hasUnclassifiedTransition &&
  !bucket.hasIntelligentTieringConfiguration &&
  !bucket.hasIntelligentTieringTransition &&
  !bucket.hasAlternativeStorageClassTransition;

/** Creates a live finding target for a discovered S3 bucket analysis. */
export const createLiveS3BucketFindingMatch = (bucket: AwsS3BucketAnalysis) =>
  createFindingMatch(bucket.bucketName, bucket.region, bucket.accountId);

/** Creates a static finding target for an IaC S3 bucket analysis. */
export const createStaticS3BucketFindingMatch = (bucket: AwsStaticS3BucketAnalysis) =>
  createFindingMatch(bucket.resourceId, undefined, undefined, bucket.location);
