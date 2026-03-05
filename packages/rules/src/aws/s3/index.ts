import { s3MissingLifecyclePolicyRule } from './missing-lifecycle-policy.js';

// Intent: aggregate AWS S3 rule definitions.
// TODO(cloudburn): add intelligent tiering and object age optimization checks.
export const s3Rules = [s3MissingLifecyclePolicyRule];
