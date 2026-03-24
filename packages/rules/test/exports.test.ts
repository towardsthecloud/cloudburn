import { describe, expect, it } from 'vitest';
import type {
  AwsCloudTrailTrail,
  AwsCloudWatchLogGroup,
  AwsEbsSnapshot,
  AwsEbsVolume,
  AwsEc2Instance,
  AwsEc2LoadBalancer,
  AwsEc2ReservedInstance,
  AwsEc2TargetGroup,
  AwsEcsClusterMetric,
  AwsEcsService,
  AwsEksNodegroup,
  AwsElastiCacheCluster,
  AwsElastiCacheReservedNode,
  AwsEmrCluster,
  AwsEmrClusterMetric,
  AwsRdsInstance,
  AwsRedshiftCluster,
  AwsRedshiftClusterMetric,
  AwsRedshiftReservedNode,
  AwsStaticRdsInstance,
  DiscoveryDatasetKey,
  StaticDatasetKey,
} from '../src/index.js';
import {
  awsCorePreset,
  awsRules,
  azureRules,
  createFindingMatch,
  createStaticFindingMatch,
  gcpRules,
  isRecord,
  LiveResourceBag,
  StaticResourceBag,
} from '../src/index.js';

describe('rule exports', () => {
  it('exports non-empty AWS rules and preset IDs', () => {
    expect(awsRules.length).toBeGreaterThan(0);
    expect(awsCorePreset.ruleIds.length).toBe(awsRules.length);
    expect(awsRules.map((rule) => rule.id)).toEqual(
      expect.arrayContaining([
        'CLDBRN-AWS-CLOUDTRAIL-1',
        'CLDBRN-AWS-CLOUDTRAIL-2',
        'CLDBRN-AWS-CLOUDWATCH-1',
        'CLDBRN-AWS-CLOUDWATCH-2',
        'CLDBRN-AWS-EC2-2',
        'CLDBRN-AWS-EC2-3',
        'CLDBRN-AWS-EC2-4',
        'CLDBRN-AWS-EC2-5',
        'CLDBRN-AWS-EC2-6',
        'CLDBRN-AWS-EC2-7',
        'CLDBRN-AWS-EC2-8',
        'CLDBRN-AWS-EC2-9',
        'CLDBRN-AWS-ECS-1',
        'CLDBRN-AWS-ECS-2',
        'CLDBRN-AWS-ECS-3',
        'CLDBRN-AWS-EBS-4',
        'CLDBRN-AWS-EBS-5',
        'CLDBRN-AWS-EBS-6',
        'CLDBRN-AWS-EBS-7',
        'CLDBRN-AWS-EBS-2',
        'CLDBRN-AWS-EBS-3',
        'CLDBRN-AWS-ECR-1',
        'CLDBRN-AWS-EKS-1',
        'CLDBRN-AWS-ELASTICACHE-1',
        'CLDBRN-AWS-ELB-1',
        'CLDBRN-AWS-ELB-2',
        'CLDBRN-AWS-ELB-3',
        'CLDBRN-AWS-ELB-4',
        'CLDBRN-AWS-EMR-1',
        'CLDBRN-AWS-EMR-2',
        'CLDBRN-AWS-LAMBDA-2',
        'CLDBRN-AWS-LAMBDA-3',
        'CLDBRN-AWS-RDS-2',
        'CLDBRN-AWS-RDS-3',
        'CLDBRN-AWS-RDS-4',
        'CLDBRN-AWS-RDS-5',
        'CLDBRN-AWS-RDS-6',
        'CLDBRN-AWS-RDS-7',
        'CLDBRN-AWS-REDSHIFT-1',
        'CLDBRN-AWS-REDSHIFT-2',
        'CLDBRN-AWS-REDSHIFT-3',
        'CLDBRN-AWS-S3-1',
        'CLDBRN-AWS-S3-2',
      ]),
    );
  });

  it('exports shared helpers and dataset types used by built-in AWS rules', () => {
    expect(createFindingMatch).toBeTypeOf('function');
    expect(createStaticFindingMatch).toBeTypeOf('function');
    expect(isRecord).toBeTypeOf('function');
    expect(LiveResourceBag).toBeTypeOf('function');
    expect(StaticResourceBag).toBeTypeOf('function');

    const instance: AwsEc2Instance = {
      accountId: '123456789012',
      architecture: 'x86_64',
      instanceId: 'i-1234567890abcdef0',
      instanceType: 'm8azn.large',
      launchTime: '2026-03-01T00:00:00.000Z',
      region: 'us-east-1',
      state: 'running',
    };

    expect(instance.instanceType).toBe('m8azn.large');
    expect(instance.state).toBe('running');
    expect(instance.architecture).toBe('x86_64');
    expect(instance.launchTime).toBe('2026-03-01T00:00:00.000Z');

    const volume: AwsEbsVolume = {
      accountId: '123456789012',
      iops: 12000,
      region: 'us-east-1',
      sizeGiB: 256,
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
      volumeSizeGiB: 256,
    };

    expect(volume.sizeGiB).toBe(256);
    expect(volume.iops).toBe(12000);
    expect(snapshot.snapshotId).toBe('snap-123');
    expect(snapshot.state).toBe('completed');

    const reservedInstance: AwsEc2ReservedInstance = {
      accountId: '123456789012',
      endTime: '2026-05-01T00:00:00.000Z',
      instanceType: 'm6i.large',
      region: 'us-east-1',
      reservedInstancesId: 'abcd1234-ef56-7890-abcd-1234567890ab',
      state: 'active',
    };

    const loadBalancer: AwsEc2LoadBalancer = {
      accountId: '123456789012',
      attachedTargetGroupArns: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/app/123'],
      instanceCount: 0,
      loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/alb/123',
      loadBalancerName: 'alb',
      loadBalancerType: 'application',
      region: 'us-east-1',
    };

    const targetGroup: AwsEc2TargetGroup = {
      accountId: '123456789012',
      loadBalancerArns: [loadBalancer.loadBalancerArn],
      region: 'us-east-1',
      registeredTargetCount: 0,
      targetGroupArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/app/123',
    };
    const cacheCluster: AwsElastiCacheCluster = {
      accountId: '123456789012',
      cacheClusterCreateTime: '2025-01-01T00:00:00.000Z',
      cacheClusterId: 'cache-prod',
      cacheClusterStatus: 'available',
      cacheNodeType: 'cache.r6g.large',
      engine: 'redis',
      numCacheNodes: 2,
      region: 'us-east-1',
    };
    const reservedCacheNode: AwsElastiCacheReservedNode = {
      accountId: '123456789012',
      cacheNodeCount: 2,
      cacheNodeType: 'cache.r6g.large',
      productDescription: 'redis',
      region: 'us-east-1',
      reservedCacheNodeId: 'reserved-cache-prod',
      state: 'active',
    };
    const emrCluster: AwsEmrCluster = {
      accountId: '123456789012',
      clusterId: 'j-CLUSTER1',
      clusterName: 'analytics',
      instanceTypes: ['m8g.xlarge'],
      region: 'us-east-1',
    };
    const emrMetric: AwsEmrClusterMetric = {
      accountId: '123456789012',
      clusterId: emrCluster.clusterId,
      idlePeriodsLast30Minutes: 6,
      region: 'us-east-1',
    };

    const rdsInstance: AwsStaticRdsInstance = {
      instanceClass: 'db.m8g.large',
      resourceId: 'aws_db_instance.current',
    };

    const liveRdsInstance: AwsRdsInstance = {
      accountId: '123456789012',
      dbInstanceIdentifier: 'legacy-db',
      dbInstanceStatus: 'available',
      engine: 'mysql',
      engineVersion: '8.0.39',
      instanceClass: 'db.m6i.large',
      instanceCreateTime: '2025-01-01T00:00:00.000Z',
      multiAz: false,
      region: 'us-east-1',
    };
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
    const ecsClusterMetric: AwsEcsClusterMetric = {
      accountId: '123456789012',
      averageCpuUtilizationLast14Days: 4.2,
      clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
      clusterName: 'production',
      region: 'us-east-1',
    };
    const ecsService: AwsEcsService = {
      accountId: '123456789012',
      clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
      clusterName: 'production',
      desiredCount: 2,
      region: 'us-east-1',
      schedulingStrategy: 'REPLICA',
      serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/production/web',
      serviceName: 'web',
      status: 'ACTIVE',
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
    const redshiftMetric: AwsRedshiftClusterMetric = {
      accountId: '123456789012',
      averageCpuUtilizationLast14Days: 4,
      clusterIdentifier: redshiftCluster.clusterIdentifier,
      region: 'us-east-1',
    };
    const redshiftReservedNode: AwsRedshiftReservedNode = {
      accountId: '123456789012',
      nodeCount: 2,
      nodeType: redshiftCluster.nodeType,
      region: 'us-east-1',
      reservedNodeId: 'reserved-node-1',
      state: 'active',
    };

    const datasetKey: DiscoveryDatasetKey = 'aws-rds-instances';
    const cloudWatchDatasetKey: DiscoveryDatasetKey = 'aws-cloudwatch-log-groups';
    const cloudWatchLogStreamDatasetKey: DiscoveryDatasetKey = 'aws-cloudwatch-log-streams';
    const ecsAutoscalingDatasetKey: DiscoveryDatasetKey = 'aws-ecs-autoscaling';
    const elastiCacheDatasetKey: DiscoveryDatasetKey = 'aws-elasticache-clusters';
    const elastiCacheReservedDatasetKey: DiscoveryDatasetKey = 'aws-elasticache-reserved-nodes';
    const loadBalancerDatasetKey: DiscoveryDatasetKey = 'aws-ec2-load-balancers';
    const emrDatasetKey: DiscoveryDatasetKey = 'aws-emr-clusters';
    const emrMetricDatasetKey: DiscoveryDatasetKey = 'aws-emr-cluster-metrics';
    const reservedInstanceDatasetKey: DiscoveryDatasetKey = 'aws-ec2-reserved-instances';
    const redshiftDatasetKey: DiscoveryDatasetKey = 'aws-redshift-clusters';
    const redshiftMetricDatasetKey: DiscoveryDatasetKey = 'aws-redshift-cluster-metrics';
    const redshiftReservedDatasetKey: DiscoveryDatasetKey = 'aws-redshift-reserved-nodes';
    const targetGroupDatasetKey: DiscoveryDatasetKey = 'aws-ec2-target-groups';
    const staticDatasetKey: StaticDatasetKey = 'aws-rds-instances';

    expect(datasetKey).toBe('aws-rds-instances');
    expect(cloudWatchDatasetKey).toBe('aws-cloudwatch-log-groups');
    expect(cloudWatchLogStreamDatasetKey).toBe('aws-cloudwatch-log-streams');
    expect(ecsAutoscalingDatasetKey).toBe('aws-ecs-autoscaling');
    expect(elastiCacheDatasetKey).toBe('aws-elasticache-clusters');
    expect(elastiCacheReservedDatasetKey).toBe('aws-elasticache-reserved-nodes');
    expect(loadBalancerDatasetKey).toBe('aws-ec2-load-balancers');
    expect(emrDatasetKey).toBe('aws-emr-clusters');
    expect(emrMetricDatasetKey).toBe('aws-emr-cluster-metrics');
    expect(reservedInstanceDatasetKey).toBe('aws-ec2-reserved-instances');
    expect(redshiftDatasetKey).toBe('aws-redshift-clusters');
    expect(redshiftMetricDatasetKey).toBe('aws-redshift-cluster-metrics');
    expect(redshiftReservedDatasetKey).toBe('aws-redshift-reserved-nodes');
    expect(targetGroupDatasetKey).toBe('aws-ec2-target-groups');
    expect(cacheCluster.cacheClusterStatus).toBe('available');
    expect(reservedCacheNode.state).toBe('active');
    expect(ecsClusterMetric.averageCpuUtilizationLast14Days).toBe(4.2);
    expect(ecsService.schedulingStrategy).toBe('REPLICA');
    expect(eksNodegroup.nodegroupName).toBe('workers');
    expect(emrCluster.clusterName).toBe('analytics');
    expect(emrMetric.idlePeriodsLast30Minutes).toBe(6);
    expect(liveRdsInstance.dbInstanceIdentifier).toBe('legacy-db');
    expect(redshiftCluster.nodeType).toBe('ra3.xlplus');
    expect(redshiftMetric.averageCpuUtilizationLast14Days).toBe(4);
    expect(redshiftReservedNode.state).toBe('active');
    expect(trail.isMultiRegionTrail).toBe(true);
    expect(logGroup.logGroupName).toBe('/aws/lambda/app');
    expect(reservedInstance.state).toBe('active');
    expect(loadBalancer.loadBalancerType).toBe('application');
    expect(targetGroup.registeredTargetCount).toBe(0);
    expect(rdsInstance.instanceClass).toBe('db.m8g.large');
    expect(staticDatasetKey).toBe('aws-rds-instances');
  });

  it('exports placeholder multi-cloud arrays', () => {
    expect(azureRules).toEqual([]);
    expect(gcpRules).toEqual([]);
  });
});
