import { kmsKeyChurnRule } from './key-churn.js';

/** Aggregate AWS KMS cost-optimization rule definitions. */
export const kmsRules = [kmsKeyChurnRule];
