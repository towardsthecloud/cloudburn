import { awsRules } from '@cloudburn/rules';
import { describe, expect, it } from 'vitest';
import { listBuiltInRuleMetadata } from '../src/built-in-rules.js';
import {
  type AwsApiGatewayStage,
  type AwsCloudFrontDistribution,
  type AwsCloudTrailTrail,
  type AwsCloudWatchLogGroup,
  type AwsCloudWatchLogStream,
  type AwsCostUsage,
  type AwsDynamoDbAutoscaling,
  type AwsDynamoDbTable,
  type AwsEbsSnapshot,
  type AwsEbsVolume,
  type AwsEcsClusterMetric,
  type AwsEksNodegroup,
  type AwsElastiCacheCluster,
  type AwsEmrCluster,
  type AwsRdsInstance,
  type AwsRedshiftCluster,
  type AwsRoute53HealthCheck,
  type AwsRoute53Record,
  type AwsRoute53Zone,
  type AwsSecretsManagerSecret,
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

const RULE_ID_PATTERN = /^CLDBRN-([A-Z0-9]+)-([A-Z0-9]+)-(\d+)$/;

const toComparableRuleMetadata = (rule: Pick<Rule, 'description' | 'id' | 'provider' | 'service' | 'supports'>) => ({
  description: rule.description,
  id: rule.id,
  provider: rule.provider,
  service: rule.service,
  supports: rule.supports,
});

const sortRulesForMetadata = <TRule extends Pick<Rule, 'id' | 'provider' | 'service'>>(rules: TRule[]): TRule[] =>
  [...rules].sort((left, right) => {
    const leftMatch = RULE_ID_PATTERN.exec(left.id);
    const rightMatch = RULE_ID_PATTERN.exec(right.id);

    if (!leftMatch || !rightMatch) {
      return left.id.localeCompare(right.id);
    }

    const [, leftProvider, leftService, leftSuffix] = leftMatch;
    const [, rightProvider, rightService, rightSuffix] = rightMatch;

    return (
      leftProvider.localeCompare(rightProvider) ||
      leftService.localeCompare(rightService) ||
      Number.parseInt(leftSuffix, 10) - Number.parseInt(rightSuffix, 10)
    );
  });

describe('sdk exports', () => {
  it('exports the autodetect parser from the package root', () => {
    expect(parseIaC).toBeTypeOf('function');
  });

  it('exports built-in rule metadata in stable provider/service/id order', () => {
    const expected = sortRulesForMetadata(awsRules).map((rule) => toComparableRuleMetadata(rule));

    expect(builtInRuleMetadata.map((rule) => toComparableRuleMetadata(rule))).toEqual(expected);
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
    const apiGatewayStage: AwsApiGatewayStage = {
      accountId: '123456789012',
      cacheClusterEnabled: false,
      region: 'us-east-1',
      restApiId: 'a1b2c3d4',
      stageArn: 'arn:aws:apigateway:us-east-1::/restapis/a1b2c3d4/stages/prod',
      stageName: 'prod',
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
    const logStream: AwsCloudWatchLogStream = {
      accountId: '123456789012',
      arn: 'arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/app:log-stream:2026/03/16/[$LATEST]abc',
      logGroupName: '/aws/lambda/app',
      logStreamName: '2026/03/16/[$LATEST]abc',
      region: 'us-east-1',
    };
    const cloudFrontDistribution: AwsCloudFrontDistribution = {
      accountId: '123456789012',
      distributionArn: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',
      distributionId: 'E1234567890ABC',
      priceClass: 'PriceClass_All',
      region: 'global',
    };
    const costUsage: AwsCostUsage = {
      accountId: '123456789012',
      costIncrease: 15,
      costUnit: 'USD',
      currentMonthCost: 25,
      previousMonthCost: 10,
      serviceName: 'Amazon DynamoDB',
      serviceSlug: 'amazon-dynamodb',
    };
    const dynamoDbTable: AwsDynamoDbTable = {
      accountId: '123456789012',
      billingMode: 'PROVISIONED',
      latestStreamLabel: '2026-01-01T00:00:00.000Z',
      region: 'us-east-1',
      tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/orders',
      tableName: 'orders',
    };
    const dynamoDbAutoscaling: AwsDynamoDbAutoscaling = {
      accountId: '123456789012',
      hasReadTarget: true,
      hasWriteTarget: false,
      region: 'us-east-1',
      tableArn: dynamoDbTable.tableArn,
      tableName: dynamoDbTable.tableName,
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
    const route53Zone: AwsRoute53Zone = {
      accountId: '123456789012',
      hostedZoneArn: 'arn:aws:route53:::hostedzone/Z1234567890',
      hostedZoneId: 'Z1234567890',
      region: 'global',
      zoneName: 'example.com.',
    };
    const route53Record: AwsRoute53Record = {
      accountId: '123456789012',
      healthCheckId: 'abcd1234',
      hostedZoneId: route53Zone.hostedZoneId,
      isAlias: false,
      recordId: 'arn:aws:route53:::hostedzone/Z1234567890/recordset/www.example.com./A',
      recordName: 'www.example.com.',
      recordType: 'A',
      region: 'global',
      ttl: 300,
    };
    const route53HealthCheck: AwsRoute53HealthCheck = {
      accountId: '123456789012',
      healthCheckArn: 'arn:aws:route53:::healthcheck/abcd1234',
      healthCheckId: 'abcd1234',
      region: 'global',
    };
    const secret: AwsSecretsManagerSecret = {
      accountId: '123456789012',
      lastAccessedDate: '2026-03-01T00:00:00.000Z',
      region: 'us-east-1',
      secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:db-password-AbCdEf',
      secretName: 'db-password',
    };

    expect(apiGatewayStage.stageName).toBe('prod');
    expect(trail.trailName).toBe('org-trail');
    expect(logGroup.retentionInDays).toBe(30);
    expect(logStream.logStreamName).toContain('[$LATEST]');
    expect(cloudFrontDistribution.priceClass).toBe('PriceClass_All');
    expect(costUsage.costIncrease).toBe(15);
    expect(dynamoDbTable.tableName).toBe('orders');
    expect(dynamoDbAutoscaling.hasReadTarget).toBe(true);
    expect(volume.sizeGiB).toBe(128);
    expect(snapshot.snapshotId).toBe('snap-123');
    expect(ecsClusterMetric.averageCpuUtilizationLast14Days).toBe(4.2);
    expect(eksNodegroup.nodegroupName).toBe('workers');
    expect(elastiCacheCluster.cacheClusterId).toBe('cache-prod');
    expect(emrCluster.clusterId).toBe('j-CLUSTER1');
    expect(instance.dbInstanceIdentifier).toBe('legacy-db');
    expect(redshiftCluster.clusterIdentifier).toBe('warehouse-prod');
    expect(route53Zone.zoneName).toBe('example.com.');
    expect(route53Record.ttl).toBe(300);
    expect(route53HealthCheck.healthCheckId).toBe('abcd1234');
    expect(secret.secretName).toBe('db-password');
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
