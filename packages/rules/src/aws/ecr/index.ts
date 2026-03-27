import { ecrMissingLifecyclePolicyRule } from './missing-lifecycle-policy.js';
import { ecrMissingTaggedImageRetentionCapRule } from './missing-tagged-image-retention-cap.js';
import { ecrMissingUntaggedImageExpiryRule } from './missing-untagged-image-expiry.js';

/** Aggregate AWS ECR rule definitions. */
export const ecrRules = [
  ecrMissingLifecyclePolicyRule,
  ecrMissingUntaggedImageExpiryRule,
  ecrMissingTaggedImageRetentionCapRule,
];
