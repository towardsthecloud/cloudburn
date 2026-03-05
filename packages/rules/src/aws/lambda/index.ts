import { lambdaMissingArmRule } from './missing-arm.js';

// Intent: aggregate AWS Lambda rule definitions.
// TODO(cloudburn): add memory-rightsizing and idle-function checks.
export const lambdaRules = [lambdaMissingArmRule];
