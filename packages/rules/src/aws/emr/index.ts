import { emrIdleClusterRule } from './idle-cluster.js';
import { emrPreviousGenerationInstanceTypeRule } from './previous-generation-instance-types.js';

/** Aggregate AWS EMR rule definitions. */
export const emrRules = [emrPreviousGenerationInstanceTypeRule, emrIdleClusterRule];
