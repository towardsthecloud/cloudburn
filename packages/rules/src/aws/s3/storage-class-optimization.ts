import { createFinding, createRule } from '../../shared/helpers.js';
import {
  createLiveS3BucketFindingMatch,
  createStaticS3BucketFindingMatch,
  hasMissingStorageClassOptimization,
} from './shared.js';

const RULE_ID = 'CLDBRN-AWS-S3-2';
const RULE_SERVICE = 's3';
const RULE_MESSAGE =
  'S3 buckets with lifecycle management should match object access patterns to the right storage class.';

/** Flag lifecycle-managed S3 buckets that keep data on Standard without explicit storage-class optimization. */
export const s3StorageClassOptimizationRule = createRule({
  id: RULE_ID,
  name: 'S3 Bucket Storage Class Not Optimized',
  description:
    'Recommend Intelligent-Tiering or another explicit storage-class transition for lifecycle-managed buckets.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac', 'discovery'],
  discoveryDependencies: ['aws-s3-bucket-analyses'],
  staticDependencies: ['aws-s3-bucket-analyses'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-s3-bucket-analyses')
      .filter((bucket) => hasMissingStorageClassOptimization(bucket))
      .map((bucket) => createLiveS3BucketFindingMatch(bucket));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-s3-bucket-analyses')
      .filter((bucket) => hasMissingStorageClassOptimization(bucket))
      .map((bucket) => createStaticS3BucketFindingMatch(bucket));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
