import { s3MissingLifecycleConfigRule } from './missing-lifecycle-config.js';

// Intent: aggregate AWS S3 rule definitions.
// TODO(cloudburn): add intelligent tiering and object age optimization checks.
export const s3Rules = [s3MissingLifecycleConfigRule];
