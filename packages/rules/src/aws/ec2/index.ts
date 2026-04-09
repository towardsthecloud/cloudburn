import { ec2DetailedMonitoringEnabledRule } from './detailed-monitoring-enabled.js';
import { ec2GravitonReviewRule } from './graviton-review.js';
import { ec2IdleNatGatewayRule } from './idle-nat-gateway.js';
import { ec2InactiveVpcInterfaceEndpointRule } from './inactive-vpc-interface-endpoint.js';
import { ec2LargeInstanceRule } from './large-instance.js';
import { ec2LongRunningInstanceRule } from './long-running-instance.js';
import { ec2LowUtilizationRule } from './low-utilization.js';
import { ec2PreferredInstanceTypeRule } from './preferred-instance-types.js';
import { ec2ReservedInstanceExpiringRule } from './reserved-instance-expiring.js';
import { ec2ReservedInstanceRecentlyExpiredRule } from './reserved-instance-recently-expired.js';
import { ec2S3InterfaceEndpointRule } from './s3-interface-endpoint.js';
import { ec2StoppedInstanceRule } from './stopped-instance.js';
import { ec2UnassociatedElasticIpRule } from './unassociated-elastic-ip.js';

/** Aggregate AWS EC2 rule definitions. */
export const ec2Rules = [
  ec2PreferredInstanceTypeRule,
  ec2S3InterfaceEndpointRule,
  ec2UnassociatedElasticIpRule,
  ec2InactiveVpcInterfaceEndpointRule,
  ec2LowUtilizationRule,
  ec2GravitonReviewRule,
  ec2ReservedInstanceExpiringRule,
  ec2LargeInstanceRule,
  ec2LongRunningInstanceRule,
  ec2DetailedMonitoringEnabledRule,
  ec2IdleNatGatewayRule,
  ec2ReservedInstanceRecentlyExpiredRule,
  ec2StoppedInstanceRule,
];
