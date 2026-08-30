import { lambdaCostOptimalArchitectureRule } from './cost-optimal-architecture.js';
import { lambdaExcessiveTimeoutRule } from './excessive-timeout.js';
import { lambdaHighErrorRateRule } from './high-error-rate.js';
import { lambdaMemoryOverprovisioningRule } from './memory-overprovisioning.js';

// Intent: aggregate AWS Lambda rule definitions.
export const lambdaRules = [
  lambdaCostOptimalArchitectureRule,
  lambdaHighErrorRateRule,
  lambdaExcessiveTimeoutRule,
  lambdaMemoryOverprovisioningRule,
];
