import { createRule } from '../../shared/helpers.js';

// Intent: placeholder rule scaffold for AWS Lambda architecture optimization checks.
// TODO(cloudburn): flag x86 functions where arm64 is viable.
export const lambdaMissingArmRule = createRule({
  id: 'lambda-missing-arm',
  name: 'Lambda Missing ARM',
  description: 'Recommend arm64 architecture when compatible.',
  provider: 'aws',
  service: 'lambda',
  severity: 'info',
  supports: ['static', 'live'],
});
