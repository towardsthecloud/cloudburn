/** Resource namespaces for the supported Hub architecture migrations. */
export const gravitonResourceTypes = {
  Ec2Instance: 'ec2:instance',
  Ec2AutoScalingGroup: 'autoscaling:autoScalingGroup',
  RdsDbInstance: 'rds:db',
} as const;
