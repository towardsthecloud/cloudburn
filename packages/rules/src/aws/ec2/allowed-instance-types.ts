import { createRule } from '../../shared/helpers.js';

// Intent: placeholder rule scaffold for AWS EC2 instance type policy checks.
// TODO(cloudburn): evaluate allow/deny profile configuration for EC2 instance types.
export const ec2AllowedInstanceTypesRule = createRule({
  id: 'ec2-allowed-instance-types',
  name: 'EC2 Allowed Instance Types',
  description: 'Ensure EC2 instance types match allowed profile policy.',
  provider: 'aws',
  service: 'ec2',
  severity: 'warning',
  supports: ['static', 'live'],
});
