import { createRule } from '../../shared/helpers.js';

// Intent: placeholder rule scaffold for AWS RDS instance class policy checks.
// TODO(cloudburn): enforce profile-driven allow/deny rules for RDS classes.
export const rdsInstanceClassAllowedProfileRule = createRule({
  id: 'CLDBRN-AWS-RDS-1',
  name: 'RDS Instance Class Not in Allowed Profile',
  description: 'Ensure RDS instance classes match allowed profile policy.',
  message: 'RDS instances should use approved instance-class profiles.',
  provider: 'aws',
  service: 'rds',
  supports: ['iac', 'discovery'],
});
