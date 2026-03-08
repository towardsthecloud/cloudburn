import { createRule } from '../../shared/helpers.js';

// Intent: placeholder rule scaffold for AWS Lambda architecture optimization checks.
// TODO(cloudburn): flag x86 functions where arm64 is viable.
export const lambdaCostOptimalArchitectureRule = createRule({
  id: 'CLDBRN-AWS-LAMBDA-1',
  name: 'Lambda Function Not Using Cost-Optimal Architecture',
  description: 'Recommend arm64 architecture when compatible.',
  message: 'Lambda functions should use the most cost-optimal architecture available.',
  provider: 'aws',
  service: 'lambda',
  supports: ['iac', 'discovery'],
});
