import { s3IncompleteMultipartUploadAbortRule } from './incomplete-multipart-upload-abort.js';
import { s3MissingLifecycleConfigRule } from './missing-lifecycle-config.js';
import { s3StorageClassOptimizationRule } from './storage-class-optimization.js';
import { s3VersionedBucketNoncurrentVersionCleanupRule } from './versioned-bucket-noncurrent-version-cleanup.js';

/** Aggregate AWS S3 rule definitions. */
export const s3Rules = [
  s3MissingLifecycleConfigRule,
  s3StorageClassOptimizationRule,
  s3IncompleteMultipartUploadAbortRule,
  s3VersionedBucketNoncurrentVersionCleanupRule,
];
