import { createRule } from '../../shared/helpers.js';

// Intent: placeholder rule scaffold for AWS S3 lifecycle policy checks.
// TODO(cloudburn): detect buckets without lifecycle transitions/expiration.
export const s3MissingLifecycleConfigRule = createRule({
  id: 'CLDBRN-AWS-S3-1',
  name: 'S3 Bucket Missing Lifecycle Configuration',
  description: 'Ensure S3 buckets define lifecycle management policies.',
  provider: 'aws',
  service: 's3',
  supports: ['iac', 'discovery'],
});
