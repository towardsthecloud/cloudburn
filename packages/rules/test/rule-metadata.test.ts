import { describe, expect, it } from 'vitest';
import { awsRules } from '../src/index.js';

describe('rule metadata', () => {
  it('ensures every aws rule has mandatory metadata fields', () => {
    for (const rule of awsRules) {
      expect(rule.id.length).toBeGreaterThan(0);
      expect(rule.name.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(0);
      expect(rule.message.length).toBeGreaterThan(0);
      expect(rule.supports.length).toBeGreaterThan(0);

      if (rule.supports.includes('discovery') && rule.evaluateLive) {
        expect(rule.discoveryDependencies).toBeDefined();
        expect(rule.discoveryDependencies?.length).toBeGreaterThan(0);
      }

      if (rule.supports.includes('iac') && rule.evaluateStatic) {
        expect(rule.staticDependencies).toBeDefined();
        expect(rule.staticDependencies?.length).toBeGreaterThan(0);
      }
    }
  });

  it('defines the expected EC2 preferred-instance rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-1',
      name: 'EC2 Instance Type Not Preferred',
      description: 'Flag direct EC2 instances that do not use curated preferred instance types.',
      message: 'EC2 instances should use preferred instance types.',
      provider: 'aws',
      service: 'ec2',
      supports: ['iac', 'discovery'],
      discoveryDependencies: ['aws-ec2-instances'],
      staticDependencies: ['aws-ec2-instances'],
    });
  });

  it('defines the expected CloudTrail redundant-global-trails rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-CLOUDTRAIL-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-CLOUDTRAIL-1',
      name: 'CloudTrail Redundant Global Trails',
      description: 'Flag redundant multi-region CloudTrail trails when more than one trail covers the same account.',
      message: 'AWS accounts should keep only one multi-region CloudTrail trail unless redundancy is intentional.',
      provider: 'aws',
      service: 'cloudtrail',
      supports: ['discovery'],
      discoveryDependencies: ['aws-cloudtrail-trails'],
    });
  });

  it('defines the expected CloudTrail redundant-regional-trails rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-CLOUDTRAIL-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-CLOUDTRAIL-2',
      name: 'CloudTrail Redundant Regional Trails',
      description: 'Flag redundant single-region CloudTrail trails when more than one trail covers the same region.',
      message: 'AWS regions should keep only one single-region CloudTrail trail unless redundancy is intentional.',
      provider: 'aws',
      service: 'cloudtrail',
      supports: ['discovery'],
      discoveryDependencies: ['aws-cloudtrail-trails'],
    });
  });

  it('defines the expected CloudWatch log-group-retention rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-CLOUDWATCH-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-CLOUDWATCH-1',
      name: 'CloudWatch Log Group Missing Retention',
      description: 'Flag CloudWatch log groups that do not define retention and are not delivery-managed.',
      message: 'CloudWatch log groups should define a retention policy unless AWS manages lifecycle automatically.',
      provider: 'aws',
      service: 'cloudwatch',
      supports: ['discovery'],
      discoveryDependencies: ['aws-cloudwatch-log-groups'],
    });
  });

  it('defines the expected CloudWatch unused-log-streams rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-CLOUDWATCH-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-CLOUDWATCH-2',
      name: 'CloudWatch Unused Log Streams',
      description: 'Flag CloudWatch log streams that have never received events outside delivery-managed log groups.',
      message: 'CloudWatch log streams that have never received events should be removed.',
      provider: 'aws',
      service: 'cloudwatch',
      supports: ['discovery'],
      discoveryDependencies: ['aws-cloudwatch-log-groups', 'aws-cloudwatch-log-streams'],
    });
  });

  it('defines the expected S3 lifecycle rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-S3-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-S3-1',
      name: 'S3 Bucket Missing Lifecycle Configuration',
      description: 'Ensure S3 buckets define lifecycle management policies.',
      message: 'S3 buckets should define lifecycle management policies.',
      provider: 'aws',
      service: 's3',
      supports: ['iac', 'discovery'],
      discoveryDependencies: ['aws-s3-bucket-analyses'],
      staticDependencies: ['aws-s3-bucket-analyses'],
    });
  });

  it('defines the expected RDS preferred-instance-class rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-RDS-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-RDS-1',
      name: 'RDS Instance Class Not Preferred',
      description: 'Flag RDS DB instances that do not use curated preferred instance classes.',
      message: 'RDS DB instances should use preferred instance classes.',
      provider: 'aws',
      service: 'rds',
      supports: ['iac', 'discovery'],
      discoveryDependencies: ['aws-rds-instances'],
      staticDependencies: ['aws-rds-instances'],
    });
  });

  it('defines the expected S3 storage-class rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-S3-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-S3-2',
      name: 'S3 Bucket Storage Class Not Optimized',
      description:
        'Recommend Intelligent-Tiering or another explicit storage-class transition for lifecycle-managed buckets.',
      message: 'S3 buckets with lifecycle management should match object access patterns to the right storage class.',
      provider: 'aws',
      service: 's3',
      supports: ['iac', 'discovery'],
      discoveryDependencies: ['aws-s3-bucket-analyses'],
      staticDependencies: ['aws-s3-bucket-analyses'],
    });
  });

  it('defines the expected EC2 S3 endpoint rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-2',
      name: 'S3 Interface VPC Endpoint Used',
      description: 'Flag S3 interface endpoints when a gateway endpoint is the cheaper in-VPC option.',
      message: 'S3 access inside a VPC should prefer gateway endpoints over interface endpoints when possible.',
      provider: 'aws',
      service: 'ec2',
      supports: ['iac'],
      staticDependencies: ['aws-ec2-vpc-endpoints'],
    });
  });

  it('defines the expected ECR lifecycle-policy rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ECR-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ECR-1',
      name: 'ECR Repository Missing Lifecycle Policy',
      description: 'Flag ECR repositories that do not define a lifecycle policy.',
      message: 'ECR repositories should define lifecycle policies.',
      provider: 'aws',
      service: 'ecr',
      supports: ['iac', 'discovery'],
      discoveryDependencies: ['aws-ecr-repositories'],
      staticDependencies: ['aws-ecr-repositories'],
    });
  });

  it('defines the expected EBS current-generation rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EBS-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EBS-1',
      name: 'EBS Volume Type Not Current Generation',
      description:
        'Flag EBS volumes using previous-generation storage types when a current-generation replacement exists.',
      message: 'EBS volumes should use current-generation storage.',
      provider: 'aws',
      service: 'ebs',
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-ebs-volumes'],
      staticDependencies: ['aws-ebs-volumes'],
    });
  });

  it('defines the expected EBS unattached-volume rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EBS-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EBS-2',
      name: 'EBS Volume Unattached',
      description: 'Flag EBS volumes that are not attached to any EC2 instance.',
      message: 'EBS volumes should not remain unattached.',
      provider: 'aws',
      service: 'ebs',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ebs-volumes'],
    });
  });

  it('defines the expected EBS stopped-instance-attachment rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EBS-3');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EBS-3',
      name: 'EBS Volume Attached To Stopped Instances',
      description: 'Flag EBS volumes whose attached EC2 instances are all in the stopped state.',
      message: 'EBS volumes attached only to stopped EC2 instances should be reviewed.',
      provider: 'aws',
      service: 'ebs',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ebs-volumes', 'aws-ec2-instances'],
    });
  });

  it('defines the expected EC2 unassociated-elastic-ip rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-3');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-3',
      name: 'Elastic IP Address Unassociated',
      description: 'Flag Elastic IP allocations that are not associated with an EC2 resource.',
      message: 'Elastic IP addresses should not remain unassociated.',
      provider: 'aws',
      service: 'ec2',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ec2-elastic-ips'],
    });
  });

  it('defines the expected EC2 inactive-vpc-interface-endpoint rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-4');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-4',
      name: 'VPC Interface Endpoint Inactive',
      description: 'Flag interface VPC endpoints that have processed no traffic in the last 30 days.',
      message: 'Interface VPC endpoints should process traffic or be removed.',
      provider: 'aws',
      service: 'ec2',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ec2-vpc-endpoint-activity'],
    });
  });

  it('defines the expected EC2 low-utilization rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-5');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-5',
      name: 'EC2 Instance Low Utilization',
      description:
        'Flag EC2 instances whose CPU and network usage stay below the low-utilization threshold for at least 4 of the previous 14 days.',
      message: 'EC2 instances should not remain low utilization for 4 or more of the previous 14 days.',
      provider: 'aws',
      service: 'ec2',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ec2-instance-utilization'],
    });
  });

  it('defines the expected EC2 Graviton review rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-9');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-9',
      name: 'EC2 Instance Without Graviton',
      description:
        'Flag EC2 instances that still run on non-Graviton families when a clear Arm-based equivalent exists.',
      message: 'EC2 instances without a Graviton equivalent in use should be reviewed.',
      provider: 'aws',
      service: 'ec2',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ec2-instances'],
    });
  });

  it('defines the expected EC2 reserved-instance-expiring rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-10');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-10',
      name: 'EC2 Reserved Instance Expiring',
      description: 'Flag active EC2 reserved instances whose end date is within the next 60 days.',
      message: 'EC2 reserved instances expiring within 60 days should be reviewed.',
      provider: 'aws',
      service: 'ec2',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ec2-reserved-instances'],
    });
  });

  it('defines the expected EC2 large-instance rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-11');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-11',
      name: 'EC2 Instance Large Size',
      description: 'Flag EC2 instances that are sized at 2xlarge or above so they can be right-sized intentionally.',
      message: 'EC2 large instances of 2xlarge or greater should be reviewed.',
      provider: 'aws',
      service: 'ec2',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ec2-instances'],
    });
  });

  it('defines the expected EC2 long-running rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-12');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-12',
      name: 'EC2 Instance Long Running',
      description: 'Flag EC2 instances whose launch time is at least 180 days old.',
      message: 'EC2 instances running for 180 days or longer should be reviewed.',
      provider: 'aws',
      service: 'ec2',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ec2-instances'],
    });
  });

  it('defines the expected ELB ALB-without-targets rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ELB-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ELB-1',
      name: 'Application Load Balancer Without Targets',
      description: 'Flag Application Load Balancers that have no attached target groups or no registered targets.',
      message: 'Application Load Balancers with no registered targets should be deleted.',
      provider: 'aws',
      service: 'elb',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ec2-load-balancers', 'aws-ec2-target-groups'],
    });
  });

  it('defines the expected ELB classic-without-instances rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ELB-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ELB-2',
      name: 'Classic Load Balancer Without Instances',
      description: 'Flag Classic Load Balancers that have zero attached instances.',
      message: 'Classic Load Balancers with no attached instances should be deleted.',
      provider: 'aws',
      service: 'elb',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ec2-load-balancers'],
    });
  });

  it('defines the expected ELB gateway-without-targets rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ELB-3');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ELB-3',
      name: 'Gateway Load Balancer Without Targets',
      description: 'Flag Gateway Load Balancers that have no attached target groups or no registered targets.',
      message: 'Gateway Load Balancers with no registered targets should be deleted.',
      provider: 'aws',
      service: 'elb',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ec2-load-balancers', 'aws-ec2-target-groups'],
    });
  });

  it('defines the expected RDS idle-instance rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-RDS-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-RDS-2',
      name: 'RDS DB Instance Idle',
      description: 'Flag RDS DB instances that have no database connections in the last 7 days.',
      message: 'RDS DB instances should not remain idle for 7 days.',
      provider: 'aws',
      service: 'rds',
      supports: ['discovery'],
      discoveryDependencies: ['aws-rds-instance-activity'],
    });
  });
});
