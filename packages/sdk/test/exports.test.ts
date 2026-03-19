import { awsRules } from '@cloudburn/rules';
import { describe, expect, it } from 'vitest';
import { listBuiltInRuleMetadata } from '../src/built-in-rules.js';
import {
  type AwsCloudTrailTrail,
  type AwsCloudWatchLogGroup,
  type AwsCloudWatchLogStream,
  type AwsEbsSnapshot,
  type AwsEbsVolume,
  type AwsEcsClusterMetric,
  type AwsEksNodegroup,
  type AwsElastiCacheCluster,
  type AwsEmrCluster,
  type AwsRdsInstance,
  type AwsRedshiftCluster,
  builtInRuleMetadata,
  parseIaC,
  type Rule,
} from '../src/index.js';

const createRuleFixture = (id: string): Rule => ({
  description: id,
  id,
  message: id,
  name: id,
  provider: 'aws',
  service: 'ec2',
  supports: ['iac'],
});

describe('sdk exports', () => {
  it('exports the autodetect parser from the package root', () => {
    expect(parseIaC).toBeTypeOf('function');
  });

  it('exports built-in rule metadata in stable provider/service/id order', () => {
    expect(
      builtInRuleMetadata.map((rule) => ({
        description: rule.description,
        id: rule.id,
        provider: rule.provider,
        service: rule.service,
        supports: rule.supports,
      })),
    ).toEqual([
      {
        description: 'Flag redundant multi-region CloudTrail trails when more than one trail covers the same account.',
        id: 'CLDBRN-AWS-CLOUDTRAIL-1',
        provider: 'aws',
        service: 'cloudtrail',
        supports: ['discovery'],
      },
      {
        description: 'Flag redundant single-region CloudTrail trails when more than one trail covers the same region.',
        id: 'CLDBRN-AWS-CLOUDTRAIL-2',
        provider: 'aws',
        service: 'cloudtrail',
        supports: ['discovery'],
      },
      {
        description: 'Flag CloudWatch log groups that do not define retention and are not delivery-managed.',
        id: 'CLDBRN-AWS-CLOUDWATCH-1',
        provider: 'aws',
        service: 'cloudwatch',
        supports: ['discovery'],
      },
      {
        description:
          'Flag CloudWatch log streams that have never received events or whose last ingestion was more than 90 days ago outside delivery-managed log groups.',
        id: 'CLDBRN-AWS-CLOUDWATCH-2',
        provider: 'aws',
        service: 'cloudwatch',
        supports: ['discovery'],
      },
      {
        description:
          'Flag EBS volumes using previous-generation storage types when a current-generation replacement exists.',
        id: 'CLDBRN-AWS-EBS-1',
        provider: 'aws',
        service: 'ebs',
        supports: ['discovery', 'iac'],
      },
      {
        description: 'Flag EBS volumes that are not attached to any EC2 instance.',
        id: 'CLDBRN-AWS-EBS-2',
        provider: 'aws',
        service: 'ebs',
        supports: ['discovery'],
      },
      {
        description: 'Flag EBS volumes whose attached EC2 instances are all in the stopped state.',
        id: 'CLDBRN-AWS-EBS-3',
        provider: 'aws',
        service: 'ebs',
        supports: ['discovery'],
      },
      {
        description: 'Flag EBS volumes larger than 100 GiB so their provisioned size can be reviewed intentionally.',
        id: 'CLDBRN-AWS-EBS-4',
        provider: 'aws',
        service: 'ebs',
        supports: ['discovery'],
      },
      {
        description: 'Flag io1 and io2 EBS volumes with provisioned IOPS above 32000.',
        id: 'CLDBRN-AWS-EBS-5',
        provider: 'aws',
        service: 'ebs',
        supports: ['discovery'],
      },
      {
        description: 'Flag io1 and io2 EBS volumes at 16000 IOPS or below as gp3 review candidates.',
        id: 'CLDBRN-AWS-EBS-6',
        provider: 'aws',
        service: 'ebs',
        supports: ['discovery'],
      },
      {
        description: 'Flag completed EBS snapshots older than 90 days.',
        id: 'CLDBRN-AWS-EBS-8',
        provider: 'aws',
        service: 'ebs',
        supports: ['discovery'],
      },
      {
        description: 'Flag direct EC2 instances that do not use curated preferred instance types.',
        id: 'CLDBRN-AWS-EC2-1',
        provider: 'aws',
        service: 'ec2',
        supports: ['iac', 'discovery'],
      },
      {
        description: 'Flag S3 interface endpoints when a gateway endpoint is the cheaper in-VPC option.',
        id: 'CLDBRN-AWS-EC2-2',
        provider: 'aws',
        service: 'ec2',
        supports: ['iac'],
      },
      {
        description: 'Flag Elastic IP allocations that are not associated with an EC2 resource.',
        id: 'CLDBRN-AWS-EC2-3',
        provider: 'aws',
        service: 'ec2',
        supports: ['discovery'],
      },
      {
        description: 'Flag interface VPC endpoints that have processed no traffic in the last 30 days.',
        id: 'CLDBRN-AWS-EC2-4',
        provider: 'aws',
        service: 'ec2',
        supports: ['discovery'],
      },
      {
        description:
          'Flag EC2 instances whose CPU and network usage stay below the low-utilization threshold for at least 4 of the previous 14 days.',
        id: 'CLDBRN-AWS-EC2-5',
        provider: 'aws',
        service: 'ec2',
        supports: ['discovery'],
      },
      {
        description:
          'Flag EC2 instances that still run on non-Graviton families when a clear Arm-based equivalent exists.',
        id: 'CLDBRN-AWS-EC2-6',
        provider: 'aws',
        service: 'ec2',
        supports: ['discovery'],
      },
      {
        description: 'Flag active EC2 reserved instances whose end date is within the next 60 days.',
        id: 'CLDBRN-AWS-EC2-7',
        provider: 'aws',
        service: 'ec2',
        supports: ['discovery'],
      },
      {
        description: 'Flag EC2 instances that are sized at 2xlarge or above so they can be right-sized intentionally.',
        id: 'CLDBRN-AWS-EC2-8',
        provider: 'aws',
        service: 'ec2',
        supports: ['discovery'],
      },
      {
        description: 'Flag EC2 instances whose launch time is at least 180 days old.',
        id: 'CLDBRN-AWS-EC2-9',
        provider: 'aws',
        service: 'ec2',
        supports: ['discovery'],
      },
      {
        description: 'Flag ECR repositories that do not define a lifecycle policy.',
        id: 'CLDBRN-AWS-ECR-1',
        provider: 'aws',
        service: 'ecr',
        supports: ['iac', 'discovery'],
      },
      {
        description:
          'Flag ECS container instances backed by EC2 instance types that still run on non-Graviton families when a clear Arm-based equivalent exists.',
        id: 'CLDBRN-AWS-ECS-1',
        provider: 'aws',
        service: 'ecs',
        supports: ['discovery'],
      },
      {
        description: 'Flag ECS clusters whose average CPU utilization stays below 10% over the previous 14 days.',
        id: 'CLDBRN-AWS-ECS-2',
        provider: 'aws',
        service: 'ecs',
        supports: ['discovery'],
      },
      {
        description:
          'Flag active REPLICA ECS services that do not have an Application Auto Scaling target and scaling policy.',
        id: 'CLDBRN-AWS-ECS-3',
        provider: 'aws',
        service: 'ecs',
        supports: ['discovery'],
      },
      {
        description:
          'Flag EKS node groups that still use non-Graviton instance families when a clear Arm-based equivalent exists.',
        id: 'CLDBRN-AWS-EKS-1',
        provider: 'aws',
        service: 'eks',
        supports: ['discovery'],
      },
      {
        description: 'Flag long-running ElastiCache clusters that do not have matching active reserved-node coverage.',
        id: 'CLDBRN-AWS-ELASTICACHE-1',
        provider: 'aws',
        service: 'elasticache',
        supports: ['discovery'],
      },
      {
        description: 'Flag Application Load Balancers that have no attached target groups or no registered targets.',
        id: 'CLDBRN-AWS-ELB-1',
        provider: 'aws',
        service: 'elb',
        supports: ['discovery'],
      },
      {
        description: 'Flag Classic Load Balancers that have zero attached instances.',
        id: 'CLDBRN-AWS-ELB-2',
        provider: 'aws',
        service: 'elb',
        supports: ['discovery'],
      },
      {
        description: 'Flag Gateway Load Balancers that have no attached target groups or no registered targets.',
        id: 'CLDBRN-AWS-ELB-3',
        provider: 'aws',
        service: 'elb',
        supports: ['discovery'],
      },
      {
        description: 'Flag EMR clusters that still use previous-generation EC2 instance types.',
        id: 'CLDBRN-AWS-EMR-1',
        provider: 'aws',
        service: 'emr',
        supports: ['discovery'],
      },
      {
        description: 'Flag active EMR clusters whose `IsIdle` metric stays true for at least 30 minutes.',
        id: 'CLDBRN-AWS-EMR-2',
        provider: 'aws',
        service: 'emr',
        supports: ['discovery'],
      },
      {
        description: 'Recommend arm64 architecture when compatible.',
        id: 'CLDBRN-AWS-LAMBDA-1',
        provider: 'aws',
        service: 'lambda',
        supports: ['iac', 'discovery'],
      },
      {
        description: 'Flag RDS DB instances that do not use curated preferred instance classes.',
        id: 'CLDBRN-AWS-RDS-1',
        provider: 'aws',
        service: 'rds',
        supports: ['iac', 'discovery'],
      },
      {
        description: 'Flag RDS DB instances that have no database connections in the last 7 days.',
        id: 'CLDBRN-AWS-RDS-2',
        provider: 'aws',
        service: 'rds',
        supports: ['discovery'],
      },
      {
        description: 'Flag available Redshift clusters whose 14-day average CPU stays at or below 10%.',
        id: 'CLDBRN-AWS-REDSHIFT-1',
        provider: 'aws',
        service: 'redshift',
        supports: ['discovery'],
      },
      {
        description: 'Flag long-running Redshift clusters that do not have matching active reserved-node coverage.',
        id: 'CLDBRN-AWS-REDSHIFT-2',
        provider: 'aws',
        service: 'redshift',
        supports: ['discovery'],
      },
      {
        description: 'Flag eligible Redshift clusters that do not have both pause and resume schedules configured.',
        id: 'CLDBRN-AWS-REDSHIFT-3',
        provider: 'aws',
        service: 'redshift',
        supports: ['discovery'],
      },
      {
        description: 'Ensure S3 buckets define lifecycle management policies.',
        id: 'CLDBRN-AWS-S3-1',
        provider: 'aws',
        service: 's3',
        supports: ['iac', 'discovery'],
      },
      {
        description:
          'Recommend Intelligent-Tiering or another explicit storage-class transition for lifecycle-managed buckets.',
        id: 'CLDBRN-AWS-S3-2',
        provider: 'aws',
        service: 's3',
        supports: ['iac', 'discovery'],
      },
    ]);
  });

  it('sorts numeric rule suffixes in numeric order within the same service', () => {
    expect(
      listBuiltInRuleMetadata([
        createRuleFixture('CLDBRN-AWS-EC2-9'),
        createRuleFixture('CLDBRN-AWS-EC2-2'),
        createRuleFixture('CLDBRN-AWS-EC2-1'),
      ]).map((rule) => rule.id),
    ).toEqual(['CLDBRN-AWS-EC2-1', 'CLDBRN-AWS-EC2-2', 'CLDBRN-AWS-EC2-9']);
  });

  it('exports live dataset types from the package root', () => {
    const trail: AwsCloudTrailTrail = {
      accountId: '123456789012',
      homeRegion: 'us-east-1',
      isMultiRegionTrail: true,
      isOrganizationTrail: false,
      region: 'us-east-1',
      trailArn: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/org-trail',
      trailName: 'org-trail',
    };
    const logGroup: AwsCloudWatchLogGroup = {
      accountId: '123456789012',
      logGroupArn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app',
      logGroupName: '/aws/lambda/app',
      region: 'us-east-1',
      retentionInDays: 30,
    };
    const logStream: AwsCloudWatchLogStream = {
      accountId: '123456789012',
      arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app:log-stream:2026/03/16/[$LATEST]abc',
      logGroupName: '/aws/lambda/app',
      logStreamName: '2026/03/16/[$LATEST]abc',
      region: 'us-east-1',
    };
    const volume: AwsEbsVolume = {
      accountId: '123456789012',
      iops: 3000,
      region: 'us-east-1',
      sizeGiB: 128,
      volumeId: 'vol-123',
      volumeType: 'gp3',
    };
    const snapshot: AwsEbsSnapshot = {
      accountId: '123456789012',
      region: 'us-east-1',
      snapshotId: 'snap-123',
      startTime: '2025-01-01T00:00:00.000Z',
      state: 'completed',
      volumeId: 'vol-123',
      volumeSizeGiB: 128,
    };
    const ecsClusterMetric: AwsEcsClusterMetric = {
      accountId: '123456789012',
      averageCpuUtilizationLast14Days: 4.2,
      clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
      clusterName: 'production',
      region: 'us-east-1',
    };
    const eksNodegroup: AwsEksNodegroup = {
      accountId: '123456789012',
      amiType: 'AL2023_x86_64_STANDARD',
      clusterArn: 'arn:aws:eks:us-east-1:123456789012:cluster/production',
      clusterName: 'production',
      instanceTypes: ['m7i.large'],
      nodegroupArn: 'arn:aws:eks:us-east-1:123456789012:nodegroup/production/workers/abc123',
      nodegroupName: 'workers',
      region: 'us-east-1',
    };
    const elastiCacheCluster: AwsElastiCacheCluster = {
      accountId: '123456789012',
      cacheClusterCreateTime: '2025-01-01T00:00:00.000Z',
      cacheClusterId: 'cache-prod',
      cacheClusterStatus: 'available',
      cacheNodeType: 'cache.r6g.large',
      engine: 'redis',
      numCacheNodes: 2,
      region: 'us-east-1',
    };
    const emrCluster: AwsEmrCluster = {
      accountId: '123456789012',
      clusterId: 'j-CLUSTER1',
      clusterName: 'analytics',
      instanceTypes: ['m8g.xlarge'],
      region: 'us-east-1',
    };
    const redshiftCluster: AwsRedshiftCluster = {
      accountId: '123456789012',
      automatedSnapshotRetentionPeriod: 1,
      clusterIdentifier: 'warehouse-prod',
      hasPauseSchedule: false,
      hasResumeSchedule: true,
      hsmEnabled: false,
      nodeType: 'ra3.xlplus',
      numberOfNodes: 2,
      region: 'us-east-1',
      vpcId: 'vpc-123',
    };
    const instance: AwsRdsInstance = {
      accountId: '123456789012',
      dbInstanceIdentifier: 'legacy-db',
      instanceClass: 'db.m6i.large',
      region: 'us-east-1',
    };

    expect(trail.trailName).toBe('org-trail');
    expect(logGroup.retentionInDays).toBe(30);
    expect(logStream.logStreamName).toContain('[$LATEST]');
    expect(volume.sizeGiB).toBe(128);
    expect(snapshot.snapshotId).toBe('snap-123');
    expect(ecsClusterMetric.averageCpuUtilizationLast14Days).toBe(4.2);
    expect(eksNodegroup.nodegroupName).toBe('workers');
    expect(elastiCacheCluster.cacheClusterId).toBe('cache-prod');
    expect(emrCluster.clusterId).toBe('j-CLUSTER1');
    expect(instance.dbInstanceIdentifier).toBe('legacy-db');
    expect(redshiftCluster.clusterIdentifier).toBe('warehouse-prod');
  });

  it('clones supports arrays so metadata consumers cannot mutate source rule definitions', () => {
    const sourceRule = awsRules.find((rule) => rule.id === 'CLDBRN-AWS-EBS-1');
    const metadataRule = builtInRuleMetadata.find((rule) => rule.id === 'CLDBRN-AWS-EBS-1');

    expect(sourceRule).toBeDefined();
    expect(metadataRule).toBeDefined();
    expect(metadataRule?.supports).toEqual(sourceRule?.supports);
    expect(metadataRule?.supports).not.toBe(sourceRule?.supports);
  });
});
