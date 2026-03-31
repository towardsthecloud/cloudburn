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
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-cloudwatch-log-groups'],
      staticDependencies: ['aws-cloudwatch-log-groups'],
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

  it('defines the expected CloudWatch no-metric-filters rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-CLOUDWATCH-3');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-CLOUDWATCH-3',
      name: 'CloudWatch Log Group No Metric Filters',
      description: 'Flag CloudWatch log groups storing at least 1 GB when they define no metric filters.',
      message:
        'CloudWatch log groups storing at least 1 GB should define metric filters or reduce retention aggressively.',
      provider: 'aws',
      service: 'cloudwatch',
      supports: ['discovery'],
      discoveryDependencies: ['aws-cloudwatch-log-groups', 'aws-cloudwatch-log-metric-filter-coverage'],
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

  it('defines the expected S3 multipart-abort rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-S3-3');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-S3-3',
      name: 'S3 Incomplete Multipart Upload Abort Configuration',
      description:
        'Ensure S3 buckets define an enabled lifecycle rule that aborts incomplete multipart uploads within 7 days.',
      message: 'S3 buckets should abort incomplete multipart uploads within 7 days.',
      provider: 'aws',
      service: 's3',
      supports: ['iac', 'discovery'],
      discoveryDependencies: ['aws-s3-bucket-analyses'],
      staticDependencies: ['aws-s3-bucket-analyses'],
    });
  });

  it('defines the expected S3 noncurrent-version-cleanup rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-S3-4');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-S3-4',
      name: 'S3 Versioned Bucket Missing Noncurrent Version Cleanup',
      description:
        'Flag versioned S3 buckets that do not define noncurrent-version expiration or transition lifecycle cleanup.',
      message: 'Versioned S3 buckets should define noncurrent-version cleanup.',
      provider: 'aws',
      service: 's3',
      supports: ['iac'],
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

  it('defines the expected ECR untagged-image-expiry rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ECR-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ECR-2',
      name: 'ECR Lifecycle Policy Missing Untagged Image Expiry',
      description: 'Flag ECR repositories whose lifecycle policy does not expire untagged images.',
      message: 'ECR repositories should expire untagged images.',
      provider: 'aws',
      service: 'ecr',
      supports: ['iac'],
      staticDependencies: ['aws-ecr-repositories'],
    });
  });

  it('defines the expected ECR tagged-image-retention-cap rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ECR-3');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ECR-3',
      name: 'ECR Lifecycle Policy Missing Tagged Image Retention Cap',
      description: 'Flag ECR repositories whose lifecycle policy does not cap tagged image retention.',
      message: 'ECR repositories should cap tagged image retention.',
      provider: 'aws',
      service: 'ecr',
      supports: ['iac'],
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

  it('defines the expected ElastiCache idle-cluster rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ELASTICACHE-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ELASTICACHE-2',
      name: 'ElastiCache Cluster Idle',
      description:
        'Flag available ElastiCache clusters whose 14-day average cache hit rate stays below 5% and average current connections stay below 2.',
      message: 'ElastiCache clusters with almost no cache hits and active connections should be reviewed for cleanup.',
      provider: 'aws',
      service: 'elasticache',
      supports: ['discovery'],
      discoveryDependencies: ['aws-elasticache-clusters', 'aws-elasticache-cluster-activity'],
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

  it('defines the expected EBS large-volume rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EBS-4');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EBS-4',
      name: 'EBS Volume Large Size',
      description: 'Flag EBS volumes larger than 100 GiB so their provisioned size can be reviewed intentionally.',
      message: 'EBS volumes larger than 100 GiB should be reviewed.',
      provider: 'aws',
      service: 'ebs',
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-ebs-volumes'],
      staticDependencies: ['aws-ebs-volumes'],
    });
  });

  it('defines the expected EBS high-iops rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EBS-5');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EBS-5',
      name: 'EBS Volume High Provisioned IOPS',
      description: 'Flag io1 and io2 EBS volumes with provisioned IOPS above 32000.',
      message: 'EBS io1 and io2 volumes above 32000 IOPS should be reviewed.',
      provider: 'aws',
      service: 'ebs',
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-ebs-volumes'],
      staticDependencies: ['aws-ebs-volumes'],
    });
  });

  it('defines the expected EBS low-iops rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EBS-6');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EBS-6',
      name: 'EBS Volume Low Provisioned IOPS On io1/io2',
      description: 'Flag io1 and io2 EBS volumes at 16000 IOPS or below as gp3 review candidates.',
      message: 'EBS io1 and io2 volumes at 16000 IOPS or below should be reviewed for gp3.',
      provider: 'aws',
      service: 'ebs',
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-ebs-volumes'],
      staticDependencies: ['aws-ebs-volumes'],
    });
  });

  it('defines the expected EBS snapshot-max-age rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EBS-7');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EBS-7',
      name: 'EBS Snapshot Max Age Exceeded',
      description: 'Flag completed EBS snapshots older than 90 days.',
      message: 'EBS snapshots older than 90 days should be reviewed.',
      provider: 'aws',
      service: 'ebs',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ebs-snapshots'],
    });
  });

  it('defines the expected EBS gp3-extra-throughput rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EBS-8');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EBS-8',
      name: 'EBS gp3 Volume Extra Throughput Provisioned',
      description: 'Flag gp3 volumes that provision throughput above the included 125 MiB/s baseline.',
      message: 'EBS gp3 volumes should avoid paid throughput above the included baseline unless required.',
      provider: 'aws',
      service: 'ebs',
      supports: ['iac'],
      staticDependencies: ['aws-ebs-volumes'],
    });
  });

  it('defines the expected EBS gp3-extra-iops rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EBS-9');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EBS-9',
      name: 'EBS gp3 Volume Extra IOPS Provisioned',
      description: 'Flag gp3 volumes that provision IOPS above the included 3000 baseline.',
      message: 'EBS gp3 volumes should avoid paid IOPS above the included baseline unless required.',
      provider: 'aws',
      service: 'ebs',
      supports: ['iac'],
      staticDependencies: ['aws-ebs-volumes'],
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
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-ec2-elastic-ips'],
      staticDependencies: ['aws-ec2-elastic-ips'],
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
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-emr-clusters'],
      staticDependencies: ['aws-emr-clusters'],
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
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-ec2-instances'],
      staticDependencies: ['aws-ec2-instances'],
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
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-ecs-services', 'aws-ecs-autoscaling'],
      staticDependencies: ['aws-ecs-services', 'aws-ecs-autoscaling'],
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
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-eks-nodegroups'],
      staticDependencies: ['aws-eks-nodegroups'],
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
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-ec2-instances'],
      staticDependencies: ['aws-ec2-instances'],
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

  it('defines the expected EC2 detailed-monitoring rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-10');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-10',
      name: 'EC2 Instance Detailed Monitoring Enabled',
      description: 'Flag EC2 instances that explicitly enable detailed monitoring.',
      message: 'EC2 instances should review detailed monitoring because it adds CloudWatch cost.',
      provider: 'aws',
      service: 'ec2',
      supports: ['iac'],
      staticDependencies: ['aws-ec2-instances'],
    });
  });

  it('defines the expected EC2 idle NAT gateway rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-EC2-11');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-EC2-11',
      name: 'NAT Gateway Idle',
      description: 'Flag available NAT gateways whose inbound and outbound traffic both stay at zero for 7 days.',
      message: 'NAT gateways should process traffic or be removed.',
      provider: 'aws',
      service: 'ec2',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ec2-nat-gateway-activity'],
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

  it('defines the expected ELB network-without-targets rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ELB-4');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ELB-4',
      name: 'Network Load Balancer Without Targets',
      description: 'Flag Network Load Balancers that have no attached target groups or no registered targets.',
      message: 'Network Load Balancers with no registered targets should be deleted.',
      provider: 'aws',
      service: 'elb',
      supports: ['discovery'],
      discoveryDependencies: ['aws-ec2-load-balancers', 'aws-ec2-target-groups'],
    });
  });

  it('defines the expected ELB idle rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ELB-5');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ELB-5',
      name: 'Load Balancer Idle',
      description: 'Flag load balancers whose 14-day average request count stays below 10 requests per day.',
      message: 'Load balancers with consistently low request volume should be reviewed for cleanup.',
      provider: 'aws',
      service: 'elb',
      supports: ['discovery'],
      discoveryDependencies: [
        'aws-ec2-load-balancer-request-activity',
        'aws-ec2-load-balancers',
        'aws-ec2-target-groups',
      ],
    });
  });

  it('defines the expected Lambda high-error-rate rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-LAMBDA-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-LAMBDA-2',
      name: 'Lambda Function High Error Rate',
      description: 'Flag Lambda functions whose 7-day error rate is greater than 10%.',
      message: 'Lambda functions should not sustain an error rate above 10% over the last 7 days.',
      provider: 'aws',
      service: 'lambda',
      supports: ['discovery'],
      discoveryDependencies: ['aws-lambda-functions', 'aws-lambda-function-metrics'],
    });
  });

  it('defines the expected Lambda excessive-timeout rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-LAMBDA-3');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-LAMBDA-3',
      name: 'Lambda Function Excessive Timeout',
      description:
        'Flag Lambda functions whose configured timeout is at least 30 seconds and 5x their 7-day average duration.',
      message: 'Lambda functions should not keep timeouts far above their observed average duration.',
      provider: 'aws',
      service: 'lambda',
      supports: ['discovery'],
      discoveryDependencies: ['aws-lambda-functions', 'aws-lambda-function-metrics'],
    });
  });

  it('defines the expected Lambda memory-overprovisioning rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-LAMBDA-4');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-LAMBDA-4',
      name: 'Lambda Function Memory Overprovisioned',
      description:
        'Flag Lambda functions above 256 MB whose observed 7-day average duration uses less than 30% of the configured timeout.',
      message: 'Lambda functions should not keep memory far above their observed execution needs.',
      provider: 'aws',
      service: 'lambda',
      supports: ['discovery'],
      discoveryDependencies: ['aws-lambda-functions', 'aws-lambda-function-metrics'],
    });
  });

  it('defines the expected Lambda provisioned-concurrency rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-LAMBDA-5');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-LAMBDA-5',
      name: 'Lambda Provisioned Concurrency Configured',
      description: 'Flag explicit Lambda provisioned concurrency configuration for cost review.',
      message: 'Lambda provisioned concurrency should be reviewed for steady low-latency demand.',
      provider: 'aws',
      service: 'lambda',
      supports: ['iac'],
      staticDependencies: ['aws-lambda-provisioned-concurrency'],
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

  it('defines the expected RDS reserved-coverage rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-RDS-3');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-RDS-3',
      name: 'RDS DB Instance Missing Reserved Coverage',
      description: 'Flag long-running RDS DB instances that do not have matching active reserved-instance coverage.',
      message: 'Long-running RDS DB instances should have reserved instance coverage.',
      provider: 'aws',
      service: 'rds',
      supports: ['discovery'],
      discoveryDependencies: ['aws-rds-instances', 'aws-rds-reserved-instances'],
    });
  });

  it('defines the expected RDS Graviton review rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-RDS-4');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-RDS-4',
      name: 'RDS DB Instance Without Graviton',
      description:
        'Flag RDS DB instances that still use non-Graviton instance families when a clear Graviton-based equivalent exists.',
      message: 'RDS DB instances without a Graviton equivalent in use should be reviewed.',
      provider: 'aws',
      service: 'rds',
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-rds-instances'],
      staticDependencies: ['aws-rds-instances'],
    });
  });

  it('defines the expected RDS low-cpu rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-RDS-5');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-RDS-5',
      name: 'RDS DB Instance Low CPU Utilization',
      description: 'Flag available RDS DB instances whose 30-day average CPU stays at or below 10%.',
      message: 'RDS DB instances with low CPU utilization should be reviewed.',
      provider: 'aws',
      service: 'rds',
      supports: ['discovery'],
      discoveryDependencies: ['aws-rds-instances', 'aws-rds-instance-cpu-metrics'],
    });
  });

  it('defines the expected RDS unsupported-engine-version rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-RDS-6');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-RDS-6',
      name: 'RDS DB Instance Unsupported Engine Version',
      description:
        'Flag RDS MySQL 5.7 and PostgreSQL 11 DB instances that can incur extended support charges until they are upgraded.',
      message: 'RDS MySQL 5.7 and PostgreSQL 11 DB instances should be upgraded to avoid extended support charges.',
      provider: 'aws',
      service: 'rds',
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-rds-instances'],
      staticDependencies: ['aws-rds-instances'],
    });
  });

  it('defines the expected RDS unused-snapshots rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-RDS-7');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-RDS-7',
      name: 'RDS Snapshot Without Source DB Instance',
      description: 'Flag RDS snapshots older than 30 days whose source DB instance no longer exists.',
      message: 'RDS snapshots without a source DB instance should be reviewed for cleanup.',
      provider: 'aws',
      service: 'rds',
      supports: ['discovery'],
      discoveryDependencies: ['aws-rds-snapshots', 'aws-rds-instances'],
    });
  });

  it('defines the expected RDS performance-insights-retention rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-RDS-8');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-RDS-8',
      name: 'RDS Performance Insights Extended Retention',
      description: 'Flag DB instances that enable Performance Insights retention beyond the included 7-day period.',
      message: 'RDS Performance Insights should use the included 7-day retention unless longer retention is required.',
      provider: 'aws',
      service: 'rds',
      supports: ['iac'],
      staticDependencies: ['aws-rds-instances'],
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
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-redshift-clusters'],
      staticDependencies: ['aws-redshift-clusters'],
    });
  });

  it('defines the expected API Gateway caching-disabled rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-APIGATEWAY-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-APIGATEWAY-1',
      name: 'API Gateway Stage Caching Disabled',
      description: 'Flag API Gateway REST API stages with caching disabled.',
      message: 'API Gateway REST API stages should enable caching when stage caching is available.',
      provider: 'aws',
      service: 'apigateway',
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-apigateway-stages'],
      staticDependencies: ['aws-apigateway-stages'],
    });
  });

  it('defines the expected SageMaker notebook-running rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-SAGEMAKER-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-SAGEMAKER-1',
      name: 'SageMaker Notebook Instance Running',
      description: 'Flag SageMaker notebook instances whose status remains InService.',
      message: 'SageMaker notebook instances should not remain running when they are no longer needed.',
      provider: 'aws',
      service: 'sagemaker',
      supports: ['discovery'],
      discoveryDependencies: ['aws-sagemaker-notebook-instances'],
    });
  });

  it('defines the expected CloudFront price-class rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-CLOUDFRONT-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-CLOUDFRONT-1',
      name: 'CloudFront Distribution Price Class All',
      description: 'Flag CloudFront distributions using PriceClass_All when a cheaper price class may suffice.',
      message: 'CloudFront distributions using PriceClass_All should be reviewed for cheaper edge coverage.',
      provider: 'aws',
      service: 'cloudfront',
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-cloudfront-distributions'],
      staticDependencies: ['aws-cloudfront-distributions'],
    });
  });

  it('defines the expected CloudFront unused-distribution rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-CLOUDFRONT-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-CLOUDFRONT-2',
      name: 'CloudFront Distribution Unused',
      description: 'Flag CloudFront distributions with fewer than 100 requests over the last 30 days.',
      message: 'CloudFront distributions with almost no request traffic should be reviewed for cleanup.',
      provider: 'aws',
      service: 'cloudfront',
      supports: ['discovery'],
      discoveryDependencies: ['aws-cloudfront-distribution-request-activity'],
    });
  });

  it('defines the expected Cost Explorer full-month-cost-changes rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-COSTEXPLORER-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-COSTEXPLORER-1',
      name: 'Cost Explorer Full Month Cost Changes',
      description: 'Flag services with significant cost increases between the last two full months.',
      message:
        'AWS services with cost increases greater than 10 USD between the last two full months should be reviewed.',
      provider: 'aws',
      service: 'costexplorer',
      supports: ['discovery'],
      discoveryDependencies: ['aws-cost-usage'],
    });
  });

  it('defines the expected cost guardrail missing-budgets rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-COSTGUARDRAILS-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-COSTGUARDRAILS-1',
      name: 'AWS Budgets Missing',
      description: 'Flag AWS accounts that do not have any AWS Budgets configured.',
      message: 'AWS accounts should define at least one AWS Budget for spend guardrails.',
      provider: 'aws',
      service: 'costguardrails',
      supports: ['discovery'],
      discoveryDependencies: ['aws-cost-guardrail-budgets'],
    });
  });

  it('defines the expected cost guardrail missing-anomaly-detection rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-COSTGUARDRAILS-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-COSTGUARDRAILS-2',
      name: 'Cost Anomaly Detection Missing',
      description: 'Flag AWS accounts that do not have any Cost Anomaly Detection monitors configured.',
      message: 'AWS accounts should enable Cost Anomaly Detection monitors for spend spikes.',
      provider: 'aws',
      service: 'costguardrails',
      supports: ['discovery'],
      discoveryDependencies: ['aws-cost-anomaly-monitors'],
    });
  });

  it('defines the expected DynamoDB stale-data rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-DYNAMODB-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-DYNAMODB-1',
      name: 'DynamoDB Table Stale Data',
      description: 'Flag DynamoDB tables with no data changes exceeding a threshold (default 90 days).',
      message: 'DynamoDB tables whose data has not changed for more than 90 days should be reviewed.',
      provider: 'aws',
      service: 'dynamodb',
      supports: ['discovery'],
      discoveryDependencies: ['aws-dynamodb-tables'],
    });
  });

  it('defines the expected DynamoDB autoscaling rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-DYNAMODB-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-DYNAMODB-2',
      name: 'DynamoDB Table Without Autoscaling',
      description: 'Flag provisioned-capacity DynamoDB tables without auto-scaling configured.',
      message: 'Provisioned-capacity DynamoDB tables should use auto-scaling.',
      provider: 'aws',
      service: 'dynamodb',
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-dynamodb-tables', 'aws-dynamodb-autoscaling'],
      staticDependencies: ['aws-dynamodb-tables', 'aws-dynamodb-autoscaling'],
    });
  });

  it('defines the expected DynamoDB unused-table rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-DYNAMODB-3');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-DYNAMODB-3',
      name: 'DynamoDB Table Unused',
      description: 'Flag provisioned DynamoDB tables with no consumed read or write capacity over the last 30 days.',
      message: 'Provisioned DynamoDB tables should not remain unused for 30 days.',
      provider: 'aws',
      service: 'dynamodb',
      supports: ['discovery'],
      discoveryDependencies: ['aws-dynamodb-tables', 'aws-dynamodb-table-utilization'],
    });
  });

  it('defines the expected DynamoDB autoscaling-range-fixed rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-DYNAMODB-4');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-DYNAMODB-4',
      name: 'DynamoDB Autoscaling Range Fixed',
      description:
        'Flag provisioned-capacity DynamoDB tables whose table autoscaling min and max capacity are identical.',
      message: 'Provisioned DynamoDB autoscaling should allow capacity to change.',
      provider: 'aws',
      service: 'dynamodb',
      supports: ['iac'],
      staticDependencies: ['aws-dynamodb-tables', 'aws-dynamodb-autoscaling'],
    });
  });

  it('defines the expected Route 53 higher-ttl rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ROUTE53-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ROUTE53-1',
      name: 'Route 53 Record Higher TTL',
      description: 'Flag Route 53 records with TTL below 3600 seconds.',
      message: 'Route 53 record sets should generally use TTL values of at least 3600 seconds.',
      provider: 'aws',
      service: 'route53',
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-route53-zones', 'aws-route53-records'],
      staticDependencies: ['aws-route53-records'],
    });
  });

  it('defines the expected Route 53 unused-health-check rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-ROUTE53-2');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-ROUTE53-2',
      name: 'Route 53 Health Check Unused',
      description: 'Flag Route 53 health checks not associated with any DNS record.',
      message: 'Route 53 health checks not associated with any DNS record should be deleted.',
      provider: 'aws',
      service: 'route53',
      supports: ['discovery', 'iac'],
      discoveryDependencies: ['aws-route53-health-checks', 'aws-route53-records'],
      staticDependencies: ['aws-route53-health-checks', 'aws-route53-records'],
    });
  });

  it('defines the expected Secrets Manager unused-secret rule metadata', () => {
    const rule = awsRules.find((candidate) => candidate.id === 'CLDBRN-AWS-SECRETSMANAGER-1');

    expect(rule).toBeDefined();
    expect(rule).toMatchObject({
      id: 'CLDBRN-AWS-SECRETSMANAGER-1',
      name: 'Secrets Manager Secret Unused',
      description: 'Flag Secrets Manager secrets not accessed within a threshold (default 90 days).',
      message:
        'Secrets Manager secrets that have not been accessed for more than 90 days should be deleted or reviewed.',
      provider: 'aws',
      service: 'secretsmanager',
      supports: ['discovery'],
      discoveryDependencies: ['aws-secretsmanager-secrets'],
    });
  });
});
