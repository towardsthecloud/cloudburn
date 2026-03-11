import { createFinding, createFindingMatch, createRule } from '../../shared/helpers.js';
import { analyzeS3Buckets } from './bucket-analysis.js';

const RULE_ID = 'CLDBRN-AWS-S3-1';
const RULE_SERVICE = 's3';
const RULE_MESSAGE = 'S3 buckets should define lifecycle management policies.';

/** Flag S3 buckets that lack an enabled lifecycle rule with transition or expiration behavior. */
export const s3MissingLifecycleConfigRule = createRule({
  id: RULE_ID,
  name: 'S3 Bucket Missing Lifecycle Configuration',
  description: 'Ensure S3 buckets define lifecycle management policies.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac'],
  evaluateStatic: ({ iacResources }) => {
    const findings = analyzeS3Buckets(iacResources)
      .filter((bucket) => !bucket.hasCostFocusedLifecycle)
      .map((bucket) => createFindingMatch(bucket.bucketResourceId, undefined, undefined, bucket.bucket.location));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
