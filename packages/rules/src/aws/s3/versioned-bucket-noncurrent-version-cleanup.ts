import { createFinding, createRule } from '../../shared/helpers.js';
import { createStaticS3BucketFindingMatch, hasMissingNoncurrentVersionCleanup } from './shared.js';

const RULE_ID = 'CLDBRN-AWS-S3-4';
const RULE_SERVICE = 's3';
const RULE_MESSAGE = 'Versioned S3 buckets should define noncurrent-version cleanup.';

/** Flag versioned S3 buckets that define no noncurrent-version expiration or transition cleanup. */
export const s3VersionedBucketNoncurrentVersionCleanupRule = createRule({
  id: RULE_ID,
  name: 'S3 Versioned Bucket Missing Noncurrent Version Cleanup',
  description:
    'Flag versioned S3 buckets that do not define noncurrent-version expiration or transition lifecycle cleanup.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac'],
  staticDependencies: ['aws-s3-bucket-analyses'],
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-s3-bucket-analyses')
      .filter((bucket) => hasMissingNoncurrentVersionCleanup(bucket))
      .map((bucket) => createStaticS3BucketFindingMatch(bucket));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
