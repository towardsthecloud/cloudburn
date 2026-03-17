import { describe, expect, it } from 'vitest';
import { ecsLowCpuUtilizationRule } from '../src/aws/ecs/low-cpu-utilization.js';
import type { AwsEcsCluster, AwsEcsClusterMetric } from '../src/index.js';
import { LiveResourceBag } from '../src/index.js';

const createCluster = (overrides: Partial<AwsEcsCluster> = {}): AwsEcsCluster => ({
  accountId: '123456789012',
  clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
  clusterName: 'production',
  region: 'us-east-1',
  ...overrides,
});

const createClusterMetric = (overrides: Partial<AwsEcsClusterMetric> = {}): AwsEcsClusterMetric => ({
  accountId: '123456789012',
  averageCpuUtilizationLast14Days: 4.2,
  clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
  clusterName: 'production',
  region: 'us-east-1',
  ...overrides,
});

describe('ecsLowCpuUtilizationRule', () => {
  it('flags ECS clusters with sustained low CPU utilization', () => {
    const finding = ecsLowCpuUtilizationRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ecs-clusters': [createCluster()],
        'aws-ecs-cluster-metrics': [createClusterMetric()],
      }),
    });

    expect(finding).toEqual({
      ruleId: 'CLDBRN-AWS-ECS-2',
      service: 'ecs',
      source: 'discovery',
      message: 'ECS clusters should be reviewed when average CPU utilization stays below 10% for the previous 14 days.',
      findings: [
        {
          accountId: '123456789012',
          region: 'us-east-1',
          resourceId: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
        },
      ],
    });
  });

  it('skips clusters with incomplete CloudWatch history', () => {
    const finding = ecsLowCpuUtilizationRule.evaluateLive?.({
      catalog: {
        indexType: 'LOCAL',
        resources: [],
        searchRegion: 'us-east-1',
      },
      resources: new LiveResourceBag({
        'aws-ecs-clusters': [createCluster()],
        'aws-ecs-cluster-metrics': [createClusterMetric({ averageCpuUtilizationLast14Days: null })],
      }),
    });

    expect(finding).toBeNull();
  });
});
