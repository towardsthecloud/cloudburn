import { createFinding, createRule } from '../../shared/helpers.js';
import {
  createLiveS3BucketFindingMatch,
  createStaticS3BucketFindingMatch,
  hasMissingIncompleteMultipartUploadAbort,
} from './shared.js';

const RULE_ID = 'CLDBRN-AWS-S3-3';
const RULE_SERVICE = 's3';
const RULE_MESSAGE = 'S3 buckets should abort incomplete multipart uploads within 7 days.';

/** Flag S3 buckets that do not define an enabled multipart-abort lifecycle rule within 7 days. */
export const s3IncompleteMultipartUploadAbortRule = createRule({
  id: RULE_ID,
  name: 'S3 Incomplete Multipart Upload Abort Configuration',
  description:
    'Ensure S3 buckets define an enabled lifecycle rule that aborts incomplete multipart uploads within 7 days.',
  message: RULE_MESSAGE,
  provider: 'aws',
  service: RULE_SERVICE,
  supports: ['iac', 'discovery'],
  discoveryDependencies: ['aws-s3-bucket-analyses'],
  staticDependencies: ['aws-s3-bucket-analyses'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-s3-bucket-analyses')
      .filter((bucket) => hasMissingIncompleteMultipartUploadAbort(bucket))
      .map((bucket) => createLiveS3BucketFindingMatch(bucket));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-s3-bucket-analyses')
      .filter((bucket) => hasMissingIncompleteMultipartUploadAbort(bucket))
      .map((bucket) => createStaticS3BucketFindingMatch(bucket));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
