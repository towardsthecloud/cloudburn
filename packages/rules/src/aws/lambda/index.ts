import { lambdaCostOptimalArchitectureRule } from './cost-optimal-architecture.js';
import { lambdaExcessiveTimeoutRule } from './excessive-timeout.js';
import { lambdaHighErrorRateRule } from './high-error-rate.js';

// Intent: aggregate AWS Lambda rule definitions.
// TODO(cloudburn): add memory-rightsizing and idle-function checks.
export const lambdaRules = [lambdaCostOptimalArchitectureRule, lambdaHighErrorRateRule, lambdaExcessiveTimeoutRule];
