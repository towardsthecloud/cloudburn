import { ec2PreferredInstanceTypeRule } from './preferred-instance-types.js';
import { ec2S3InterfaceEndpointRule } from './s3-interface-endpoint.js';

/** Aggregate AWS EC2 rule definitions. */
export const ec2Rules = [ec2PreferredInstanceTypeRule, ec2S3InterfaceEndpointRule];
