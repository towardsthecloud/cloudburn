import { s3MissingLifecycleConfigRule } from './missing-lifecycle-config.js';
import { s3StorageClassOptimizationRule } from './storage-class-optimization.js';

/** Aggregate AWS S3 rule definitions. */
export const s3Rules = [s3MissingLifecycleConfigRule, s3StorageClassOptimizationRule];
