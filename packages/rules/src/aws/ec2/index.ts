import { ec2InactiveVpcInterfaceEndpointRule } from './inactive-vpc-interface-endpoint.js';
import { ec2LowUtilizationRule } from './low-utilization.js';
import { ec2PreferredInstanceTypeRule } from './preferred-instance-types.js';
import { ec2S3InterfaceEndpointRule } from './s3-interface-endpoint.js';
import { ec2UnassociatedElasticIpRule } from './unassociated-elastic-ip.js';

/** Aggregate AWS EC2 rule definitions. */
export const ec2Rules = [
  ec2PreferredInstanceTypeRule,
  ec2S3InterfaceEndpointRule,
  ec2UnassociatedElasticIpRule,
  ec2InactiveVpcInterfaceEndpointRule,
  ec2LowUtilizationRule,
];
