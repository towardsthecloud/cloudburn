import { describe, expect, it } from 'vitest';
import type {
  AwsLambdaFunction,
  AwsLambdaFunctionMetric,
  DiscoveryDatasetMap,
  LiveEvaluationContext,
} from '../src/index.js';
import { awsRules, LiveResourceBag } from '../src/index.js';

const context = (datasets: Partial<DiscoveryDatasetMap>): LiveEvaluationContext => ({
  catalog: { indexType: 'LOCAL', resources: [], searchRegion: 'us-east-1' },
  resources: new LiveResourceBag(datasets),
});

const rule = (id: string) => {
  const found = awsRules.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown rule ${id}`);
  return found;
};

const match = (resourceId: string) => ({ accountId: '123456789012', region: 'us-east-1', resourceId });
const scope = { accountId: '123456789012', region: 'us-east-1' };

const lambdaFunction = (functionName: string, overrides: Partial<AwsLambdaFunction> = {}): AwsLambdaFunction => ({
  accountId: '123456789012',
  architectures: ['arm64'],
  functionName,
  memorySizeMb: 128,
  region: 'us-east-1',
  timeoutSeconds: 60,
  ...overrides,
});

const lambdaMetric = (
  functionName: string,
  overrides: Partial<AwsLambdaFunctionMetric> = {},
): AwsLambdaFunctionMetric => ({
  accountId: '123456789012',
  averageDurationMsLast7Days: 1000,
  functionName,
  region: 'us-east-1',
  totalErrorsLast7Days: 20,
  totalInvocationsLast7Days: 100,
  ...overrides,
});

describe('live metric evaluation coverage', () => {
  it('assesses policies ruled out by configuration without requiring unrelated metrics', () => {
    const timeoutInput = context({
      'aws-lambda-functions': [lambdaFunction('short-timeout', { timeoutSeconds: 5 })],
    });
    const databaseInput = context({
      'aws-rds-instances': [
        { ...scope, dbInstanceIdentifier: 'stopped', instanceClass: 'db.m6i.large', dbInstanceStatus: 'stopped' },
      ],
    });

    expect(rule('CLDBRN-AWS-LAMBDA-3').getLiveEvaluationCoverage?.(timeoutInput)).toEqual({
      assessed: [match('short-timeout')],
      unknown: [],
    });
    expect(rule('CLDBRN-AWS-RDS-5').getLiveEvaluationCoverage?.(databaseInput)).toEqual({
      assessed: [match('stopped')],
      unknown: [],
    });
  });

  it('keeps metric coverage scoped to each AWS account and Region', () => {
    const input = context({
      'aws-rds-instances': [
        { ...scope, dbInstanceIdentifier: 'orders', instanceClass: 'db.m6i.large', dbInstanceStatus: 'available' },
        {
          ...scope,
          accountId: '210987654321',
          region: 'us-west-2',
          dbInstanceIdentifier: 'orders',
          instanceClass: 'db.m6i.large',
          dbInstanceStatus: 'available',
        },
      ],
      'aws-rds-instance-cpu-metrics': [
        { ...scope, dbInstanceIdentifier: 'orders', averageCpuUtilizationLast30Days: 80 },
      ],
    });

    expect(rule('CLDBRN-AWS-RDS-5').getLiveEvaluationCoverage?.(input)).toEqual({
      assessed: [match('orders')],
      unknown: [{ accountId: '210987654321', region: 'us-west-2', resourceId: 'orders' }],
    });
  });

  it.each<[string, Partial<DiscoveryDatasetMap>, string]>([
    [
      'CLDBRN-AWS-CLOUDFRONT-2',
      {
        'aws-cloudfront-distributions': [
          {
            ...scope,
            distributionId: 'unknown',
            distributionArn: 'arn:aws:cloudfront::123456789012:distribution/unknown',
          },
        ],
      },
      'arn:aws:cloudfront::123456789012:distribution/unknown',
    ],
    ...['CLDBRN-AWS-DYNAMODB-1', 'CLDBRN-AWS-DYNAMODB-3'].map((id): [string, Partial<DiscoveryDatasetMap>, string] => [
      id,
      {
        'aws-dynamodb-tables': [
          {
            ...scope,
            tableName: 'unknown',
            tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/unknown',
            billingMode: 'PROVISIONED',
          },
        ],
      },
      'arn:aws:dynamodb:us-east-1:123456789012:table/unknown',
    ]),
    [
      'CLDBRN-AWS-ECS-2',
      {
        'aws-ecs-clusters': [
          { ...scope, clusterName: 'unknown', clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/unknown' },
        ],
      },
      'arn:aws:ecs:us-east-1:123456789012:cluster/unknown',
    ],
    [
      'CLDBRN-AWS-ELASTICACHE-2',
      {
        'aws-elasticache-clusters': [
          {
            ...scope,
            cacheClusterId: 'unknown',
            cacheNodeType: 'cache.t3.micro',
            engine: 'redis',
            numCacheNodes: 1,
            cacheClusterStatus: 'available',
          },
        ],
      },
      'unknown',
    ],
    [
      'CLDBRN-AWS-ELB-5',
      {
        'aws-ec2-load-balancers': [
          {
            ...scope,
            loadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/unknown/123',
            loadBalancerName: 'unknown',
            loadBalancerType: 'application',
            attachedTargetGroupArns: ['target-group-1'],
            instanceCount: 0,
          },
        ],
        'aws-ec2-target-groups': [
          { ...scope, targetGroupArn: 'target-group-1', loadBalancerArns: [], registeredTargetCount: 1 },
        ],
      },
      'arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/unknown/123',
    ],
    [
      'CLDBRN-AWS-EMR-2',
      {
        'aws-emr-clusters': [
          { ...scope, clusterId: 'unknown', clusterName: 'unknown', instanceTypes: ['m6i.large'], state: 'RUNNING' },
        ],
      },
      'unknown',
    ],
    ...['CLDBRN-AWS-RDS-2', 'CLDBRN-AWS-RDS-5'].map((id): [string, Partial<DiscoveryDatasetMap>, string] => [
      id,
      {
        'aws-rds-instances': [
          {
            ...scope,
            dbInstanceIdentifier: 'unknown',
            instanceClass: 'db.m6i.large',
            dbInstanceStatus: 'available',
            engine: 'mysql',
            storageType: 'gp3',
          },
        ],
      },
      'unknown',
    ]),
    [
      'CLDBRN-AWS-REDSHIFT-1',
      {
        'aws-redshift-clusters': [
          {
            ...scope,
            clusterIdentifier: 'unknown',
            clusterStatus: 'available',
            nodeType: 'ra3.large',
            numberOfNodes: 2,
            hasPauseSchedule: false,
            hasResumeSchedule: false,
            hsmEnabled: false,
          },
        ],
      },
      'unknown',
    ],
  ])('keeps inventory resources omitted from metric rows unknown for %s', (id, datasets, resourceId) => {
    const selected = rule(id);
    const input = context(datasets);

    expect(selected.evaluateLive?.(input)).toBeNull();
    expect(selected.getLiveEvaluationCoverage?.(input)).toEqual({ assessed: [], unknown: [match(resourceId)] });
  });

  it.each<[string, Partial<DiscoveryDatasetMap>, string]>([
    [
      'CLDBRN-AWS-EC2-11',
      {
        'aws-ec2-nat-gateway-activity': [
          {
            accountId: '123456789012',
            region: 'us-east-1',
            natGatewayId: 'nat-unknown',
            subnetId: 'subnet-1',
            state: 'available',
            bytesInFromDestinationLast7Days: 0,
            bytesOutToDestinationLast7Days: null,
          },
        ],
      },
      'nat-unknown',
    ],
    [
      'CLDBRN-AWS-EC2-14',
      {
        'aws-ec2-transit-gateway-vpc-attachment-activity': [
          {
            accountId: '123456789012',
            region: 'us-east-1',
            transitGatewayAttachmentId: 'tgw-attach-unknown',
            transitGatewayId: 'tgw-1',
            vpcId: 'vpc-1',
            state: 'available',
            lookbackDays: 30,
            bytesInLast30Days: null,
            bytesOutLast30Days: 0,
            hourlyAttachmentCostUsd: 0.05,
            estimatedMonthlyAttachmentCostUsd: 36.5,
          },
        ],
      },
      'tgw-attach-unknown',
    ],
    [
      'CLDBRN-AWS-EC2-4',
      {
        'aws-ec2-vpc-endpoint-activity': [
          {
            accountId: '123456789012',
            region: 'us-east-1',
            vpcEndpointId: 'vpce-unknown',
            vpcId: 'vpc-1',
            subnetIds: [],
            serviceName: 'com.amazonaws.us-east-1.ecr.api',
            vpcEndpointType: 'Interface',
            bytesProcessedLast30Days: null,
          },
        ],
      },
      'vpce-unknown',
    ],
    [
      'CLDBRN-AWS-SAGEMAKER-2',
      {
        'aws-sagemaker-endpoint-activity': [
          {
            accountId: '123456789012',
            region: 'us-east-1',
            endpointName: 'endpoint-unknown',
            endpointArn: 'arn:aws:sagemaker:us-east-1:123456789012:endpoint/endpoint-unknown',
            endpointStatus: 'InService',
            creationTime: '2020-01-01T00:00:00.000Z',
            totalInvocationsLast14Days: null,
          },
        ],
      },
      'endpoint-unknown',
    ],
  ])('keeps incomplete normalized metric evidence unknown for %s', (id, datasets, resourceId) => {
    const selected = rule(id);
    const input = context(datasets);

    expect(selected.evaluateLive?.(input)).toBeNull();
    expect(selected.getLiveEvaluationCoverage?.(input)).toEqual({ assessed: [], unknown: [match(resourceId)] });
  });

  it('retains known findings and unknown resources independently for Lambda errors and duration', () => {
    const input = context({
      'aws-lambda-functions': [lambdaFunction('known'), lambdaFunction('unknown-errors'), lambdaFunction('missing')],
      'aws-lambda-function-metrics': [
        lambdaMetric('known', { averageDurationMsLast7Days: null }),
        lambdaMetric('unknown-errors', { totalErrorsLast7Days: null }),
      ],
    });
    const errorRule = rule('CLDBRN-AWS-LAMBDA-2');
    const durationRule = rule('CLDBRN-AWS-LAMBDA-3');

    expect(errorRule.evaluateLive?.(input)?.findings).toEqual([match('known')]);
    expect(errorRule.getLiveEvaluationCoverage?.(input)).toEqual({
      assessed: [match('known')],
      unknown: [match('unknown-errors'), match('missing')],
    });
    expect(durationRule.evaluateLive?.(input)?.findings).toEqual([match('unknown-errors')]);
    expect(durationRule.getLiveEvaluationCoverage?.(input)).toEqual({
      assessed: [match('unknown-errors')],
      unknown: [match('known'), match('missing')],
    });
  });

  it('requires enough EC2 days to decide the policy and retains instances omitted from metric rows', () => {
    const ids = ['four-idle-days', 'three-idle-days', 'complete-pass', 'missing'];
    const input = context({
      'aws-ec2-instances': ids.map((instanceId) => ({
        accountId: '123456789012',
        instanceId,
        instanceType: 'm6i.large',
        region: 'us-east-1',
      })),
      'aws-ec2-instance-utilization': [
        {
          accountId: '123456789012',
          averageCpuUtilizationLast14Days: 4,
          averageDailyNetworkBytesLast14Days: 1024,
          instanceId: 'four-idle-days',
          instanceType: 'm6i.large',
          lowUtilizationDays: 4,
          observedDays: 4,
          region: 'us-east-1',
        },
        {
          accountId: '123456789012',
          averageCpuUtilizationLast14Days: 4,
          averageDailyNetworkBytesLast14Days: 1024,
          instanceId: 'three-idle-days',
          instanceType: 'm6i.large',
          lowUtilizationDays: 3,
          observedDays: 3,
          region: 'us-east-1',
        },
        {
          accountId: '123456789012',
          averageCpuUtilizationLast14Days: 80,
          averageDailyNetworkBytesLast14Days: 1024,
          instanceId: 'complete-pass',
          instanceType: 'm6i.large',
          lowUtilizationDays: 0,
          observedDays: 14,
          region: 'us-east-1',
        },
      ],
    });
    const ec2Rule = rule('CLDBRN-AWS-EC2-5');

    expect(ec2Rule.evaluateLive?.(input)?.findings).toEqual([match('four-idle-days')]);
    expect(ec2Rule.getLiveEvaluationCoverage?.(input)).toEqual({
      assessed: [match('four-idle-days'), match('complete-pass')],
      unknown: [match('three-idle-days'), match('missing')],
    });
  });
});
