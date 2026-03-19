import { describe, expect, it } from 'vitest';
import { awsRules } from '../src/index.js';

const RULE_ID_PATTERN = /^CLDBRN-([A-Z0-9]+)-([A-Z0-9]+)-(\d+)$/;

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

  it('uses unique contiguous rule numbers per provider and service', () => {
    const seenRuleIds = new Set<string>();
    const numbersByScope = new Map<string, number[]>();

    for (const rule of awsRules) {
      expect(seenRuleIds.has(rule.id)).toBe(false);
      seenRuleIds.add(rule.id);

      const match = RULE_ID_PATTERN.exec(rule.id);

      expect(match).not.toBeNull();

      const [, provider, service, suffix] = match ?? [];
      const scopeKey = `${provider}-${service}`;
      const ruleNumbers = numbersByScope.get(scopeKey) ?? [];

      ruleNumbers.push(Number.parseInt(suffix, 10));
      numbersByScope.set(scopeKey, ruleNumbers);
    }

    for (const ruleNumbers of numbersByScope.values()) {
      const sortedRuleNumbers = [...ruleNumbers].sort((left, right) => left - right);

      expect(sortedRuleNumbers).toEqual(Array.from({ length: sortedRuleNumbers.length }, (_, index) => index + 1));
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
      description:
        'Flag CloudWatch log streams that have never received events or whose last ingestion was more than 90 days ago outside delivery-managed log groups.',
      message:
        'CloudWatch log streams that have never received events or have been inactive for more than 90 days should be removed.',
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

  it('defines the expected ElastiCache reserved-coverage rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ELASTICACHE-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ELASTICACHE-1',
      name: 'ElastiCache Cluster Missing Reserved Coverage',
      description: 'Flag long-running ElastiCache clusters that do not have matching active reserved-node coverage.',
      message: 'Long-running ElastiCache clusters should have reserved node coverage.',
      provider: 'aws',
      service: 'elasticache',
      supports: ['discovery'],
      discoveryDependencies: ['aws-elasticache-clusters', 'aws-elasticache-reserved-nodes'],
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

  it('defines the expected EMR previous-generation-instance-types rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EMR-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EMR-1',
      name: 'EMR Cluster Previous Generation Instance Types',
      description: 'Flag EMR clusters that still use previous-generation EC2 instance types.',
      message: 'EMR clusters using previous-generation instance types should be reviewed.',
      provider: 'aws',
      service: 'emr',
      supports: ['discovery'],
      discoveryDependencies: ['aws-emr-clusters'],
    });
  });

  it('defines the expected EMR idle-cluster rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EMR-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EMR-2',
      name: 'EMR Cluster Idle',
      description: 'Flag active EMR clusters whose `IsIdle` metric stays true for at least 30 minutes.',
      message: 'EMR clusters idle for more than 30 minutes should be reviewed.',
      provider: 'aws',
      service: 'emr',
      supports: ['discovery'],
      discoveryDependencies: ['aws-emr-clusters', 'aws-emr-cluster-metrics'],
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
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-6');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-6',
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

  it('defines the expected ECS Graviton review rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ECS-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ECS-1',
      name: 'ECS Container Instance Without Graviton',
      description:
        'Flag ECS container instances backed by EC2 instance types that still run on non-Graviton families when a clear Arm-based equivalent exists.',
      message: 'ECS container instances without a Graviton equivalent in use should be reviewed.',
      provider: 'aws',
      service: 'ecs',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ecs-container-instances'],
    });
  });

  it('defines the expected ECS low-cpu-utilization rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ECS-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ECS-2',
      name: 'ECS Cluster Low CPU Utilization',
      description: 'Flag ECS clusters whose average CPU utilization stays below 10% over the previous 14 days.',
      message: 'ECS clusters should be reviewed when average CPU utilization stays below 10% for the previous 14 days.',
      provider: 'aws',
      service: 'ecs',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ecs-clusters', 'aws-ecs-cluster-metrics'],
    });
  });

  it('defines the expected ECS autoscaling-policy rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ECS-3');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ECS-3',
      name: 'ECS Service Missing Autoscaling Policy',
      description:
        'Flag active REPLICA ECS services that do not have an Application Auto Scaling target and scaling policy.',
      message: 'Active REPLICA ECS services should use an autoscaling policy.',
      provider: 'aws',
      service: 'ecs',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ecs-services', 'aws-ecs-autoscaling'],
    });
  });

  it('defines the expected EKS Graviton review rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EKS-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EKS-1',
      name: 'EKS Node Group Without Graviton',
      description:
        'Flag EKS node groups that still use non-Graviton instance families when a clear Arm-based equivalent exists.',
      message: 'EKS node groups without a Graviton equivalent in use should be reviewed.',
      provider: 'aws',
      service: 'eks',
      supports: ['discovery'],
      discoveryDependencies: ['aws-eks-nodegroups'],
    });
  });

  it('defines the expected EC2 reserved-instance-expiring rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-7');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-7',
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
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-8');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-8',
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
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-9');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-9',
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

  it('defines the expected Redshift low-cpu rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-REDSHIFT-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-REDSHIFT-1',
      name: 'Redshift Cluster Low CPU Utilization',
      description: 'Flag available Redshift clusters whose 14-day average CPU stays at or below 10%.',
      message: 'Redshift clusters with low CPU utilization should be reviewed.',
      provider: 'aws',
      service: 'redshift',
      supports: ['discovery'],
      discoveryDependencies: ['aws-redshift-clusters', 'aws-redshift-cluster-metrics'],
    });
  });

  it('defines the expected Redshift reserved-coverage rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-REDSHIFT-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-REDSHIFT-2',
      name: 'Redshift Cluster Missing Reserved Coverage',
      description: 'Flag long-running Redshift clusters that do not have matching active reserved-node coverage.',
      message: 'Long-running Redshift clusters should have reserved node coverage.',
      provider: 'aws',
      service: 'redshift',
      supports: ['discovery'],
      discoveryDependencies: ['aws-redshift-clusters', 'aws-redshift-reserved-nodes'],
    });
  });

  it('defines the expected Redshift pause-resume rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-REDSHIFT-3');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-REDSHIFT-3',
      name: 'Redshift Cluster Pause Resume Not Enabled',
      description: 'Flag eligible Redshift clusters that do not have both pause and resume schedules configured.',
      message: 'Redshift clusters should enable both pause and resume schedules when eligible.',
      provider: 'aws',
      service: 'redshift',
      supports: ['discovery'],
      discoveryDependencies: ['aws-redshift-clusters'],
    });
  });
});
