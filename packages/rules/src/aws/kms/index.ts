import { kmsKeyChurnRule } from './key-churn.js';
import { kmsKeyUnusedRule } from './key-unused.js';

/** Aggregate AWS KMS cost-optimization rule definitions. */
export const kmsRules = [kmsKeyChurnRule, kmsKeyUnusedRule];
