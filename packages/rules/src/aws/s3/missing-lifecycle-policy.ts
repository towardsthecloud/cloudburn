import { createRule } from '../../shared/helpers.js';

// Intent: placeholder rule scaffold for AWS S3 lifecycle policy checks.
// TODO(cloudburn): detect buckets without lifecycle transitions/expiration.
export const s3MissingLifecyclePolicyRule = createRule({
  id: 's3-missing-lifecycle-policy',
  name: 'S3 Missing Lifecycle Policy',
  description: 'Ensure S3 buckets define lifecycle management policies.',
  provider: 'aws',
  service: 's3',
  severity: 'warning',
  supports: ['static', 'live'],
});
