import { createRule } from '../../shared/helpers.js';

// Intent: placeholder rule scaffold for AWS RDS instance class policy checks.
// TODO(cloudburn): enforce profile-driven allow/deny rules for RDS classes.
export const rdsAllowedInstanceClassesRule = createRule({
  id: 'rds-allowed-instance-classes',
  name: 'RDS Allowed Instance Classes',
  description: 'Ensure RDS instance classes match allowed profile policy.',
  provider: 'aws',
  service: 'rds',
  severity: 'warning',
  supports: ['static', 'live'],
});
