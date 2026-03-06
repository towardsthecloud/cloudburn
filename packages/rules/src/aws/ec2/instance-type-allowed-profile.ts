import { createRule } from '../../shared/helpers.js';

// Intent: placeholder rule scaffold for AWS EC2 instance type policy checks.
// TODO(cloudburn): evaluate allow/deny profile configuration for EC2 instance types.
export const ec2InstanceTypeAllowedProfileRule = createRule({
  id: 'CLDBRN-AWS-EC2-1',
  name: 'EC2 Instance Type Not in Allowed Profile',
  description: 'Ensure EC2 instance types match allowed profile policy.',
  provider: 'aws',
  service: 'ec2',
  supports: ['iac', 'discovery'],
});
