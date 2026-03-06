import { lambdaCostOptimalArchitectureRule } from './cost-optimal-architecture.js';

// Intent: aggregate AWS Lambda rule definitions.
// TODO(cloudburn): add memory-rightsizing and idle-function checks.
export const lambdaRules = [lambdaCostOptimalArchitectureRule];
