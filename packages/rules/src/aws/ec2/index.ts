import { ec2AllowedInstanceTypesRule } from './allowed-instance-types.js';

// Intent: aggregate AWS EC2 rule definitions.
// TODO(cloudburn): add additional EC2 optimization and utilization rules.
export const ec2Rules = [ec2AllowedInstanceTypesRule];
