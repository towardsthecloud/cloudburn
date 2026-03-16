import { describe, expect, it } from 'vitest';
import type {
  AwsCloudTrailTrail,
  AwsCloudWatchLogGroup,
  AwsEc2Instance,
  AwsEc2LoadBalancer,
  AwsEc2ReservedInstance,
  AwsEc2TargetGroup,
  AwsRdsInstance,
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
        'CLDBRN-AWS-EC2-9',
        'CLDBRN-AWS-EC2-10',
        'CLDBRN-AWS-EC2-11',
        'CLDBRN-AWS-EC2-12',
        'CLDBRN-AWS-EBS-2',
        'CLDBRN-AWS-EBS-3',
        'CLDBRN-AWS-ECR-1',
        'CLDBRN-AWS-ELB-1',
        'CLDBRN-AWS-ELB-2',
        'CLDBRN-AWS-ELB-3',
        'CLDBRN-AWS-RDS-2',
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

    const rdsInstance: AwsStaticRdsInstance = {
      instanceClass: 'db.m8g.large',
      resourceId: 'aws_db_instance.current',
    };

    const liveRdsInstance: AwsRdsInstance = {
      accountId: '123456789012',
      dbInstanceIdentifier: 'legacy-db',
      instanceClass: 'db.m6i.large',
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

    const datasetKey: DiscoveryDatasetKey = 'aws-rds-instances';
    const cloudWatchDatasetKey: DiscoveryDatasetKey = 'aws-cloudwatch-log-groups';
    const cloudWatchLogStreamDatasetKey: DiscoveryDatasetKey = 'aws-cloudwatch-log-streams';
    const loadBalancerDatasetKey: DiscoveryDatasetKey = 'aws-ec2-load-balancers';
    const reservedInstanceDatasetKey: DiscoveryDatasetKey = 'aws-ec2-reserved-instances';
    const targetGroupDatasetKey: DiscoveryDatasetKey = 'aws-ec2-target-groups';
    const staticDatasetKey: StaticDatasetKey = 'aws-rds-instances';

    expect(datasetKey).toBe('aws-rds-instances');
    expect(cloudWatchDatasetKey).toBe('aws-cloudwatch-log-groups');
    expect(cloudWatchLogStreamDatasetKey).toBe('aws-cloudwatch-log-streams');
    expect(loadBalancerDatasetKey).toBe('aws-ec2-load-balancers');
    expect(reservedInstanceDatasetKey).toBe('aws-ec2-reserved-instances');
    expect(targetGroupDatasetKey).toBe('aws-ec2-target-groups');
    expect(liveRdsInstance.dbInstanceIdentifier).toBe('legacy-db');
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
