import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import { analyzeS3Buckets } from './bucket-analysis.js';

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
  supports: ['iac'],
  evaluateStatic: ({ iacResources }) => {
    const findings = analyzeS3Buckets(iacResources)
      .filter((bucket) => bucket.hasLifecycleSignal || bucket.hasIntelligentTieringConfiguration)
      .filter(
        (bucket) =>
          !bucket.hasUnclassifiedTransition &&
          !bucket.hasIntelligentTieringConfiguration &&
          !bucket.hasIntelligentTieringTransition &&
          !bucket.hasAlternativeStorageClassTransition,
      )
      .map((bucket) => createFindingMatch(bucket.bucketResourceId, undefined, undefined, bucket.bucket.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
