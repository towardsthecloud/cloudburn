import { createFinding, createRule } from '../../shared/helpers.js';
import {
  createLiveS3BucketFindingMatch,
  createStaticS3BucketFindingMatch,
  hasMissingLifecycleConfiguration,
} from './shared.js';

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
  supports: ['iac', 'discovery'],
  discoveryDependencies: ['aws-s3-bucket-analyses'],
  staticDependencies: ['aws-s3-bucket-analyses'],
  evaluateLive: ({ resources }) => {
    const findings = resources
      .get('aws-s3-bucket-analyses')
      .filter((bucket) => hasMissingLifecycleConfiguration(bucket))
      .map((bucket) => createLiveS3BucketFindingMatch(bucket));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'discovery', findings);
  },
  evaluateStatic: ({ resources }) => {
    const findings = resources
      .get('aws-s3-bucket-analyses')
      .filter((bucket) => hasMissingLifecycleConfiguration(bucket))
      .map((bucket) => createStaticS3BucketFindingMatch(bucket));

    return createFinding({ id: RULE_ID, service: RULE_SERVICE, message: RULE_MESSAGE }, 'iac', findings);
  },
});
